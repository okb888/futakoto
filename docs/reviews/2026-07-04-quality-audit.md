# ふたこと 全体品質監査 2026-07-04

**実施**: Claude Code (Fable 5) によるコードベース全読監査
**対象**: app/ · components/ · hooks/ · lib/ · functions/src/ · firestore.rules · app.json · web/ · docs/
**判定基準**: 「2026-08-31までに月額¥500の課金が1人発生する」に効くかどうかで優先度付け
**既出除外**: docs/reviews/ の既存レビュー5本・archive/done.md と突合済み。既知項目は「既知」と明記し、新規発見には **[NEW]** を付けた。

> ⚠️ このレポートはコード監査。実機でしか分からない問題（タップ感・通知実挙動・Sandbox課金）は対象外。

---

## サマリー

| 優先度 | 件数 | 一言 |
|---|---|---|
| **P0 課金ゼロ/審査落ち直結** | 6件 | うち3件は新規発見。**現ビルドは課金が構造的に成立しない** |
| **P1 転換率・審査後の体験** | 6件 | 無料→有料の導線を壊すバグ1件(新規)を含む |
| **P2 品質・開発効率** | 8件 | ドキュメント乖離が深刻。次のAI開発セッションの事故の温床 |
| 確認済み・問題なし | 8項目 | セキュリティ基盤は堅牢 |

---

## P0 — これを直すまで課金は1件も発生しない

### P0-1 [NEW] 課金SDKが初期化されておらず、購入が全て「準備中」エラーになる

- **根拠**: [lib/purchases.ts:18](../../lib/purchases.ts#L18) の `configurePurchases(uid)` が**アプリのどこからも呼ばれていない**（grep で定義のみ確認）。`configured` が false のまま → `isPurchasesConfigured()` が常に false → [purchasePremium()](../../lib/purchases.ts#L73) は常に `課金機能は現在準備中です` を返す。
- **影響**: PaywallModal の「プレミアムを始める」は100%失敗。**Sandbox検証も本番課金も成立しない**。さらに PaywallModal 下部に「※ 開発中：…購入処理は無効です」が常時表示される。
- **推奨対応**: 認証確立後に1回呼ぶ。`app/_layout.tsx` の RootGuard で `user` が確定したタイミングに `configurePurchases(user.uid)` を追加（ログアウト→別ユーザーログイン時の `logIn/logOut` 切替も考慮）。
- **工数**: 小（10行程度）＋ Sandbox 実機確認

### P0-2 F8の根本原因特定: AI壁打ち空返答は「スキーマとコードのキー名不一致」

- **根拠**:
  - [functions/src/shared.ts:245-252](../../functions/src/shared.ts#L245-L252) — `CONSULT_SCHEMA` は Gemini に `{ reflection, readyForDraft }` の生成を**強制**（responseSchema）
  - [functions/src/ai-functions.ts:316](../../functions/src/ai-functions.ts#L316) — コードは `return { reply: json.reply }` を返す（プロンプト文面は `"reply"` を要求しているが、responseSchema が優先される）
- **影響**: `json.reply` は**常に undefined** → クライアントの `nextResult.reply` が空 → 空カード表示。7/1実機バグ「AI壁打ちで本文が空」(F8) と完全に一致する再現メカニズム。
- **推奨対応**:
  1. キー名をどちらかに統一（スキーマを `reply` にするのが差分最小。逆にスキーマの `reflection`/`readyForDraft` に合わせるなら ai-functions.ts とプロンプト文面を修正）
  2. 全AI関数共通で「必須キーが欠落 or trim後空文字なら `HttpsError('internal')`」のバリデーションを追加（F8完了条件の「空レスポンスを正常扱いしない」）
  3. デプロイ: `firebase deploy --only functions:aiConsult`
- **補足**: スキーマにある `readyForDraft` は現在未使用。本来「そろそろ文案を作りましょう」誘導の判定に使える設計意図が見えるので、直すついでに活用を検討。
- **工数**: 小〜中

### P0-3 [NEW] メール/パスワードログインが消失している（意思決定が必要）

- **根拠**: [app/login.tsx](../../app/login.tsx) は Apple / Google ボタンのみ。メール+パスワードのフォームが存在しない。一方 docs（AGENTS.md・done.md・UX分析）は「メール/Google/Apple 並列」のまま。
- **影響**:
  1. **既存のメール/パスワード登録ユーザー（βテスターや自分のテストアカウント含む）は、新端末・再インストール後にログイン不能**
  2. **App Store審査のデモアカウント（M2: ペアリング済みメール+パス2アカウント）が提供できない**。ペア体験が審査で確認できず、リジェクトリスク
  3. [settings/account.tsx:186-190](../../app/(app)/settings/account.tsx#L186-L190) は「メール / パスワード 連携中」を**全ユーザーに無条件表示**しており、Apple/Googleのみのユーザーには虚偽表示
- **推奨対応**: どちらかを明示的に決める。
  - **案A（推奨）**: メールログインを復活（審査用デモアカウント問題が消える。フォームは折りたたみ表示で「その他の方法」でもよい）
  - **案B**: ソーシャルのみを貫く → App Review Information にその旨を記載し、審査員向けの説明とレビュー用の実動画/ペア説明を用意。account.tsx の虚偽表示を修正。既存メールユーザーの移行手段を用意
- **工数**: 案Aなら中、案Bなら小＋審査リスク受容

### P0-4 [NEW] 存在しない機能「気持ちを読み解く」を課金の目玉として販売している

- **根拠**: `aiInterpret` を呼ぶUIが**アプリ内に存在しない**（grep で呼び出しゼロ。ホーム画面刷新時に消失した模様）。しかし:
  - [components/PaywallModal.tsx:33](../../components/PaywallModal.tsx#L33) — 「相手の投稿の『気持ちを読み解く』 無制限」
  - [app/(app)/settings/premium.tsx:71](../../app/(app)/settings/premium.tsx#L71) — 同上
  - [components/AiConsentModal.tsx:24](../../components/AiConsentModal.tsx#L24) — AI機能一覧に記載
- **影響**: 実在しない機能を根拠に課金させる状態。App Store Guideline 2.3.1（誇大表示）リスク＋購入後クレーム・返金要因。Cloud Functions 側は生きているので、UIを戻せば即機能する。
- **推奨対応**: ホームのパートナー投稿カードに「気持ちを読み解く」ボタンを復活させる（旧実装は git 履歴にあり: `interpretationsCache` + カード下部展開UI）。差別化の核となる機能なので**復活を強く推奨**。削るなら3箇所のコピーを同時に削除。
- **工数**: 中（復活） / 小（コピー削除）

### P0-5 [NEW] AI同意モーダルのプライバシーポリシーリンクが未登録ドメイン

- **根拠**: [components/AiConsentModal.tsx:37](../../components/AiConsentModal.tsx#L37) が `https://futakoto.app/privacy.html` を開く。**futakoto.app は NXDOMAIN（未登録ドメイン）**（2026-07-04 に DNS 確認済み）。正しくは `https://futakoto.jp/privacy`（動作確認済み・200）。
- **影響**: AIデータ送信の同意取得フローで根拠文書に飛べない＝同意の有効性が弱い＋審査で発見されれば確実に指摘。第三者が futakoto.app を取得すればフィッシング誘導にもなる。
- **推奨対応**: 1行修正で `https://futakoto.jp/privacy` へ。ついでにアプリ内の外部URLを定数ファイルに集約（現在 futakoto.jp / futakoto.app / mailto が3ファイルに散在）。
- **工数**: 極小

### P0-6 F3: ログイン画面に利用規約・プライバシーポリシー導線がない（既知・未実装）

- **根拠**: [app/login.tsx](../../app/login.tsx) にリンクなし。fixplan 2026-05-17 の F3 が未実装のまま。
- **影響**: 審査要件（ログイン前にポリシー確認可能であること）。Apple/Google ログインのみになった今、「続けることで規約に同意」文言はむしろ必須度が上がった。
- **推奨対応**: fixplan F3 のコードをそのまま適用（URLは `https://futakoto.jp/terms` / `/privacy` に読み替え）。
- **工数**: 極小

---

## P1 — 審査通過後、課金転換と継続率に直撃する

### P1-1 [NEW] 無料枠の30日リセットがクライアントで無視され、無料ユーザーが実質永久ロックされる

- **根拠**: サーバは `aiQuotaResetAt` 経過後に `aiCreditsUsed` を 0 に戻す（[functions/src/shared.ts:185-188](../../functions/src/shared.ts#L185-L188)）が、**リセットはAI関数が呼ばれた時にしか実行されない**。一方クライアントは:
  - [app/(app)/consult.tsx:93-99](../../app/(app)/consult.tsx#L93-L99) — `aiCreditsUsed >= 5` なら**サーバを呼ばずに** Paywall を表示（＝リセット処理に到達できない）
  - [components/AiQuotaChip.tsx:34](../../components/AiQuotaChip.tsx#L34)・[settings/index.tsx:112](../../app/(app)/settings/index.tsx#L112)・[settings/premium.tsx:28](../../app/(app)/settings/premium.tsx#L28) — いずれも `aiQuotaResetAt` を見ずに残数表示
- **影響**: 月5回を使い切った無料ユーザーは、30日経過後も壁打ちタブでは「AI上限」のまま。**「無料で試す→気に入って課金」の導線が2ヶ月目以降死ぬ**。表示上も「残り0」が出続け不信感を生む。
- **推奨対応**: `lib/profile.ts` に `getEffectiveAiCredits(profile)` を作り、`aiQuotaResetAt < now` なら used=0 として扱う。consult の事前チェック・チップ・設定2画面の4箇所をこれに置換。（Premium判定も現在3ファイルに同一ヘルパーがコピペされているので、同時に `isPremiumActive` を lib/profile.ts へ一本化 — 既知のアーキ懸念）
- **工数**: 小〜中

### P1-2 F9: プレミアムユーザーに購入CTAが出る（既知・未修正）

- **根拠**: [app/(app)/consult.tsx:78-86](../../app/(app)/consult.tsx#L78-L86) — ヘッダーの AiQuotaChip はプレミアムでも「無制限」チップを表示し、**タップすると PaywallModal（「プレミアムを始める」ボタン付き）が開く**。
- **推奨対応**: プレミアム時はチップを非タップ化するか、タップ先を `settings/premium`（加入中表示）に変更。
- **工数**: 極小

### P1-3 F7後半: カレンダーのスワイプ月替えが未実装（既知・部分対応）

- **根拠**: [app/(app)/calendar.tsx:858](../../app/(app)/calendar.tsx#L858) の `<Calendar>` に `enableSwipeMonths={true}` がない。「今月」ボタンはカレンダー下部に移動済みでヘッダー被りは解消された可能性が高い（要実機確認）。
- **工数**: 極小（prop 1つ。ただし `dayComponent` 使用時のスワイプ挙動と `onMonthChange` の整合を実機確認）

### P1-4 F2: 通知タップが常にホームに飛ぶだけ（既知・未実装）

- **根拠**: [app/_layout.tsx:35-37](../../app/_layout.tsx#L35-L37)。`entryId`/`authorUid` は通知 payload に入っているのに未使用。fixplan F2 の実装案がそのまま使える。

### P1-5 F4: BILLING_ISSUE の通知UIなし（既知・未実装）

- **根拠**: Webhook は `premiumState: 'billing_issue' | 'grace'` を書くが（[functions/src/revenuecat-webhook.ts:189-201](../../functions/src/revenuecat-webhook.ts#L189-L201)）、クライアントの `UserProfile` 型（lib/db.ts）に `premiumState` フィールド自体がなく、読む画面もない。サイレント解約の温床。fixplan F4 の実装案が有効。

### P1-6 F6: Google/Appleユーザーの削除前再認証なし（既知・未実装）

- **根拠**: [app/(app)/settings/account.tsx:115-139](../../app/(app)/settings/account.tsx#L115-L139) — password のみ再認証。ソーシャルユーザーはセッションが古いと `auth/requires-recent-login` の生メッセージで失敗。アカウント削除は審査必須機能なので、審査員が触る可能性がある。

### P1-7 「伝える文を作る」1操作で無料枠を2消費する（既知アーキ懸念・未対応）

- **根拠**: `aiDraftOptions`（[ai-functions.ts:339](../../functions/src/ai-functions.ts#L339)）と `aiDraft`（[ai-functions.ts:410](../../functions/src/ai-functions.ts#L410)）がそれぞれ `consumeAiQuota(uid, 'aiConsult')` を呼ぶ。UIの「別の伝え方」「もう一度作る」も1回ずつ消費。
- **影響**: 月5回の無料ユーザーは「壁打ち1回(1) + 文案化(2)」で3消費。体験の核心を1回半しか試せずに上限到達 → 「無料が薄すぎて価値を感じる前に壁」になる。R10（無料が便利すぎる）とは逆向きのリスクで、こちらの方が現実的。
- **推奨対応**: `aiDraftOptions` を消費0にする（選択肢提示は準備動作であり価値提供は aiDraft 側）か、セッション単位で「文案化は初回のみ消費」にする。判断は課金設計に関わるためオーナー判断。

---

## P2 — 品質・整合性・開発効率

| # | 内容 | 根拠 | 対応 |
|---|---|---|---|
| P2-1 [NEW] | **ホームの星ボタンが死んでいる**: `onToggleFavorite={() => {}}` を渡しているため星が表示されタップ可能に見えるが何も起きない | [index.tsx:248,273](../../app/(app)/index.tsx#L248) | prop を渡さない（星非表示）か、本実装する |
| P2-2 [NEW] | **favorites.tsx がオーファン画面**: どこからも遷移導線がない（タブ非表示 + push なし）。ログの「★お気に入りのみ」フィルタと機能重複 | [app/(app)/_layout.tsx:69](../../app/(app)/_layout.tsx#L69) | 設定 or 振り返りに導線を足すか、画面を削除して一本化 |
| P2-3 [NEW] | **calendar の `load()` に try/catch がない**: 通信失敗で `setLoading(false)` に到達せず無限スピナー | [calendar.tsx:177-213](../../app/(app)/calendar.tsx#L177-L213)（`loadLog` にはある） | try/finally 追加 |
| P2-4 [NEW] | **index.tsx(ルート) が死にファイル**: `main` は `expo-router/entry` であり未使用。app本体の tsc エラーはこの1件のみ | [index.ts:3](../../index.ts#L3) | 削除。あわせて tsconfig で `eval/`・`functions/` を exclude すれば `tsc --noEmit` がクリーンになりCI化できる |
| P2-5 [NEW] | **consult.tsx の同意ハンドラが Fix1 と同じバグパターン**: `finally` 内で `handleConsult()` — 同意保存が失敗してもAIが実行される（post.tsx は修正済み） | [consult.tsx:110-122](../../app/(app)/consult.tsx#L110-L122) | post.tsx と同じ形（成功時のみ実行）に統一 |
| P2-6 | Fix5 未適用: calendar の AI要約 catch が `classifyError` を使わない（AI要約がプレミアム専用化されたため実害は小） | [calendar.tsx:455-457](../../app/(app)/calendar.tsx#L455-L457) | ついでの時に統一 |
| P2-7 [NEW] | OnboardingModal がローカル COLORS 定数を持ち lib/theme.ts と二重管理 | [OnboardingModal.tsx:23-31](../../components/OnboardingModal.tsx#L23-L31) | theme に統一 |
| P2-8 | パートナー投稿500件を毎フォーカス全件取得（既知 P3-1） | [calendar.tsx:201,283](../../app/(app)/calendar.tsx#L201) | β後のコスト最適化で対応 |

### AI品質（次テーマ「AI要約・壁打ち精度向上」への具体インプット）

プロンプト自体の品質は高い（eval C案の思想＝感情ラベルを貼らない・書いていないことを補わない・葛藤を薄めない、が3ペルソナとも few-shot 込みで反映されている）。改善余地は プロンプトよりデータの渡し方 にある:

1. **aiSummary に時系列情報が渡っていない**: 入力が `[気分N] memo` の羅列で日付がない。「気分の波・流れ」を要約させたいのに波を推定する材料がない。`[7/03 気分4] ...` のように日付を付けるだけで月次要約の質が上がるはず（送信文字数への影響は小）。
2. **`readyForDraft` フラグが未使用**（P0-2参照）: 壁打ち→文案化への自然な誘導タイミングをAIに判定させる設計意図が実装されていない。
3. **aiDraftOptions がユーザー入力のみで AI の reflection を使わない**: 会話で深まった内容が選択肢生成に反映されない。意図的（ユーザーの言葉を優先）なら現状維持でよいが、eval で比較する価値あり。

---

## 既知タスクとの突合結果

### fixplan 2026-05-17 (F1-F9)

| ID | 状態 | 備考 |
|---|---|---|
| F1 aiSummaries削除漏れ | **修正不要（fixplanの誤り）** | `aiSummaries` コレクションはどこにも書き込まれていない（要約はキャッシュのみでFirestore未保存）。grep 全域0件 |
| F2 通知ディープリンク | ❌ 未実装 | P1-4 |
| F3 ログイン画面ポリシー導線 | ❌ 未実装 | P0-6 |
| F4 BILLING_ISSUE UI | ❌ 未実装 | P1-5 |
| F5 レビュー依頼 | ❌ 未実装 | 「レビューで応援」行自体が設定画面から消えている。expo-store-review も未インストール。リリース後でよい |
| F6 ソーシャル削除再認証 | ❌ 未実装 | P1-6 |
| F7 カレンダー月送り | 🟡 部分対応 | ボタン配置は変更済み・スワイプ未実装（P1-3） |
| F8 壁打ち空返答 | ❌ 未修正・**根本原因特定済み** | P0-2 |
| F9 課金チップ | ❌ 未修正 | P1-2 |

### CODEX-TASK (Fix 1-6)

| ID | 状態 |
|---|---|
| Fix1 post.tsx finally | ✅ 適用済み（ただし consult.tsx に同パターン残存 = P2-5） |
| Fix2 deleteAccount invoker | ✅ 適用済み |
| Fix3 inviteCodes get/list | ✅ 適用済み |
| Fix4 チップ期限判定 | ✅ 適用済み |
| Fix5 calendar classifyError | ❌ 未適用（実害小 = P2-6） |
| Fix6 timingSafeEqual | ✅ 適用済み |

---

## ドキュメント乖離（次のAIセッションの事故防止に更新推奨）

AGENTS.md / CLAUDE.md の記述が現コードと大きくズレている。AIが書く前提のプロジェクトでは、**古いハンドオフは次のセッションが古い仕様で上書きするリスク**そのもの。

- 「認証: メール+パスワード」→ 現在はApple/Googleのみ（P0-3の決定後に反映）
- 「ホーム: FAB + 気持ちを読み解くボタン」→ 現在はインライン投稿カード。aiInterpret UIなし
- 「aiConsult 出力: `{reflection, messageDraft}`」→ 現在は `{reply}`（そしてスキーマは `{reflection, readyForDraft}` — P0-2）
- 「通知の連続抑制1時間」→ 実装は5分（[shared.ts:24](../../functions/src/shared.ts#L24)）
- 「lib/firebase.ts の型エラーで tsc 失敗」→ 解消済み。現在の失敗要因は eval/・functions テストの tsconfig 混入と index.ts のみ
- release-status.md の「PaywallModal リンク futakoto.jp DNS未設定」前提 → DNSは有効化済み（本監査で確認）

## LP（futakoto.jp）

- バナーが「2026年6月リリース予定」のまま（既に7月）。日付の更新か「まもなく」表現へ [NEW]
- 既知の未対応: 実機スクショ0枚 / 「無料で使える・AI月5回無料」の明示なし / SNSリンク未設置
- 集客未着手（SNS 3媒体とも投稿0）が8/31目標の最大リスクである点は UX 5layer 分析の指摘どおり変化なし

---

## 確認済み・問題なし（変更不要）

- Firestoreルール: inviteCodes の列挙禁止、サーバ管理フィールド（premium/aiCredits/partnerUid）のクライアント書込禁止、パートナー共有の visibility 強制 ✅
- AIクォータ: サーバサイドトランザクションで強制。クライアント改ざん不可 ✅
- RevenueCat Webhook: timing-safe 比較・grace period・ペア連鎖の設計 ✅
- プロンプトインジェクション対策: `wrapUserData` のタグ無効化 + 上位指示優先の明示 ✅
- 危機ワード検知 → 専用ダイアログ（よりそいホットライン）✅
- Apple Sign-in の nonce（rawNonce→SHA256→Firebase照合）✅
- ペアリング/解除/アカウント削除時の相互データクリーンアップ（favorites・interpretationCache）✅
- App Privacy Manifest・Info.plist の目的文字列 ✅

---

## 推奨実行順（1セッション=1行のつもりで）

1. **即日ワンライナー級**: P0-5（同意モーダルURL）→ P0-6（ログイン画面リンク）→ P1-2（チップ）→ P1-3（スワイプ）
2. **課金を生き返らせる**: P0-1（configurePurchases 配線）→ Sandbox検証（M10）
3. **コア機能を生き返らせる**: P0-2（F8キー不一致修正+空文字ガード+デプロイ）
4. **オーナー判断が必要**: P0-3（ログイン方式）/ P0-4（読み解く復活 or コピー削除）/ P1-7（2消費問題）
5. **転換率保護**: P1-1（30日リセットのクライアント反映 + Premium判定一本化）
6. **残りのF系**: F2 / F4 / F6 → build 19 → 実機スモーク → 審査提出
7. **並行**: AGENTS.md 更新・LPバナー日付・P2群
