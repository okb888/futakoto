# ふたこと リリースステータス

**最終更新**: 2026-07-01（追加実機バグ3件を修正待ちに記録）
**目標**: 2026年8月31日までに月額¥500の課金が1人発生
**直近マイルストーン**: TestFlight内部配布 → β検証 → 5/31 App Store審査提出

> このファイルは進行中の全スレッドを一望する場所。状況が変わったら更新する。
> 完了済みの項目は [`archive/done.md`](./archive/done.md) に移動済み。

---

## 🎯 次にやること

| 優先 | タスク | 完了条件 |
|---|---|---|
| **1** | 2026-07-01追加実機バグ3件を修正 | カレンダー月送りUI、AI壁打ち空返答、課金ステータスチップの出し分けが直る |
| **2** | TestFlight build 18 をインストールして実機確認 | UI復旧、ログイン/チュートリアル維持 |
| **3** | 実機スモークテスト（ログイン・チュートリアル・ホーム・投稿・振り返り） | ログイン/チュートリアル維持、UI復旧 |
| **4** | Apple処理完了次第 → Sandbox 課金フロー検証 | 購入→更新→解約→復元の一連が通る |

---

## 📊 全体状況

```
A. AI精度改善 ───────✅ 完了（archive/done.md 参照）
B. 認証拡張   ───────🟢 コード実装完了・webClientID投入済み → 実機確認待ち
C. 課金UI    ───────🟡 SDK統合・EAS設定・Webhook設定完了 → ステータスチップ修正 + Sandbox検証待ち
D. リリース準備 ─────🟡 build 18 + production EAS Update 配信済み・追加実機バグ修正待ち
E. SNS運用   ───────🔴 未着手（別スレッド予定）
F. LP修正    ───────🟡 仮ページ公開中・本番版未作成
G. UIデザイン改善 ───✅ 完了（archive/done.md 参照）
```

---

## B. 認証拡張（Google / Apple ログイン）

| 項目 | 状態 |
|---|---|
| 現状 | **コード実装済み**（`lib/auth-providers.ts` + `login.tsx`）・EAS env 設定済み・実機確認待ち |
| 次 | EAS build → 実機確認 |
| デッドライン | TestFlight β配布前（5/20週） |
| 実機確認 | Google / Apple Sign-in とアカウント連携の確認待ち |

- [x] Google Sign-in 実装（`lib/auth-providers.ts` の `signInWithGoogle` + `login.tsx` 組み込み）
- [x] **Apple Sign-in 実装**（`expo-apple-authentication` + `lib/auth-providers.ts` の `signInWithApple` + `login.tsx` 組み込み）
- [x] 既存のメアド/パスワードログインとの共存確認（login.tsx でメール/Google/Apple を並列表示）
- [x] Google/Apple アカウント連携機能（`settings/account.tsx` + `auth-providers.ts` の `linkGoogleToCurrentUser` / `linkAppleToCurrentUser`）
- [x] Google webClientID・iosClientId を EAS env に投入済み
- [x] Appleボタンの `onPress={handleApple}` 設定を確認済み
- [ ] 実機で Google/Apple Sign-in の動作確認
- [ ] 実施記録を `docs/auth-integration.md` に残す

---

## C. 課金UI（月額¥500 + 無料AI月5回）— 🟡 Sandbox検証待ち

| 項目 | 状態 |
|---|---|
| 現状 | コード実装完了（詳細は [done.md](./archive/done.md)）・SDK統合とストア側設定待ち |
| 次 | `react-native-purchases` 物理インストール → API キー投入 → Sandbox 実機検証 |
| デッドライン | **5/20までに実機課金フロー検証**（β配布で1ペア通る状態に） |
| ⚠ 重要 | 事前検死v2 の最優先リスク R10（無料が便利すぎて課金しない） |

### 残作業（外部依存・実機要）
- [x] `react-native-purchases` インストール → `lib/purchases.ts` の SDK インポート/`Purchases.configure` 行のコメントアウト解除
- [x] App Store Connect でサブスクグループ `futakoto_main` + Product ID `futakoto_premium_monthly`（¥500 / Tier 5）作成
- [ ] **Apple Small Business Program** 登録（手取り 30%→15%）
- [x] RevenueCat ダッシュボードで Entitlement `premium` にプロダクトをマップ
- [x] EAS Secret に `EXPO_PUBLIC_REVENUECAT_IOS_KEY` を設定（+ Firebase/Google 全変数も登録済み）
- [x] Cloud Functions Secret に `REVENUECAT_WEBHOOK_AUTH` を設定（version 1）→ `revenuecatWebhook` 関数デプロイ済み（asia-northeast1）
- [x] RevenueCat ダッシュボードで Webhook URL / Authorization を登録 → TEST イベントで 200 OK 確認済み（5/14）
- [ ] 課金ステータスチップの出し分けを修正する。無料ユーザーはタップで「プレミアムを始める」を出してよいが、課金ユーザーには不要なチップ/CTAを表示しない
- [ ] Sandbox アカウントで購入→更新→解約→復元の一連を検証

---

## D. リリース準備

| 項目 | 状態 |
|---|---|
| TestFlight | build 16/17でUI未復旧。UIロールバック + EAS Update対応版 build 18 を提出済み |
| **次build確認** | build 18でログイン/チュートリアルが残り、UIが戻っているか確認 |
| Apple Developer Program | 承認済み |
| Bundle ID | `com.futakoto.app` 登録済み |
| EAS iOS build | build 18 成功（Build ID: `6c60a5b0-5591-49bb-8893-4cf59ef418f6` / build 18以降はEAS Update対応） |
| App Store Connect | build 18 アップロード完了・Apple処理待ち |
| EAS Update | production配信済み（Build 18 runtime一致版 Update group: `e751a3fa-7040-49ec-ae04-e45fd981ee31`） |
| TestFlight URL | https://appstoreconnect.apple.com/apps/6768653868/testflight/ios |
| App Privacy Manifest（iOS17+） | app.json に設定済み |
| AI送信に関する同意UI | 実装済み・実機確認待ち |
| 初回オンボーディング | 3枚スライド実装済み（コンセプト / ペアリング / AI機能）・実機確認待ち |
| β配布計画 | 同僚2組+奥さん（合計3ペア） |
| 審査提出 | **5/31** デッドライン |

### 残タスク
- [ ] 2026-07-01追加実機バグ修正: カレンダーで翌月遷移ボタンと「今月」が被る問題を直し、左右スワイプで月替えできるようにする
- [ ] 2026-07-01追加実機バグ修正: AI壁打ちで処理後の表示は出るが本文が空になる問題を直す。`aiConsult` の戻り値、`lib/ai.ts` の整形、`consult.tsx` の表示/空レスポンス扱いを確認する
- [ ] 2026-07-01追加実機バグ修正: 課金ステータスチップは無料ユーザー向けCTAに限定し、課金ユーザーには不要な表示を出さない
- [x] build 5 をApp Store Connectへ提出
- [x] TestFlight build 15 を実機確認
- [x] build 15 実機指摘を修正（詳細: [`2026-05-17-testflight-build15-fixes.md`](../reviews/2026-05-17-testflight-build15-fixes.md)）
- [x] build 15 修正版を App Store Connect / TestFlight へ提出（build 16）
- [x] build 16でログイン/チュートリアル対応を確認
- [x] build 16でUI悪化を確認
- [x] EAS Update設定追加（`expo-updates` / `updates.url` / `runtimeVersion: fingerprint` / channel設定）
- [x] UIロールバック版を App Store Connect / TestFlight へ提出（build 17）
- [x] UIロールバック版を EAS Update production に配信
- [x] build 17 runtimeVersion一致版のEAS Updateをproductionに再配信（Update group: `7b83ad3e-7d9f-4d7b-8c72-a0b401bb8e36`）
- [x] build 17はEAS Update未対応バイナリだったため、build 18を再提出
- [x] build 18 runtimeVersion一致版のEAS Updateをproductionに配信（Update group: `e751a3fa-7040-49ec-ae04-e45fd981ee31`）
- [ ] build 18の実機スモークテスト（ログイン・チュートリアル・ホーム・投稿・振り返り）
- [x] 初回起動オンボーディング実装（`components/OnboardingModal.tsx` + `app/(app)/index.tsx`、AsyncStorage `hasSeenOnboarding` で初回のみ表示）
- [ ] **オンボーディングUX確認**（初回3枚スライド→設定で招待コード共有→パートナーインストール→ペアリング完了の流れが自然か）← UX分析より
- [x] Firebase でプライバシーポリシー・利用規約ページ作成（リンク有効化）
- [x] プライバシーポリシーにAI送信範囲を追記
- [x] GAS でお問い合わせフォーム作成（`docs/gas-contact-form.gs`・通知先: futakoto.app@gmail.com）
- [x] `web/support.html` の `GOOGLE_FORM_URL` を実際の Google フォーム URL に差し替え
- [x] Firebase Hosting 本番デプロイ（privacy / terms / support 全ページ公開 https://futakoto.web.app）
- [ ] β配布（同僚2組+奥さん）
- [ ] βフィードバック収集 → 致命バグ修正
- [ ] 5/31審査提出

---

## E. SNS運用

> 詳細: [`acquisition-strategy.md`](./acquisition-strategy.md) / ネタ素材: [`content-stock.md`](./content-stock.md)（19件・7シリーズ）

| 媒体 | 状態 |
|---|---|
| X | `@futakoto_app` 取得済 / 投稿未着手 |
| Instagram | `@futakoto_app` 取得済 / 投稿未着手 |
| note | アカウント未開設 |

- [ ] 5月後半までに3媒体すべてで初投稿完了
- [ ] リリース予告ポストを5月末に投稿
- [ ] リリース後、流入元計測を本ファイルに追記

---

## F. LP修正

| 項目 | 状態 |
|---|---|
| 現状 | futakoto.web.app 仮ページ公開中・リリース通知セクション追加済み |
| デッドライン | 6月リリース時 |

- [x] リリース通知セクション追加（`#notify`・Formspree `mjgldnwe` でメール収集・Xフォロー誘導）
- [x] バナーを「2026年6月リリース予定」に更新
- [ ] 「無料で使える」を最上部に明示
- [ ] AI機能の無料枠（月5回）を明示
- [ ] 月額¥500の訴求は2スクロール下
- [ ] 実際の使用例スクショ
- [ ] ASO意識のSEO要素
- [ ] X/note/IGリンク設置

---

## G. UIデザイン改善 ✅ 完了

| 項目 | 状態 |
|---|---|
| 現状 | 即改善・中期改善を実装済み → **β配布前完了（5/12）** |
| リサーチ結果 | [`docs/reviews/2026-05-12-ui-research.md`](../reviews/2026-05-12-ui-research.md)（30件調査） |
| 完了詳細 | [`archive/done.md`](./archive/done.md) 参照 |

### 長期対応（β後）
- [ ] 設定画面のサブページ分割（5グループ化）
- [ ] カード背景をグラデーション or 微細テクスチャ検討
- [ ] お気に入りタブと設定の分離（タブの意味が2つ同居している）← UX分析より
- [ ] borderSoft(#F0F0F0) と background(#FAFAF8) のコントラスト差を拡大 ← UX分析より

---

## 🗂 関連ドキュメント索引

| ドキュメント | 内容 |
|---|---|
| [`archive/done.md`](./archive/done.md) | 完了済みスレッド・チェックリスト項目のアーカイブ |
| [`archive/tech-tasks.md`](./archive/tech-tasks.md) | 技術的改善タスク管理（全完了済み） |
| [`design/pricing-design.md`](./design/pricing-design.md) | 課金設計（月額¥500 / 1契約2人 / 無料AI月5回） |
| [`design/ai-consult-design.md`](./design/ai-consult-design.md) | AI相談機能の設計仕様 |
| [`acquisition-strategy.md`](./acquisition-strategy.md) | 集客戦略・SNS運用方針 |
| [`content-stock.md`](./content-stock.md) | 発信ネタストック（19件・7シリーズ） |
| [`../reviews/2026-05-10-product-review.md`](../reviews/2026-05-10-product-review.md) | Any Planner分析メモ + 実機バグTODO |
| [`../reviews/2026-05-12-ui-research.md`](../reviews/2026-05-12-ui-research.md) | UIリサーチ30件・改善提案（即改善8件・中期・長期） |
| [`../reviews/2026-05-14-ux-5layer.md`](../reviews/2026-05-14-ux-5layer.md) | UX 5レイヤー分析（Strategy〜Surface・総合評価） |
| `docs/auth-integration.md` | （未作成・B完了時に作る） |
| `eval/PLAN.md`, `eval/REPORT.md` | AI精度評価（完了済み） |
| `AGENTS.md` | エージェント向けハンドオフ本体 |

---

## 📅 リリースカレンダー

| 期日 | やること |
|---|---|
| **5/9〜5/15** | ✅ EAS iOS本番ビルド / App Store Connect提出 / TestFlight内部配布準備・Webhook設定 |
| **5/15** | **build 5 インストール → Sandbox課金フロー検証 / 初回実機スモークテスト** |
| **5/15〜5/20** | Apple・Googleログイン実機確認 / オンボーディングUX確認 / プライバシー対応最終確認 |
| **5/20〜5/28** | TestFlight配布 → β同僚2組+奥さん / フィードバック収集・致命バグ修正 / LP本番版 |
| **5/28〜5/31** | 審査提出最終チェック |
| **5/31** | **App Store審査提出** |
| **6月前半** | リジェクト対応・再提出（最大2回） |
| **6月下旬** | **本番リリース** |
| **7月** | DL獲得 / 課金転換率モニタリング |
| **8月** | 課金1円達成判定 |
