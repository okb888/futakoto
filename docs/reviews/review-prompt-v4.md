# ふたこと レビュー v4 — 実行プロンプト

> このファイルを新しいClaude Codeセッションに貼り付けて実行する。
> 4つの観点を**並行サブエージェント**で同時レビューし、`docs/2026-MMDD-review-v4.md` に統合レポートを出力する。

---

## あなたへの指示

以下の **4つのレビュートラック** を**並行サブエージェントとして同時実行**してください。
それぞれが独立して調査し、最後に私（オーケストレーター）が結果を統合して `docs/2026-MMDD-review-v4.md` に書き出します。

---

## プロジェクト概要（全サブエージェントへの共有コンテキスト）

**アプリ名:** ふたこと（futakoto）  
**概要:** 夫婦向け気持ち共有iOSアプリ  
**スタック:** Expo (React Native) + Firebase (Auth/Firestore) + Cloud Functions v2 + Gemini 2.5 Flash  
**コードパス:** `/Users/okabehiroyuki/futakoto/`  
**次のマイルストーン:** 2026-05-31 App Store審査提出

**重要ドキュメント（必要に応じて参照）:**
- `docs/release-status.md` — 全スレッドの現状と残タスク
- `docs/pricing-design.md` — 課金設計（月額¥500・無料AI月5回）
- `docs/2026-05-09-review-v3.md` — 直前レビュー（v3完了済みの指摘は再指摘不要）
- `AGENTS.md` — エージェント向けアーキテクチャ詳細
- `.design/system.md` — デザインシステム

**v3完了済み（再指摘不要）:**
- CRIT-1〜4: import不足・全ユーザー走査・サーバー検証・history捏造
- FN-1: aiConsult をreflection/aiDraft/aiDraftOptions に分離
- FN-2/3: 新規会話の確認ダイアログ・削除クリーンアップ
- UI-1: COLORS トークン化（settings/index/calendar/consult/post等）
- UX-4: 「もう一度読み解く」ボタン追加

---

## Track A — App Store 審査対策レビュー

**担当ファイル（優先）:**
- `app.json` / `app.config.js`
- `ios/` ディレクトリ（存在確認）
- `functions/src/index.ts`（プライバシー関連のデータ処理）
- `app/(app)/settings.tsx`（同意UI）
- `web/index.html`（プライバシーポリシー確認）

**確認項目:**

### A-1. App Privacy Manifest（PrivacyInfo.xcprivacy）
- 実装有無を確認。なければ **リジェクト確定**（iOS 17+ 必須）
- 使用APIカテゴリ（UserDefaults, FileTimestamp等）の申告漏れチェック
- サードパーティSDKのPrivacy Manifest対応状況（expo-* / firebase / revenueCat）

### A-2. Apple Sign-in
- `app/(app)/login.tsx` または認証関連ファイルにApple Sign-inが実装されているか
- GoogleログインがあればApple Sign-in 必須（App Store審査ガイドライン4.8）
- 実装なければ **リジェクト確定**

### A-3. AI送信に関する同意UI
- ユーザーの投稿内容をGemini APIに送信することへの明示的同意フローがあるか
- プライバシーポリシーにAI送信範囲の記載があるか

### A-4. NSUsageDescription 系キー
- `app.json` の `infoPlist` に必要なキーが揃っているか（NSPhotoLibraryUsageDescription等）

### A-5. 年齢制限・コンテンツ
- 夫婦アプリとしての適切なコンテンツレーティング設定

**出力形式:** 審査リジェクトリスクを 🚨致命/⚠️高/📋中 で分類した表

---

## Track B — コード品質・残課題レビュー

**担当ファイル:**
- `app/(app)/*.tsx`（全画面）
- `lib/*.ts`（db.ts / ai.ts / format.ts / profile.ts）
- `functions/src/index.ts`
- `components/*.tsx`

**確認項目:**

### B-1. v3未着手の残課題
- `V3-CQ-3`: `Entry.createdAt: any` → Firestore Timestamp型整理の実施状況
- `V3-CQ-2`: ホームの「自分50件+相手500件混合ソート」の改善状況
- `V3-UI-2/3`: UIリテラル色・AI色2段階整理の残存状況

### B-2. 課金実装に向けた地雷
- `lib/db.ts` の `UserProfile.premium` フィールド: 書き込み・読み取りの一貫性
- `functions/src/index.ts` の `checkAndConsumeAiQuota`（未実装なら指摘）
- クライアント側でpremiumフラグを直接書き換えられる経路がないか

### B-3. 新機能（aiDraft / aiDraftOptions / cleanupOnEntryDelete）の品質
- v3で追加された新Functionsのエラーハンドリング・型安全性
- `consult.tsx` の全面書き直し後のエッジケース（空セッション・ネットワーク切断）

### B-4. 型安全性の全体状況
- `any` 型の使用箇所をgrepして影響度評価
- Firestore DocumentData の型アサーション漏れ

### B-5. 未使用コード・デッドコード
- v3の大規模改修後に残った未使用import/関数/型

**出力形式:** 優先度付き指摘表（🔴緊急/🟡中/🟢低）+ 修正コード例（主要なもの）

---

## Track C — UX・プロダクトレビュー（ユーザー目線）

**担当ファイル:**
- `app/(app)/index.tsx`（ホーム）
- `app/(app)/consult.tsx`（壁打ち）
- `app/(app)/post.tsx`（投稿）
- `app/(app)/calendar.tsx`（カレンダー）
- `app/(app)/settings.tsx`（設定）
- `app/(app)/favorites.tsx`（お気に入り）

**確認項目:**

### C-1. 初回体験（オンボーディング）
- ログイン後〜パートナー招待〜初投稿までの導線は自然か
- ペア未連携時の空状態CTAは十分か（V3-UX-5 の対応状況）
- アプリの価値提案が初回で伝わるか

### C-2. 壁打ち（consult）体験フロー
- reflection → aiDraftOptions → 文章選択 → 投稿 の流れはスムーズか
- v3後の全面書き直し後、会話継続・終了・新規開始の動線が明確か
- エラー時のフィードバックは適切か

### C-3. AI機能の使い勝手
- AI利用残数（無料5回）の表示タイミングと明確さ
- 課金誘導の自然さ（押しつけ感がないか）
- AI結果の長さ・トーンは夫婦アプリとして適切か

### C-4. 通知・再訪問設計
- 相手が投稿したときの通知設計があるか
- アプリを開き続けたくなるフックがあるか（ストリーク・ハイライト等）

### C-5. エラー・エッジケース体験
- ネットワーク切断時のUI
- パートナー未接続状態でAI機能を使おうとした場合
- AI利用上限到達時のメッセージとPaywall誘導

**出力形式:** 問題点をユーザーストーリー形式で記述（「〜しようとしたとき、〜で詰まる」）

---

## Track D — 課金・マネタイズフロー設計レビュー

**担当ファイル:**
- `docs/pricing-design.md`（設計書）
- `lib/db.ts`（UserProfile.premium / aiQuota関連）
- `functions/src/index.ts`（aiQuota消費ロジック）
- `app/(app)/settings.tsx`（課金UI現状）
- `components/` 内のAiQuotaChip等（存在確認）

**確認項目:**

### D-1. 実装状況の棚卸し
- `pricing-design.md` の設計と現在の実装のギャップを列挙
- `checkAndConsumeAiQuota` は6Functionsすべてに差し込まれているか
- RevenueCat連携コードは存在するか（`react-native-purchases`）

### D-2. 課金ロジックの安全性
- quotaの消費がサーバー側で保護されているか（クライアントバイパス不可か）
- `UserProfile.premium` の書き込み権限（Firestore Rules）
- ローリングリセット（初回利用日基準）の実装があるか

### D-3. 課金誘導UI設計評価
- 無料枠5回消費後のPaywallModal設計
- AiQuotaChipの配置（設定画面・入力画面）
- 課金CVR最大化の観点で、誘導タイミングは適切か

### D-4. テスト・検証計画
- RevenueCat Sandboxでのテスト手順が用意されているか
- β配布3ペアで課金フローを検証できるか

**出力形式:** 設計書との実装ギャップ表 + 実装優先度レコメンド

---

## 統合出力フォーマット

4トラックの結果を以下の構成で `docs/2026-MMDD-review-v4.md` に統合して出力：

```markdown
# ふたこと レビュー v4（2026-MM-DD）

## 🚨 今すぐ対応（5/31審査提出ブロッカー）
（各Trackのリジェクト必至・クラッシュ・データ喪失 相当をここに集約）

## A. App Store 審査対策
（Track A の結果）

## B. コード品質・残課題
（Track B の結果）

## C. UX・プロダクト
（Track C の結果）

## D. 課金・マネタイズ
（Track D の結果）

## 📋 優先度付き改善テーブル（全Track統合）
| 優先度 | ID | 項目 | 工数感 | Track |
|---|---|---|---|---|
...

## まとめ
5/31審査提出に向けた残タスクの総括（3行以内）
```

---

## 実行手順

1. 上記 **Track A・B・C・D を並行サブエージェントとして同時起動**
2. 各Trackは独立してコードを読み、指摘事項を返す
3. オーケストレーターが全結果を統合し、`docs/2026-MMDD-review-v4.md` に書き出す
4. ファイル名の `MMDD` は今日の日付に置換すること
