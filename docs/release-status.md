# ふたこと リリースステータス

**最終更新**: 2026-05-11（設定画面バグ修正2件 / product-review.md 追加）
**目標**: 2026年8月31日までに月額¥500の課金が1人発生
**直近マイルストーン**: 5/31 App Store審査提出 → 6月中リリース

> このファイルは進行中の全スレッドを一望する場所。状況が変わったら更新する。
> 詳細は各スレッドの専用ドキュメント（後述）を参照。

---

## 🎯 今週（2026-05-09〜05-15）でやる TOP3

| 優先 | タスク | 担当スレッド | 完了条件 |
|---|---|---|---|
| ~~**1**~~ | ~~課金設計ドキュメント `docs/pricing-design.md` を書く~~ | ~~C. 課金~~ | ✅ **完了**（2026-05-09） |
| ~~**2**~~ | ~~AI精度改善（eval Phase3）の「完了条件」を決める~~ | ~~A. AI精度~~ | ✅ **完了**（2026-05-09）C案採用・27/45勝・本番デプロイ済み |
| **3** | Apple Developer Program 承認待ち → 受領チェック | D. リリース準備 | 承認メール受領 / 5/15までに来なければPlan B検討 |

このTOP3が完了したら、次週（5/15〜）は **EAS Build環境整備 → 課金UIフロント実装 → Cloud Functionsガード → RevenueCat統合** に着手。Apple/Googleログインと並行。

---

## 📊 5スレッドの全体状況

```
A. AI精度改善 ───────✅ 完了（C案採用・全45サンプル評価・本番デプロイ済み）
B. 認証拡張   ───────🟡 別スレッドで進行中（手順表示中）
C. 課金UI    ───────🟡 設計完了（pricing-design.md 完成）→ 実装待ち（来週着手）
D. リリース準備 ─────🟡 Apple Developer Program 受領待ち
E. SNS運用   ───────🔴 未着手（別スレッド予定）
F. LP修正    ───────🟡 仮ページ公開中・本番版未作成
```

---

## A. AI精度改善（eval プロンプト改善）

| 項目 | 状態 |
|---|---|
| 現状 | ✅ **全フェーズ完了**（2026-05-09） |
| 採用プロンプト | **C案**（B案ベース改善版）。A案に対して27勝12敗11分（判断基準23勝達成） |
| 判断基準 | Claude Codeによる採点・全45サンプル（10ケース×5件）で実施 |
| 本番反映 | `functions/src/index.ts` の `aiConsult` プロンプトに C案の改善内容を組み込み済み |
| デプロイ | asia-northeast1 にデプロイ済み（2026-05-09） |
| 関連ファイル | [`futakoto/eval/PLAN.md`](../eval/PLAN.md), [`futakoto/eval/REPORT.md`](../eval/REPORT.md) |

### C案の主な改善点（A案からの変化）
- ✅ 感情語がない入力に感情を読み込まない（「〜かもしれません」補完の禁止）
- ✅ 疲弊・諦めが入力にある場合は薄めず拾う
- ✅ 会話ラリーで前ターンを踏まえた深掘りができる
- ✅ ポジティブ入力・整理済みの場合は問いかけ不要の判断が正しくできる
- ✅ messageDraft を廃止し aiDraftOptions/aiDraft に分離（V3-FN-1）

---

## B. 認証拡張（Google / Apple ログイン）

| 項目 | 状態 |
|---|---|
| 現状 | 別スレッドで進行中。実装手順は表示中 |
| 次 | 実装＋実施記録を `docs/auth-integration.md` に残す |
| デッドライン | TestFlight配布前（5/15週） |
| ⚠ 重要 | **Apple ログインは実装必須**（GoogleやSNSログインを提供する場合、App Store審査ガイドラインで Apple Sign-in の併設が要求される） |
| 関連 | β配布前にFirebase Auth側で動作確認が必要 |

### チェックポイント
- [ ] Google ログイン実装
- [ ] **Apple Sign-in 実装**（リジェクト要因対策）
- [ ] 既存のメアド/パスワード ログインとの共存確認
- [ ] 実施記録を `docs/auth-integration.md` に残す

---

## C. 課金UI（月額¥500 + 無料AI月5回）— 🔴 最優先

| 項目 | 状態 |
|---|---|
| 現状 | 設計完了・フロント一部準備済み → 実装待ち |
| 次 | EAS Build環境整備 → RevenueCat統合 → Cloud Functionsガード |
| デッドライン | **5/20までに実装完了**（β配布で課金フロー検証可能に） |
| ⚠ 重要 | 事前検死v2 の最優先リスク R10（無料が便利すぎて課金しない） |

### ✅ 完了済み（2026-05-11）
- [x] `docs/pricing-design.md` 完成（月5回・ローリングリセット・RevenueCat設計まで確定）
- [x] `lib/db.ts` に `UserProfile.premium?: boolean` フィールド追加（Webhook受信時に書き込む準備）
- [x] 設定画面のAI利用表示を課金状態で出し分け（premium=true→「AI無制限」、free→X/5表示）

### 実装（来週以降）
- [ ] EAS Build環境整備（`expo-dev-client` 追加）
- [ ] Cloud Functions の使用回数ガード（6関数すべてに `checkAndConsumeAiQuota` を差し込み）
- [ ] RevenueCat × Expo 統合（`react-native-purchases`、Webhook）
- [ ] `AiQuotaChip.tsx` + `PaywallModal.tsx` 実装
- [ ] 課金誘導UI の配置（5回目使用直後 / 設定画面 / 月次振り返り）
- [ ] App Store Connect でサブスクSKU作成（Apple Developer Program承認後）

---

## D. リリース準備

| 項目 | 状態 |
|---|---|
| TestFlight | 認証待ち |
| Apple Developer Program | 申込済・受領待ち |
| プライバシーポリシー（Web） | W7で実装済 |
| **App Privacy Manifest（iOS17+）** | **未実装** |
| AI送信に関する同意UI | 未実装 |
| β配布計画 | 同僚2組+奥さん（合計3ペア） |
| 審査提出 | **5/31** デッドライン |

### ✅ 完了済み（2026-05-11）
- [x] 設定画面にバージョン表記を追加（`expo-constants` で `app.json` から動的取得）
- [x] プライバシーポリシー・利用規約リンクのURLは実装済み（Firebase側ページ作成が残タスク）

### 今週やる
- [ ] Apple Developer Program 承認メール受領 → 受領後すぐにApp Store Connect初期設定
- [ ] 受領が5/15までに来ない場合のPlan B検討（β配布をTestFlight以外で実施するか）
- [ ] Firebase でプライバシーポリシー・利用規約ページ作成（リンク有効化）

### 来週以降
- [ ] App Privacy Manifest 実装
- [ ] AI送信同意UI実装
- [ ] プライバシーポリシーにAI送信範囲を追記
- [ ] β配布（同僚2組+奥さん）
- [ ] β フィードバック収集 → 致命バグ修正
- [ ] 5/31審査提出

---

## E. SNS運用（別スレッドで進行）

> **詳細方針**: [`acquisition-strategy.md`](./acquisition-strategy.md) §5 note運用 / §6 X運用 / §7 Instagram運用
> **発信ネタ素材**: [`content-stock.md`](./content-stock.md)（19件・7シリーズ）

| 媒体 | 状態 |
|---|---|
| X | `@futakoto_app` 取得済 / 投稿未着手 |
| Instagram | `@futakoto_app` 取得済 / 投稿未着手 |
| note | アカウント未開設 |

### マイルストーン
- [ ] 5月後半までに3媒体すべてで初投稿完了
- [ ] リリース予告ポストを5月末に投稿
- [ ] リリース後、流入元計測を `docs/release-status.md` に追記

---

## F. LP修正

> **詳細方針**: [`acquisition-strategy.md`](./acquisition-strategy.md) §3 メッセージ階層 / §10 ASO

| 項目 | 状態 |
|---|---|
| 現状 | futakoto.web.app は仮ページ |
| 次 | 月額¥500 + 無料月3回の訴求に書き換え |
| デッドライン | 6月リリース時 |

### 修正ポイント
- [ ] 「無料で使える」を最上部に明示
- [ ] AI機能の無料枠（月3回）を明示
- [ ] 月額¥500の訴求は2スクロール下
- [ ] 実際の使用例スクショ
- [ ] ASO意識のSEO要素
- [ ] X/note/IGリンク設置

---

## 🗂 関連ドキュメント索引

| ドキュメント | 内容 |
|---|---|
| [`docs/2026-05-09-premortem.md`](./2026-05-09-premortem.md) | 事前検死 v2 (失敗シナリオ50個 + リスク評価) |
| [`docs/2026-05-09-premortem-actions.md`](./2026-05-09-premortem-actions.md) | 赤・黄リスク対策 + 5/31審査提出タイムライン |
| [`docs/pricing-design.md`](./pricing-design.md) | 課金設計（月額¥500 / 1契約2人 / 無料AI月5回） |
| [`docs/acquisition-strategy.md`](./acquisition-strategy.md) | 集客戦略・SNS運用方針（ターゲット定義・チャネル設計・プライバシー運用） |
| [`docs/content-stock.md`](./content-stock.md) | 発信ネタストック（19件・7シリーズ・note 5本構成案） |
| [`docs/2026-05-10-product-review.md`](./2026-05-10-product-review.md) | Any Planner分析メモ（課金・UI・設定画面・動画プロモ）+ 実機バグTODO |
| `docs/auth-integration.md` | （未作成・別スレッド完了時に作る） |
| `eval/PLAN.md` | AI精度評価プラン |
| `AGENTS.md` | エージェント向けハンドオフ本体 |
| `.design/system.md` | デザインシステム |

---

## 📅 5月後半〜6月のリリースカレンダー（再掲）

| 期日 | やること |
|---|---|
| **5/9〜5/15** | 課金設計ドキュメント / eval Phase3 完了条件 / Apple Developer Program 受領 |
| **5/15〜5/20** | Apple/Google ログイン実装 / 課金UI実装 / プライバシー対応 |
| **5/20〜5/28** | TestFlight配布 → β同僚2組+奥さん / フィードバック収集・致命バグ修正 / LP本番版 |
| **5/28〜5/31** | 審査提出最終チェック / Claude/GPTで審査ガイド自己審査 |
| **5/31** | **App Store審査提出** |
| **6月前半** | リジェクト対応・再提出（最大2回） |
| **6月下旬** | **本番リリース** |
| **7月** | DL獲得 / 課金転換率モニタリング |
| **8月** | 課金1円達成判定 |
