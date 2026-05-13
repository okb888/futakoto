# ふたこと 完了済みタスクアーカイブ

> release-status.md から完了したスレッド・チェックリスト項目を移動する場所。
> 参照はするが編集しない。

---

## 完了済みマイルストーン（TOP3）

| 完了日 | タスク |
|---|---|
| 2026-05-09 | 課金設計ドキュメント `docs/pricing-design.md` を書く |
| 2026-05-09 | AI精度改善（eval Phase3）完了条件を決める → C案採用・27/45勝・本番デプロイ済み |

---

## A. AI精度改善（eval プロンプト改善）✅ 全完了

| 項目 | 内容 |
|---|---|
| 完了日 | 2026-05-09 |
| 採用プロンプト | **C案**（B案ベース改善版）。A案に対して27勝12敗11分（判断基準23勝達成） |
| 判断基準 | Claude Codeによる採点・全45サンプル（10ケース×5件）で実施 |
| 本番反映 | `functions/src/index.ts` の `aiConsult` プロンプトに C案の改善内容を組み込み済み |
| デプロイ | asia-northeast1 にデプロイ済み（2026-05-09） |
| 関連ファイル | `eval/PLAN.md`, `eval/REPORT.md` |

### C案の主な改善点
- 感情語がない入力に感情を読み込まない（「〜かもしれません」補完の禁止）
- 疲弊・諦めが入力にある場合は薄めず拾う
- 会話ラリーで前ターンを踏まえた深掘りができる
- ポジティブ入力・整理済みの場合は問いかけ不要の判断が正しくできる
- messageDraft を廃止し aiDraftOptions/aiDraft に分離（V3-FN-1）

---

## C. 課金UI — 完了済み項目（2026-05-11）

- `docs/pricing-design.md` 完成（月5回・ローリングリセット・RevenueCat設計まで確定）
- `lib/db.ts` に `UserProfile.premium?: boolean` フィールド追加（Webhook受信時に書き込む準備）
- 設定画面のAI利用表示を課金状態で出し分け（premium=true→「AI無制限」、free→X/5表示）

---

## D. リリース準備 — 完了済み項目（2026-05-11）

- 設定画面にバージョン表記を追加（`expo-constants` で `app.json` から動的取得）
- プライバシーポリシー・利用規約リンクのURLは実装済み（Firebase側ページ作成が残タスク）

---

---

## C. 課金UI — 実装完了済み追加分（2026-05-11〜05-13）

- EAS Build環境整備（iOS production build 成功）
- Cloud Functions 使用回数ガード（`consumeAiQuota` で6関数すべてに差し込み済み・ペアプレミアム連鎖含む）
- [`components/AiQuotaChip.tsx`](../../../../components/AiQuotaChip.tsx) + [`components/PaywallModal.tsx`](../../../../components/PaywallModal.tsx) 実装
- [`lib/purchases.ts`](../../../../lib/purchases.ts) 雛形（API キー設定で本番化する no-op 実装）
- 課金誘導UI 配置（`consult.tsx`/`post.tsx`/`index.tsx` の quota-exceeded ハンドル / `settings.tsx` の AI利用量カード+CTA / `calendar.tsx` の過去月遷移 Premium ガード）
- [`functions/src/revenuecat-webhook.ts`](../../../../functions/src/revenuecat-webhook.ts) 雛形（Authorization header 認証 + INITIAL_PURCHASE/RENEWAL/CANCELLATION/EXPIRATION/BILLING_ISSUE 分岐 + grace_period 対応）

---

## D. リリース準備 — 今週やる完了済み（2026-05-09〜05-13）

- Apple Developer Program 承認
- App Store Connect 初期設定
- Bundle ID `com.futakoto.app` 登録
- EAS Credentials 設定（Distribution Certificate / Provisioning Profile / Push Notifications）
- iOS production build 成功
- App Store Connect へバイナリアップロード
- Apple 処理完了メール確認
- TestFlight で内部テスター追加
- iPhone 実機に TestFlight 版をインストール
- 起動不可を確認
- Firebase 設定の EAS 同梱修正
- 修正版 iOS production build 作成（build 3）
- App Privacy Manifest 実装（app.json に設定済み）
- AI 送信に関する同意 UI 実装

---

## G. UIデザイン改善 — 完了済み（2026-05-12）

### 即改善
- EntryCard に shadow（shadowOpacity: 0.06 / elevation: 2）追加
- ラベルフォントサイズ 14 → 13pt・letterSpacing 0.2 でタイポグラフィ階層を明確化
- 本文行間（lineHeight）を 20 → 22（約1.57倍）に拡大
- テキスト入力フォーカス時の borderColor 変化（sage green グロー）追加
- カード間余白を 10 → 14px に拡張、角丸 12 → 14
- 空状態 UI を絵文字＋行動喚起ボタン付きに改善
- 気分カラーを原色5色 → くすみ系単色グラデーション5段階に変更
- moodButton 絵文字 24 → 28px、paddingVertical 12 → 14
- 保存ボタン borderRadius 12 → 16 + sage 色付きシャドウ追加
- placeholderTextColor を全画面で #BBB → #999 に統一

### 中期改善
- `consult.tsx`・`post.tsx` の placeholderTextColor 統一

---

## B. 認証拡張 — コード実装完了（2026-05-13）

- [`lib/auth-providers.ts`](../../../../lib/auth-providers.ts) 新規作成（`signInWithGoogle` / `signInWithApple` / `isGoogleSignInConfigured` 実装）
- `app/login.tsx` に Google Sign-in・Apple Sign-in ボタン追加（既存メール/パスワードと共存）
- [`lib/errors.ts`](../../../../lib/errors.ts) 新規作成（エラー分類・日本語化ユーティリティ）
- ⚠ 残タスク: Google webClientID を `PLACEHOLDER_GOOGLE_WEB_CLIENT_ID` から実値に変更 → EAS build → 実機確認

---

## C. 課金UI — v4レビュー対応完了（2026-05-13）

- Firestore Rules で `premium` / `premiumExpiresAt` フィールドをクライアント書き込み禁止に保護（BLOCK-4対応）
- `functions/src/shared.ts` の `consumeAiQuota` に `isPremiumUser()` チェックを追加 → Premium なら上限スキップ（BLOCK-7対応）
- [`components/AiConsentModal.tsx`](../../../../components/AiConsentModal.tsx) 実装 → `index.tsx`/`post.tsx`/`consult.tsx` の AI機能呼び出し前に同意確認フローを追加（BLOCK-3対応）

---

## D. リリース準備 — 追加完了（2026-05-13）

- `web/support.html` 問い合わせフォームページ実装（Google フォームボタン形式・`GOOGLE_FORM_URL` 投入待ち）
- `web/privacy.html` AI送信範囲の記載修正
- `docs/gas-contact-form.gs` お問い合わせフォーム生成 GAS スクリプト追加
- 修正版 build 3 を App Store Connect へ提出完了

---

## tech-tasks.md 完了済み（別管理）

技術的タスクの完了履歴は [`tech-tasks.md`](./tech-tasks.md) の「完了済み」テーブルを参照。
