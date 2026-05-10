# ふたこと 技術的やることリスト

**作成**: 2026-05-09（コードレビューより抽出）
**目的**: エンジニア視点の改善タスクを優先度別に管理する

---

## 🔴 高優先度

### 1. functions/src/index.ts の分割 ✅ 対応済み
- **問題**: 1,149行のmonolithicファイル。AI・ペアリング・通知・アカウント削除が混在
- **対応**: 以下の6ファイルに分割
  - `shared.ts` — 定数・型・スキーマ・ヘルパー関数・AIクライアント
  - `pairing.ts` — ペアリング関連 (ensureUserProfile, pairWithCode, unpairPartner, regenerateInviteCode)
  - `ai-functions.ts` — AI機能 (aiRewrite, aiConsult, aiDraftOptions, aiDraft, aiInterpret, aiSummary)
  - `notifications.ts` — 通知 (notifyPartnerOnSharedEntry, notifyPartnerOnVisibilityChange)
  - `account.ts` — アカウント削除 (deleteAccount)
  - `triggers.ts` — Firestoreトリガー (cleanupOnEntryDelete, invalidateInterpretationCacheOnEntryUpdate)
  - `index.ts` — re-exportのみ

### 2. settings.tsx の状態管理整理 ✅ 対応済み
- **対応**: `useSettingsProfile` カスタムhook作成 → useState 21個 → 12個に削減
  - 6つのローディングフラグ → `isLoading` オブジェクト1つ + `setLoad(key, value)` ヘルパー
  - `pickerHour` + `pickerMinute` → `pickerTime` オブジェクト
  - `deleteModalOpen` + `deletePassword` → `deleteModal` オブジェクト
  - `profile` + `partnerProfile` + `load` + `useFocusEffect` → `hooks/useSettingsProfile.ts` に分離

### 3. Firestore セキュリティルールの強化 ✅ 対応済み
- **対応**: `firestore.rules` を以下のように強化
  - `allow update` を `affectedKeys().hasOnly([...])` で書き込み可能フィールドを明示制限
    - 許可: `displayName`, `communicationStyle`, `lastVisibility`, `notificationSettings`
    - 禁止（Cloud Functions のみ）: `partnerUid`, `notificationMeta`, `aiCredits*`
  - `allow create` にサーバー管理フィールドの設定禁止を追加
  - `aiUsage` / `aiMonthlyUsage` サブコレクションのルールを明示追加（`read, write: if false`）

---

## 🟡 中優先度

### 4. consult.tsx のカスタムhook化
- **問題**: 壁打ちロジック全部（セッション管理・AI呼び出し・文案フロー）が1画面に集約（1,010行）
- **対応案**: `useConsultSession` カスタムhookを作成し、状態管理を分離
- **対象ファイル**: `app/(app)/consult.tsx`

### 5. パートナー削除時のデータ残留 ✅ 対応済み
- **対応**: `deleteAccount` と `unpairPartner` にクリーンアップ処理を追加
  - `deleteAccount`: パートナー側の favorites/interpretationCache のうち削除ユーザーの投稿参照を先に削除
  - `unpairPartner`: 解除後に双方の favorites/interpretationCache から相手の投稿参照を削除

---

## 🟢 低優先度

### 6. calendar.tsx のメモリ使用監視
- **問題**: `myEntriesCache` が肥大化する可能性
- **対応**: キャッシュサイズ上限 or TTL の設定を検討

### 7. TypeScript 厳密モード確認
- **確認**: `tsconfig.json` の `strict: true` が有効になっているか
- **対象**: `any` の使用箇所（`consumeAiQuota` の `Record<string, any>` 等）

### 8. ユニットテスト追加
- **現状**: `eval/` ディレクトリにAI評価テストはあるが、メイン機能のテストなし
- **対応案**: Cloud Functions の主要ロジック（`consumeAiQuota`, `pairWithCode`）にユニットテスト追加

### 9. ログ出力の統一
- **問題**: `console.error()` が散在、一貫したlogger未設定
- **対応**: Cloud Functions の logger（`import { logger } from 'firebase-functions'`）に統一

---

## 完了済み

| 日付 | タスク |
|---|---|
| 2026-05-09 | functions/src/index.ts を6ファイルに分割 |
| 2026-05-10 | Gemini APIキーを有料→無料枠（Google AI Studio）に切り替え。`firebase functions:secrets:set GEMINI_API_KEY --project futakoto` で更新・動作確認済み。モデル（gemini-2.5-flash）・品質に変化なし、レート制限のみ異なる（無料: 10 RPM / 500 RPD） |
