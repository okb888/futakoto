# ふたこと リリースステータス

**最終更新**: 2026-05-12（UIリサーチ追加 / docs/app/ をサブフォルダ構成に整理）
**目標**: 2026年8月31日までに月額¥500の課金が1人発生
**直近マイルストーン**: 5/31 App Store審査提出 → 6月中リリース

> このファイルは進行中の全スレッドを一望する場所。状況が変わったら更新する。
> 完了済みの項目は [`archive/done.md`](./archive/done.md) に移動済み。

---

## 🎯 今週（2026-05-09〜05-15）でやる残タスク

| 優先 | タスク | 担当スレッド | 完了条件 |
|---|---|---|---|
| **3** | Apple Developer Program 承認待ち → 受領チェック | D. リリース準備 | 承認メール受領 / 5/15までに来なければPlan B検討 |

次週（5/15〜）: **EAS Build環境整備 → 課金UIフロント実装 → Cloud Functionsガード → RevenueCat統合**（Apple/Googleログインと並行）

---

## 📊 全体状況

```
A. AI精度改善 ───────✅ 完了（archive/done.md 参照）
B. 認証拡張   ───────🟡 別スレッドで進行中
C. 課金UI    ───────🟡 設計完了 → 実装待ち（来週着手）
D. リリース準備 ─────🟡 Apple Developer Program 受領待ち
E. SNS運用   ───────🔴 未着手（別スレッド予定）
F. LP修正    ───────🟡 仮ページ公開中・本番版未作成
G. UIデザイン改善 ───🟡 リサーチ完了 → 実装未着手
```

---

## B. 認証拡張（Google / Apple ログイン）

| 項目 | 状態 |
|---|---|
| 現状 | 別スレッドで進行中 |
| 次 | 実装＋実施記録を `docs/auth-integration.md` に残す |
| デッドライン | TestFlight配布前（5/15週） |
| ⚠ 重要 | **Apple Sign-in は実装必須**（App Store審査ガイドライン要件） |

- [ ] Google ログイン実装
- [ ] **Apple Sign-in 実装**（リジェクト要因対策）
- [ ] 既存のメアド/パスワードログインとの共存確認
- [ ] 実施記録を `docs/auth-integration.md` に残す

---

## C. 課金UI（月額¥500 + 無料AI月5回）— 🔴 最優先

| 項目 | 状態 |
|---|---|
| 現状 | 設計完了・フロント一部準備済み → 実装待ち |
| 次 | EAS Build環境整備 → RevenueCat統合 → Cloud Functionsガード |
| デッドライン | **5/20までに実装完了**（β配布で課金フロー検証可能に） |
| ⚠ 重要 | 事前検死v2 の最優先リスク R10（無料が便利すぎて課金しない） |

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
| **App Privacy Manifest（iOS17+）** | **未実装** |
| AI送信に関する同意UI | 未実装 |
| β配布計画 | 同僚2組+奥さん（合計3ペア） |
| 審査提出 | **5/31** デッドライン |

### 今週やる
- [ ] Apple Developer Program 承認メール受領 → 受領後すぐにApp Store Connect初期設定
- [ ] 受領が5/15までに来ない場合のPlan B検討（β配布をTestFlight以外で実施するか）
- [ ] Firebase でプライバシーポリシー・利用規約ページ作成（リンク有効化）

### 来週以降
- [ ] App Privacy Manifest 実装
- [ ] AI送信同意UI実装
- [ ] プライバシーポリシーにAI送信範囲を追記
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
| 現状 | futakoto.web.app は仮ページ |
| デッドライン | 6月リリース時 |

- [ ] 「無料で使える」を最上部に明示
- [ ] AI機能の無料枠（月5回）を明示
- [ ] 月額¥500の訴求は2スクロール下
- [ ] 実際の使用例スクショ
- [ ] ASO意識のSEO要素
- [ ] X/note/IGリンク設置

---

## G. UIデザイン改善

| 項目 | 状態 |
|---|---|
| 現状 | リサーチ完了・改善提案作成済み → 実装未着手 |
| リサーチ結果 | [`docs/reviews/2026-05-12-ui-research.md`](../reviews/2026-05-12-ui-research.md)（30件調査） |
| 根本原因 | ①EntryCardにshadowなし ②ラベルと本文が同サイズ ③入力フォーカス時の視覚変化なし |
| デッドライン | β配布前（5/20週）に即改善完了を目標 |

### 即改善（StyleSheet変更のみ・約65分）
- [ ] EntryCard にshadow（elevation）追加
- [ ] タイポグラフィ階層修正（ラベル12pt / 本文16pt / タイトル18pt）
- [ ] 行間（lineHeight）を本文の1.6倍に統一
- [ ] テキスト入力フォーカス時のborderColor変化追加
- [ ] カード間paddingを8px → 12px に拡張
- [ ] タブバーアイコンサイズ・ラベル統一
- [ ] 空状態UIのコピーとイラスト改善
- [ ] sage色の濃淡バリエーション整理（3階調に絞る）

### 中期改善（コンポーネント修正）
- [ ] カード背景をグラデーション or 微細テクスチャ検討
- [ ] 設定画面のサブページ分割

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
| `docs/auth-integration.md` | （未作成・B完了時に作る） |
| `eval/PLAN.md`, `eval/REPORT.md` | AI精度評価（完了済み） |
| `AGENTS.md` | エージェント向けハンドオフ本体 |

---

## 📅 リリースカレンダー

| 期日 | やること |
|---|---|
| **5/9〜5/15** | Apple Developer Program 受領 |
| **5/15〜5/20** | Apple/Google ログイン実装 / 課金UI実装 / プライバシー対応 / UI即改善 |
| **5/20〜5/28** | TestFlight配布 → β同僚2組+奥さん / フィードバック収集・致命バグ修正 / LP本番版 |
| **5/28〜5/31** | 審査提出最終チェック |
| **5/31** | **App Store審査提出** |
| **6月前半** | リジェクト対応・再提出（最大2回） |
| **6月下旬** | **本番リリース** |
| **7月** | DL獲得 / 課金転換率モニタリング |
| **8月** | 課金1円達成判定 |
