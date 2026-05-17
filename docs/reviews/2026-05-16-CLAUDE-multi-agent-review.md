# 「ふたこと」マルチエージェント コードレビュー

> **生成ツール:** Claude Code（claude-sonnet-4-6） — 8エージェント並列実行  
> **実施日:** 2026-05-16  
> **対象コミット:** main ブランチ（2026-05-16時点）  
> **目的:** App Store 審査提出（2026-05-31）前の最終品質確認

---

## サマリー表

| エージェント | 🔴必須 | 🟡重要 | 🟢推奨 |
|---|---|---|---|
| セキュリティ | 1 | 7 | 13 |
| バグ | 4 | 6 | 3 |
| バックエンド | 4 | 6 | 4 |
| フロントエンド | 5 | 12 | 2 |
| リリース | 2 | 4 | 3 |
| UX | 8 | 10 | 7 |
| アクセシビリティ | 17 | 13 | 0 |
| アナリティクス | 4 | 1 | 5 |
| **合計** | **45** | **59** | **37** |

---

## App Store審査提出 最終判定

### 判定: **HOLD**

**理由:** EXPO_PUBLIC_REVENUECAT_IOS_KEY 未設定と審査用アカウント未準備が解消されない限り、課金機能が審査官に届かずリジェクト確実。PaywallModal の accessibilityViewIsModal 未設定も課金UI審査で指摘されるリスクが「高」。

---

## 今すぐ直すべきTOP5

### 🔴 TOP1 — `maxInstances` が全Cloud Functions に未設定

**[functions/src/shared.ts:17-21]**

- **問題:** `AI_FUNCTION_OPTIONS` / `PAIR_OPTIONS` に `maxInstances` がなく、デフォルト最大1000が適用されている。
- **リスク:** Bot攻撃・バグループで Gemini API 費用が数十万円規模で爆発する。
- **修正:**

```ts
export const AI_FUNCTION_OPTIONS = {
  secrets: [GEMINI_API_KEY],
  region: REGION,
  invoker: 'public',
  maxInstances: 10,
  concurrency: 5,
  timeoutSeconds: 30,
};
```

---

### 🔴 TOP2 — `EXPO_PUBLIC_REVENUECAT_IOS_KEY` が production ビルドに未設定（審査提出ブロッカー）

**[eas.json:build.production.env]**

- **問題:** キー未設定のまま production ビルドすると PaywallModal に「開発中：課金設定が完了するまで購入処理は無効です」が表示され購入ボタンも動作しない。
- **修正:**

```bash
eas secret:create --scope project \
  --name EXPO_PUBLIC_REVENUECAT_IOS_KEY \
  --value appl_xxxxxxxxxxxxxxxxxx
```

---

### 🔴 TOP3 — 審査用ペアリング済みデモアカウントの未準備

**[App Store Connect 審査メモ]**

- **問題:** 審査官は1人でテストするため、ペアリング前状態ではAI相談・気持ちを読み解く・パートナー投稿がすべて動かない。
- **対応:**
  1. テストアカウント2件を作成し事前ペアリング
  2. App Store Connect の審査メモに「ログイン情報 / 相手アカウントとペアリング済み」と記載

---

### 🔴 TOP4 — AI関数全6箇所で `e.message` をクライアントに返却（情報漏洩）

**[functions/src/ai-functions.ts:63, 288, 356, 432, 524, 614]**

- **問題:** `e.message` にGemini APIのエラー詳細（APIキー情報・内部パス等）が含まれる可能性があり、クライアントに丸ごと返されている。
- **修正（全6箇所）:**

```ts
// Before（危険）
throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);

// After（安全）
logger.error('AI error', { fn: 'aiRewrite', error: e.message });
throw new HttpsError('internal', 'AI処理に失敗しました');
```

---

### 🔴 TOP5 — コア計測3点がリリース前に未実装（KPI計測不能）

**[settings/partner.tsx, app/(app)/index.tsx, app/(app)/calendar.tsx]**

- **問題:** 関数定義はあるが呼び出しがゼロ:
  - `trackPairCompleted()` — ペアリング成功率（コアKPI）
  - `trackAiFeatureUsed('interpret')` — 「気持ちを読み解く」利用率
  - `trackAiFeatureUsed('summary')` — 月次要約利用率
- **修正（各1行追加）:**

```ts
// partner.tsx: ペアリング成功後
trackPairCompleted();

// index.tsx: interpret成功後
trackAiFeatureUsed('interpret');

// calendar.tsx: summary成功後
trackAiFeatureUsed('summary');
```

---

## 提出前の必須作業リスト

| 優先度 | 作業 | 担当 |
|---|---|---|
| 🔴 即時 | EAS Secret に `EXPO_PUBLIC_REVENUECAT_IOS_KEY` を登録 | インフラ |
| 🔴 即時 | 審査用ペアリング済みアカウントを準備し、App Store Connectに記載 | 運用 |
| 🔴 即時 | Cloud Functions に `maxInstances: 10` + `timeoutSeconds: 30` を追加 | バックエンド |
| 🔴 即時 | AI関数6箇所の `e.message` クライアント返却を削除 | バックエンド |
| 🔴 即時 | `PaywallModal` / `AiConsentModal` / `consult.tsx Modal` に `accessibilityViewIsModal={true}` | フロント |
| 🔴 即時 | 閉じるボタン・主要アクションボタンに `accessibilityLabel` + `accessibilityRole` を追加 | フロント |
| 🔴 提出前 | Cloud Functions `deleteAccount` でApple revoke token APIを呼んでいるか確認 | バックエンド |
| 🔴 提出前 | `futakoto.app/privacy.html` と `futakoto.app/terms.html` の疎通確認 | 運用 |
| 🔴 提出前 | `pair_completed` / `ai_interpret` / `ai_summary` の計測追加 | フロント |
| 🔴 提出前 | `Sentry.setUser({ id: user.uid })` を `RootGuard` に追加 | フロント |
| 🟡 推奨 | `lib/theme.ts` の `textWeak`(#AAA)・`textMuted`(#888) を `#767676` 以上に変更 | デザイン |
| 🟡 推奨 | `aiConsult` のターン数チェックを `consumeAiQuota` トランザクション内に移動 | バックエンド |
| 🟡 推奨 | `post.tsx` の同意失敗時のAI実行バグを修正（`finally` → `success`フラグ方式） | フロント |
| 🟡 推奨 | 削除ボタン（EntryActionPanel）を 38×38 → 44×44pt に拡大 | デザイン |
| 🟡 推奨 | EAS Secret に `EXPO_PUBLIC_SENTRY_DSN` と `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` を登録 | インフラ |

---

## 各エージェント詳細レポート

---

### Agent 1 — セキュリティエンジニア

**セキュリティ問題 合計: 🔴1件 🟡7件 🟢13件**

🔴 **[ai-functions.ts:63,288,356,432,524,614] AI エラーメッセージに内部エラーが含まれる**
- 問題: `catch (e: any) { throw new HttpsError('internal', \`AI処理に失敗しました: ${e.message}\`) }` が全AI関数に存在。Gemini API のエラー詳細がクライアントに返される。
- 攻撃シナリオ: 不正リクエストでシステム内部構造・使用モデル・APIエンドポイントを収集できる。
- 修正: `throw new HttpsError('internal', 'AI処理に失敗しました')` として `e.message` を含めず、ログのみに出力する。

🟡 **[firestore.rules:6-9] inviteCodes collection が認証済み全員に対して列挙可能**
- 問題: `allow read: if request.auth != null` で、6文字英数字のコードを総当たり可能。UIDのマッピングが収集できる。
- 修正: `inviteCodes` の read を Cloud Functions 経由のみ（`allow read: if false`）にする。

🟡 **[firestore.rules:41-44 / pairing.ts:78-112] pairWithCode が一方的なペアリングを許可**
- 問題: 相手の同意なく一方的にペアを設定でき、ペアリング後すぐに shared エントリが読める。
- 修正: 招待コードに24時間の有効期限を設けて使い捨て化する。

🟡 **[shared.ts:153-155] isPremiumUser のTOCTOU（Time-of-check Time-of-use）**
- 問題: `consumeAiQuota` でPremiumチェックがトランザクション外で行われる。
- 修正: `isPremiumUser` のロジックをトランザクション内に移動する。

🟡 **[ai-functions.ts:393-395] communicationStyle が wrapUserData なしでプロンプトに挿入**
- 問題: クライアント入力がラップなしでプロンプトに直接埋め込まれる。
- 修正: `wrapUserData(communicationStyle)` でラップするか、enum選択式にする。

🟡 **[ai-functions.ts:442-484] aiInterpret のキャッシュチェックと権限チェックの順序が逆**
- 問題: キャッシュ確認が権限チェックより先に行われている。現状は安全だが将来の修正で誤解を招くリスク。
- 修正: コメントで安全理由を明記する。

🟡 **[revenuecat-webhook.ts:91-105] Webhook 認証に timingSafeEqual 未使用**
- 問題: 文字列比較 `provided !== expected` は timing attack に脆弱。
- 修正: `crypto.timingSafeEqual` を使う。

🟡 **[shared.ts:133-151] isPremiumUser のパートナー連鎖に削除済みユーザー問題**
- 問題: `deleteAccount` の `.catch(() => {})` でエラーを握り潰しており、`partnerUid` が残存する可能性がある。
- 修正: エラーを `logger.error` で可視化する。

---

### Agent 2 — バグハンター（QAエンジニア）

**バグ合計: 🔴4件 🟡6件 🟢3件**

🔴 **[post.tsx:202-210] handleAgreeConsent — 同意失敗時もAIリライトが実行される**
- 再現条件: `setAiConsentAcknowledged()` が Firestore エラーで失敗したとき。`finally` ブロックで `runAiRewrite()` が実行される。
- 影響: 同意未記録のままAI機能が走る。
- 修正案:
```ts
async function handleAgreeConsent() {
  if (!user) return;
  let success = false;
  try {
    await setAiConsentAcknowledged(user.uid);
    await refreshProfile();
    success = true;
  } catch (e: any) {
    Alert.alert('エラー', firebaseErrorMessage(e));
  } finally {
    setConsentOpen(false);
  }
  if (success) await runAiRewrite();
}
```

🔴 **[useConsultSession.ts:157-200] handleConsult — 冒頭の loading チェックがなく二重セッション作成**
- 再現条件: `loading` が `true` のとき `handleConsult` が直接呼ばれると `sessionId` が null のままで2つ目のセッションが作られる。
- 影響: Firestoreに孤立したセッションが量産される。
- 修正案: `handleConsult` 冒頭に `if (loading) return;` を追加する。

🔴 **[calendar.tsx:209-259] load() — try/catch が抜けておりスピナーが永続**
- 再現条件: `await Promise.all(...)` でエラーが発生した場合に `setLoading(false)` が呼ばれない。
- 影響: ロード中のスピナーが永続し画面操作不能。
- 修正案: `load()` 全体を `try/finally { setLoading(false) }` で囲む。

🔴 **[index.tsx:137-141] onRefresh — isCancelled フラグなしで load() を呼ぶ**
- 再現条件: pull-to-refresh 後すぐに画面から離脱する。
- 影響: アンマウント後に `setRefreshing(false)` や各 `setState` が呼ばれる。
- 修正案: `useFocusEffect` の `cancelled` フラグを `useRef` に昇格させて `onRefresh` でも参照する。

🟡 **[useConsultSession.ts:118-142] useFocusEffect の load — アンマウント後に setState が呼ばれる可能性**
🟡 **[calendar.tsx:261-273] useFocusEffect — 月変更のたびに全データが再取得される**
🟡 **[post.tsx:127-140] isCancelled フラグなし**
🟡 **[calendar.tsx:556-561 / index.tsx:143-149] handleToggleVisibility / handleDelete — エラー処理なし**
🟡 **[useConsultSession.ts:264-276] handleToggleFavorite — キャンセルフラグなし**
🟡 **[db.ts:408-426] toggleFavoriteEntry — 楽観的更新の整合性問題**

🟢 **[post.tsx:371-384] TextInput IME確定前送信の潜在リスク**
🟢 **[db.ts:33-43] Entry.createdAt が null になりうる**
🟢 **[calendar.tsx:711] session.id が undefined のとき空文字でルート遷移**

---

### Agent 3 — バックエンドエンジニア（Firebase / Cloud Functions）

**バックエンド問題 合計: 🔴4件 🟡6件 🟢4件**

🔴 **[shared.ts:153-216] consumeAiQuota でトランザクション外の isPremiumUser 呼び出し（TOCTOU）**
- 問題: Premium判定と消費カウントの間に TOCTOU 競合が発生する。
- 修正: `isPremiumUser` のロジックをトランザクション内に移動する。

🔴 **[ai-functions.ts:258-290] aiConsult のターン数チェックと consumeAiQuota が別トランザクション**
- 問題: 並列リクエストが来た場合、両方が `turns.length >= MAX_CONSULTATION_TURNS` を通過してしまう。
- リスク: 10ターン制限が機能せずコスト増加。
- 修正: セッションのターン数チェックを quota トランザクション内に含める。

🔴 **[shared.ts:408-421] Gemini API にタイムアウト設定が存在しない**
- 問題: デフォルトタイムアウトがなく、Cloud Functions の最大実行時間（60秒）まで待機する。
- リスク: 1リクエストで最大60秒分の課金が発生。
- 修正: `timeout: 15000` を `getGenerativeModel` のリクエストオプションに追加する。

🔴 **[shared.ts:17-21] maxInstances が全関数で未設定**
- 問題: Cloud Functions v2 のデフォルト最大1000インスタンスが適用されている。
- リスク: コスト爆発。
- 修正: `maxInstances: 10` / `timeoutSeconds: 30` を追加する。

🟡 **[pairing.ts:115-153] unpairPartner でトランザクション外に mySnap を読んでいる**
🟡 **[ai-functions.ts:60-65,281-289,353-358] JSON パース失敗時のフォールバックが不十分**
🟡 **[shared.ts:26-31] AI_DAILY_TOTAL_LIMIT（50回）と各機能合計（90回）の整合性**
🟡 **[ai-functions.ts:529-617] aiSummary でクライアントから entries を全件受け取る設計**
🟡 **[revenuecat-webhook.ts:79-84] timingSafeEqual 未使用**
🟡 **[ai-functions.ts:442-484] aiInterpret のキャッシュ・権限チェック順序**

🟢 招待コードの二重使用は防止されている
🟢 wrapUserData の適用漏れなし
🟢 Secret Manager の参照は正しく defineSecret を使っている
🟢 全 httpsCallable 関数で先頭に request.auth チェックがある

---

### Agent 4 — フロントエンドエンジニア（React Native / Expo）

**フロントエンド問題 合計: 🔴5件 🟡12件 🟢2件**

🔴 **[calendar.tsx:133-174] useState が1コンポーネントに22個以上集中**
- 問題: 任意の state 変更でコンポーネント全体が再レンダリングされる。
- 修正案: ログフィルター群は `useReducer` でまとめる。AI要約・ペイウォール関連は別コンポーネントへ分離する。

🔴 **[index.tsx:316 / calendar.tsx:789,1178] ScrollView + map でリスト描画（FlatList 未使用）**
- 問題: `logRecords.map`（最大500件）が `ScrollView` 内で全件レンダリングされる。
- 修正案: ログビューの `logRecords.map` 部分を `FlatList` に置き換える。

🔴 **[calendar.tsx:238] `getPartnerSharedEntries(p.partnerUid, 500)` で500件一括取得**
- 問題: パートナーエントリを500件 getDocs で一括取得し、毎回フィルタリングしている。
- 修正案: 月単位クエリ（`getEntriesInRange`）に変更する。

🔴 **[index.tsx:143-149] handleToggleVisibility のエラーハンドリングなし（サイレント失敗）**
🔴 **[calendar.tsx:555-577] handleToggleVisibility・handleDelete のエラーハンドリングなし**

🟡 **[index.tsx:73] load 関数が useCallback でメモ化されていない**
🟡 **[calendar.tsx:275-325] useEffect の依存配列に aiSummaryCache が欠落**
🟡 **[PaywallModal.tsx:49-53] useEffect の依存配列に reason が欠落**
🟡 **[PaywallModal.tsx:49-51] getCurrentOffering() のエラーハンドリングなし**
🟡 **[lib/db.ts:398-406] getFavoriteEntries で N+1 クエリ**
🟡 **[calendar.tsx:117] (expires as any) の型逃げ**
🟡 SafeAreaInsets 対応がハードコード値で代替されている
🟡 複数画面で KeyboardAvoidingView 確認が必要

🟢 lib/db.ts の型定義は統一されており良好
🟢 認証ガード（RootGuard）は適切に実装されている

---

### Agent 5 — リリースエンジニア（App Store 審査・課金）

**App Store審査 判定: HOLD（2点のブロッカー解消後に GO）**

🔴 **EXPO_PUBLIC_REVENUECAT_IOS_KEY の未設定**
- 状態: 問題あり
- 詳細: eas.json の build.production.env に存在しない。未設定のまま提出すると「開発中」表示が残り、購入ボタンも動作しない。

🔴 **審査用アカウント（ペアリング済みのデモアカウント）を用意しているか**
- 状態: 要準備
- 詳細: 2人ペアリング前提のアプリで、審査官は1人でテストする。コア機能に到達できずリジェクトされる可能性が高い。

🟡 **Apple ID ユーザー削除時の revoke token 未確認**
- 状態: 要確認
- 詳細: Cloud Functions の `deleteAccount` に Apple の `revokeToken` API 呼び出しが含まれていない場合、Guideline 5.1.1(v) 違反。

🟡 **PP/利規 URL のドメイン不整合**
- 状態: 要確認
- 詳細: `PaywallModal.tsx` は `futakoto.app`、MEMORY.md の記載は `futakoto.web.app` でドメインが異なる。疎通確認が必要。

🟢 Bundle ID `com.futakoto.app` は正しく設定されている
🟢 Sign in with Apple は実装済み（`usesAppleSignIn: true`、nonce対応あり）
🟢 Privacy Manifest は iOS 17 対応で設定済み
🟢 AI同意モーダル（AiConsentModal）は実装済み
🟢 PaywallModal に価格・更新周期・解約方法・復元ボタンが揃っている

---

### Agent 6 — UX・ユーザビリティ専門家

**UX総合評価: ★3.2/5（App Store初回レビューでの予測評価）**

★3.2 → ★4.0 に上げるための最優先3点:
1. ログイン前オンボーディング（アプリの価値・ペアリングが必要なことを説明）
2. 投稿完了後の成功フィードバック（Toast または短時間の成功表示）
3. パートナー未参加状態のホーム空状態を「パートナーを今すぐ招待」CTAカードに置き換え

😣 **[ログイン画面] アプリの価値提案がゼロ**
- ロゴとタグライン2行のみで登録フォームが始まる。
- 改善案: フォームの上に価値説明（3行以内）またはオンボーディングページを追加する。

😣 **[ログイン画面] パスワードリセットへの導線がない**
- 改善案: パスワード入力フィールドの下に「パスワードをお忘れですか？」テキストリンクを置く。

😣 **[ホーム画面] ペアリング前の案内が弱い**
- 「設定タブからパートナーと繋がろう」1行テキストのみ。
- 改善案: 「パートナーを招待してはじめよう」カードを置き、その場で Share ダイアログを起動できるようにする。

😣 **[投稿画面] 投稿完了後のフィードバックが何もない**
- handleSave の成功パスが `router.back()` のみ。
- 改善案: 保存成功後に「今日の気持ちを記録しました」スナックバーを表示する。

😣 **[ペイウォール] 開発中の注記がプロダクション環境でも表示される可能性**
- `!isPurchasesConfigured()` が true のとき赤字で「開発中：...」が表示される。
- 改善案: `__DEV__ && !isPurchasesConfigured()` の場合のみ表示する。

😣 **[エラー処理] AIエラー時に「もう一度試す」ボタンがない**
- 改善案: Alert のボタンに `{ text: 'もう一度試す', onPress: () => runInterpret(entry) }` を追加する。

😣 **[ホーム画面] ロード中のローディングインジケーターがない**
- 改善案: `isLoading` stateを追加し、初期ロード中はスケルトンカードを表示する。

😣 **[ホーム画面] パートナーの投稿が届いたときの「嬉しい演出」がない**
- 改善案: 新着パートナー投稿に Animated スライドインなどの演出を加える。

😊 **自分とパートナーの区別が視覚的に明確（バッジ・ムードカラー）**
😊 **共有範囲のデフォルト記憶（lastVisibility）がスマート**
😊 **10ターン上限設計が自然で親切**
😊 **ペイウォールの「片方が入るとふたりとも使える」コピーが秀逸**

---

### Agent 7 — アクセシビリティ専門家

**アクセシビリティ問題 合計: 🔴17件 🟡13件 🟢0件**
**App Store審査で指摘されるリスク: 高**

#### VoiceOver（最重要）

🔴 **[components/EntryCard.tsx:42-98] メインタップ領域に accessibilityLabel がない**
```tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel={`${authorName}の記録: ${getMoodEmoji(entry.mood)} ${entry.memo ?? ''}`}
>
```

🔴 **[app/(app)/index.tsx:282-310] 「気持ちを読み解く」ボタンに accessibilityLabel がない**
🔴 **[app/(app)/post.tsx:362-370] 「AIで整える」ボタンに accessibilityLabel がない**
🔴 **[app/(app)/post.tsx:319-333] 日付・時間ピッカーボタンに accessibilityLabel がない**
🔴 **[app/(app)/post.tsx:304-316] クイック日付ボタンに accessibilityLabel がない**
🔴 **[app/(app)/post.tsx:427-436] 「この文に置き換える」ボタンに accessibilityLabel がない**
🔴 **[app/(app)/consult.tsx:135-148] 会話ターン折り畳みボタンに accessibilityLabel がない**
🔴 **[app/(app)/consult.tsx:379] X アイコンの閉じるボタンに accessibilityLabel がない**
🔴 **[components/PaywallModal.tsx:94] X アイコンの閉じるボタンに accessibilityLabel がない**
🔴 **[app/(app)/consult.tsx:357-436] Modal に accessibilityViewIsModal がない**
🔴 **[components/PaywallModal.tsx:91] Modal に accessibilityViewIsModal がない**
🔴 **[components/AiConsentModal.tsx:13] Modal に accessibilityViewIsModal がない**
🔴 **[app/login.tsx:97-113] TextInput に accessibilityLabel がない**
🔴 **[app/login.tsx:177] ログイン/登録切替リンクに accessibilityRole がない**
🔴 **[app/(app)/consult.tsx:233-250] お気に入り星アイコンボタンに accessibilityLabel がない**

#### タップターゲットサイズ

🔴 **[components/EntryActionPanel.tsx:124-133] 削除ボタンが 38×38pt（44pt未満）**
```ts
deleteButton: { width: 44, height: 44 }  // 38 → 44
```

#### 色・コントラスト（WCAG AA 4.5:1 未達）

🔴 **[lib/theme.ts] `textWeak`(#AAA) — 背景比 2.32:1（基準の約半分）**
🔴 **[lib/theme.ts] `textMuted`(#888) — 背景比 3.54:1**
🔴 **[lib/theme.ts] `primary`(#7B9E87) がテキスト色として使われる箇所で 2.79:1**
🔴 **[lib/theme.ts] `ai`(#7C5BB7) が aiBg 上で 4.48:1（わずかに未達）**

```ts
// 修正
textWeak: '#767676',   // #AAA → #767676（4.5:1達成の最小値）
textMuted: '#767676',  // #888 → #767676
```

🟡 **[lib/theme.ts] `partnerText`(#B26F6F) が partnerBgSoft 上で 3.2:1**
🟡 **[app/(app)/consult.tsx] animationType に reduceMotion 未対応**
🟡 全ファイル全般で固定フォントサイズ `fontSize: 11` の多用

---

### Agent 8 — アナリティクス・可観測性エンジニア

**未計測の重要イベント一覧**

| イベント | 関数 | 抜け箇所 | 重要度 |
|---|---|---|---|
| `pair_completed` | `trackPairCompleted()` | `settings/partner.tsx` のペアリング成功後 | 最高（コアKPI） |
| `ai_feature_used { feature: 'interpret' }` | `trackAiFeatureUsed('interpret')` | `index.tsx` の `aiInterpret()` 成功後 | 高 |
| `ai_feature_used { feature: 'summary' }` | `trackAiFeatureUsed('summary')` | `calendar.tsx` の `aiSummary()` 成功後 | 高 |
| `sign_up { method: 'apple' \| 'google' }` | `trackSignUp()` | `login.tsx` の `handleApple` / `handleGoogle` | 高 |

**セットアップ必須作業リスト**

1. EAS Secret への `EXPO_PUBLIC_SENTRY_DSN` 登録（未登録だと本番クラッシュが一切収集されない）
2. EAS Secret への `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` 登録（未登録だと Firebase Analytics が完全にオフ）
3. `partner.tsx` に `trackPairCompleted()` を追加
4. `index.tsx` に `trackAiFeatureUsed('interpret')` を追加
5. `calendar.tsx` に `trackAiFeatureUsed('summary')` を追加
6. `RootGuard` に `Sentry.setUser({ id: user.uid })` を追加
7. ソーシャルログインの `sign_up` 判定を追加
8. 上記設定手順を `docs/app/release-status.md` に追記

🟢 `track()` 関数は try/catch で囲われており計測失敗でアプリが止まらない
🟢 `measurementId` 未設定時に no-op になる
🟢 `Sentry.init()` はトップレベルで正しく呼ばれている（enabled フラグ・tracesSampleRate 0.2 も適切）
🟢 `entry_created` に `mood` と `visibility` が含まれている
🟢 `paywall_shown` に `reason` が含まれている
