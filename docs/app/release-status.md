# ふたこと リリースステータス

**最終更新**: 2026-05-17（CodexレビューP0/P1修正をpush・build 15 をTestFlight向けにEAS build/auto-submit予約）
**目標**: 2026年8月31日までに月額¥500の課金が1人発生
**直近マイルストーン**: TestFlight内部配布 → β検証 → 5/31 App Store審査提出

> このファイルは進行中の全スレッドを一望する場所。状況が変わったら更新する。
> 完了済みの項目は [`archive/done.md`](./archive/done.md) に移動済み。

---

## 🎯 今日（2026-05-17）やること

| 優先 | タスク | 状態 |
|---|---|---|
| **1** | build 15 のTestFlight処理完了後、実機確認 | ⏳ EAS build / auto-submit 予約済み |
| **2** | Sandbox課金フロー検証 | 未着手 |
| **3** | β配布3組への声がけ（5/20週から招待予告） | 未着手 |

### ✅ 5/17 完了済み
- CodexレビューP0/P1修正を実装・レビュー後の追加指摘3点も修正
  - `partnerCallName` 保存をFirestore rulesで許可し、保存失敗時のAlertを追加
  - ホーム入力を投稿画面遷移ではなくインライン入力（絵文字選択 → メモ → 伝える）へ復元
  - Firebase Analytics の `measurementId` をFirebase configにも含めるよう修正
- `functions` TypeScript build 成功、`git diff --check` 問題なし
- Git push 完了: branch `codex/fix-review-p3-p4`, commit `4299571`
- EAS iOS production build 15 をTestFlight向けに起動し、auto-submitを予約
  - Build: https://expo.dev/accounts/h.okb/projects/futakoto/builds/a94d3920-7899-4ea3-900e-5e168ed63832
  - Submission: https://expo.dev/accounts/h.okb/projects/futakoto/submissions/d8732529-4470-4b34-8353-ed89a74bdf39

### ✅ 5/16 完了済み（追記）
- 相談タブUI改善：「過去の記録」セクションを削除し「過去の相談を見る」ボタンに置き換え → 振り返りタブ（相談フィルター自動適用）に遷移
- 振り返りタブ：URL params（`viewMode=log`, `typeFilter=consultation`）を受け取りフォーカス時に自動適用・離脱時リセット

### ✅ 5/16 完了済み（当初）
- build 6 TestFlightインストール・初回スモークテスト実施
- Google / Apple Sign-in 実機確認済み
- Apple Small Business Program 申請完了（手取り30%→15%）
- Paid Apps Agreement 署名・**有効化**（5/15付）
- 銀行口座登録（OKABE HIROYUKI・JPY・Active）
- W-8BEN / U.S. Certificate of Foreign Status 提出・Active
- Digital Services Act Compliance 対応・Active
- Sandboxテスター作成
- サブスク `futakoto_premium_monthly` メタデータ完成・**提出準備完了**
- App Version 1.0 に `futakoto_premium_monthly` を紐付け
- UX改善23件を分析・Codex Fix 1〜8 として依頼
- ホーム画面リデザイン実装（全件フィード廃止 → インライン入力 + 今日の自分/パートナー各最新1件）
- EAS iOS production build 10 成功（commit `a343916b`）
- build 10 を App Store Connect / TestFlight にアップロード完了（Apple処理待ち）

---

## 📊 全体状況

```
A. AI精度改善    ───────✅ 完了（archive/done.md 参照）
B. 認証拡張      ───────✅ 実機確認済み（Google/Apple Sign-in 動作確認 5/16）
C. 課金UI       ───────🟡 Apple設定全完了・Sandbox検証のみ残り（明朝再試行）
D. リリース準備  ─────🟡 build 15 EAS build/auto-submit予約済み・TestFlight処理待ち
E. SNS運用      ───────🔴 未着手（β配布後に着手）
F. LP修正       ───────🟡 仮ページ公開中・本番版は6月リリース時
G. UIデザイン改善 ──────🟡 参考画像ベースの大規模改善をCodex Fix 1〜8で進行中
```

---

## B. 認証拡張（Google / Apple ログイン）

| 項目 | 状態 |
|---|---|
| 現状 | **✅ 完了**（5/16 実機確認済み） |
| 次 | `docs/auth-integration.md` に記録を残す（任意） |
| デッドライン | 完了 |

- [x] Google Sign-in 実装（`lib/auth-providers.ts` の `signInWithGoogle` + `login.tsx` 組み込み）
- [x] **Apple Sign-in 実装**（`expo-apple-authentication` + `lib/auth-providers.ts` の `signInWithApple` + `login.tsx` 組み込み）
- [x] 既存のメアド/パスワードログインとの共存確認（login.tsx でメール/Google/Apple を並列表示）
- [x] Google/Apple アカウント連携機能（`settings/account.tsx` + `auth-providers.ts` の `linkGoogleToCurrentUser` / `linkAppleToCurrentUser`）
- [x] Google webClientID・iosClientId を EAS env に投入済み
- [x] Appleボタンの `onPress={handleApple}` 設定を確認済み
- [x] **実機で Google/Apple Sign-in の動作確認（5/16 完了）**
- [ ] 実施記録を `docs/auth-integration.md` に残す（任意）

---

## C. 課金UI（月額¥500 + 無料AI月5回）— 🟡 Sandbox検証待ち

| 項目 | 状態 |
|---|---|
| 現状 | コード実装完了（詳細は [done.md](./archive/done.md)）・SDK統合 / EAS Secret / App Store Connect / RevenueCat設定完了 |
| 次 | build 6 をTestFlightでインストール → Sandbox 実機検証 |
| デッドライン | **5/20までに実機課金フロー検証**（β配布で1ペア通る状態に） |
| ⚠ 重要 | 事前検死v2 の最優先リスク R10（無料が便利すぎて課金しない） |

### 残作業（外部依存・実機要）
- [x] `react-native-purchases` インストール → `lib/purchases.ts` の SDK インポート/`Purchases.configure` 行のコメントアウト解除
- [x] App Store Connect でサブスクグループ `futakoto_main` + Product ID `futakoto_premium_monthly`（¥500 / Tier 5）作成
- [x] **Apple Small Business Program** 登録（5/16 完了・手取り30%→15%）
- [x] RevenueCat ダッシュボードで Entitlement `premium` にプロダクトをマップ
- [x] EAS Secret に `EXPO_PUBLIC_REVENUECAT_IOS_KEY` を設定（+ Firebase/Google 全変数も登録済み）
- [x] Cloud Functions Secret に `REVENUECAT_WEBHOOK_AUTH` を設定（version 1）→ `revenuecatWebhook` 関数デプロイ済み（asia-northeast1）
- [x] RevenueCat ダッシュボードで Webhook URL / Authorization を登録 → TEST イベントで 200 OK 確認済み（5/14）
- [x] Sandboxテスター作成完了（5/16）
- [x] Paid Apps Agreement 署名・**有効**（5/15付・5/16確認）
- [x] 銀行口座登録（OKABE HIROYUKI・JPY・Active）
- [x] W-8BEN / U.S. Certificate of Foreign Status 提出・Active（5/16）
- [x] サブスク `futakoto_premium_monthly` メタデータ完成・**提出準備完了**（5/16）
- [x] App Version 1.0 に `futakoto_premium_monthly` を紐付け済み（5/16）
- [ ] **Sandbox購入→更新→解約→復元の一連を検証**（Apple反映待ち・明朝再試行）

---

## D. リリース準備

| 項目 | 状態 |
|---|---|
| TestFlight | build 6 **インストール済み・スモークテスト完了（5/16）** / build 13 **EAS成功** / build 15 **EAS build + auto-submit予約済み（5/17）** |
| Apple Developer Program | 承認済み |
| Bundle ID | `com.futakoto.app` 登録済み |
| EAS iOS build | **build 15 実行中/予約済み**（5/17・commit `4299571`・CodexレビューP0/P1修正込み） |
| App Store Connect | build 15 auto-submit予約済み / TestFlight処理待ち |
| TestFlight URL | https://appstoreconnect.apple.com/apps/6768653868/testflight/ios |
| App Privacy Manifest（iOS17+） | app.json に設定済み |
| AI送信に関する同意UI | 実装済み・実機確認待ち |
| 初回オンボーディング | 3枚スライド実装済み（コンセプト / ペアリング / AI機能）・実機確認待ち |
| β配布計画 | 同僚2組+奥さん（合計3ペア） |
| 審査提出 | **5/31** デッドライン |

### 残タスク
- [x] build 5 をApp Store Connectへ提出
- [x] build 6 をApp Store Connectへ提出（RevenueCat SDK有効化・Appleボタンバグ修正込み）
- [x] build 10 をApp Store Connectへ提出（ホーム画面リデザイン込み・5/16）
- [x] build 11 をApp Store Connectへ提出（相談タブUI改善・過去の相談を振り返りタブに統合・5/16）
- [x] build 15 をEAS production build + auto-submit予約（CodexレビューP0/P1修正込み・5/17）
- [x] β前コードレビューP3/P4修正（`calendar.tsx` 相手投稿キャッシュ / 解釈キャッシュ200件制限 / `ai.ts` 型改善 / entry create rules強化）
- [x] ホーム画面リデザイン（インライン気持ち入力 / 今日の記録2件表示 / FAB廃止 / 連続記録表示）
- [x] TestFlightで build 6 をインストール（5/16）
- [x] 初回実機スモークテスト（起動・ログイン・投稿・ペアリング・AI・通知）（5/16）
- [ ] 初回起動オンボーディング実装（**5/16時点で未実装**・[`../CODEX-TASK-ux-improvement.md`](../CODEX-TASK-ux-improvement.md) Fix 8 でCodexに依頼）
- [ ] **オンボーディングUX確認**（初回3枚スライド→招待コード共有→パートナーインストール→ペアリング完了の流れが自然か）← Fix 8 完了後
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
| [`../reviews/2026-05-16-self-test-feedback.md`](../reviews/2026-05-16-self-test-feedback.md) | build 6 実機テスト後フィードバック整理（23件→5テーマ・アプローチ比較） |
| [`../CODEX-TASK-ux-improvement.md`](../CODEX-TASK-ux-improvement.md) | Codex向けUX改善実装指示（Fix 1〜7・BEFORE/AFTER付き） |
| `docs/auth-integration.md` | （未作成・B完了時に作る） |
| `eval/PLAN.md`, `eval/REPORT.md` | AI精度評価（完了済み） |
| `AGENTS.md` | エージェント向けハンドオフ本体 |

---

## 📅 リリースカレンダー

| 期日 | やること |
|---|---|
| **5/9〜5/15** | ✅ EAS iOS本番ビルド / App Store Connect提出 / TestFlight内部配布準備・Webhook設定 |
| **5/15〜5/16** | ✅ build 6 インストール・スモークテスト・Sign-in確認 / Apple契約・税務・銀行設定完了 / サブスク提出準備完了 / UX改善Codex依頼 |
| **5/16〜5/20** | Sandbox課金フロー検証（明朝再試行）/ オンボーディング実装（Codex Fix 8）/ β配布3組への声がけ |
| **5/20〜5/28** | TestFlight配布 → β同僚2組+奥さん / フィードバック収集・致命バグ修正 / LP本番版 |
| **5/28〜5/31** | 審査提出最終チェック |
| **5/31** | **App Store審査提出** |
| **6月前半** | リジェクト対応・再提出（最大2回） |
| **6月下旬** | **本番リリース** |
| **7月** | DL獲得 / 課金転換率モニタリング |
| **8月** | 課金1円達成判定 |
