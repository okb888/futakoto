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

### 4. consult.tsx のカスタムhook化 ✅ 対応済み
- **対応**: `hooks/useConsultSession.ts` を新規作成し、全状態・ハンドラを分離
  - `consult.tsx` は UI レンダリングのみに縮小（997行 → 約350行）
  - hook が返す値: 18 状態 + 12 ハンドラ

### 5. パートナー削除時のデータ残留 ✅ 対応済み
- **対応**: `deleteAccount` と `unpairPartner` にクリーンアップ処理を追加
  - `deleteAccount`: パートナー側の favorites/interpretationCache のうち削除ユーザーの投稿参照を先に削除
  - `unpairPartner`: 解除後に双方の favorites/interpretationCache から相手の投稿参照を削除

---

## 🟢 低優先度

### 6. calendar.tsx のメモリ使用監視 ✅ 対応済み
- **対応**: `trimCache()` 関数を追加し `MAX_CACHE_MONTHS = 6` でキャッシュサイズを上限管理
  - 月移動のたびに古い月から順に削除（最新6ヶ月を保持）

### 7. TypeScript 厳密モード確認 ✅ 対応済み
- **確認**: `tsconfig.json` に `strict: true` が設定済みであることを確認
- **対応**: `consumeAiQuota` の `Record<string, any>` → `Record<string, string | admin.firestore.FieldValue>` に変更

### 8. ユニットテスト追加 ✅ 対応済み
- **対応**: jest + ts-jest をセットアップし20テストを追加（全 pass）
  - `src/__tests__/shared.test.ts`: `detectCrisis`, `isBlank`, `generateInviteCode`, `wrapUserData`, `tokyoDateKey/MonthKey`, `consumeAiQuota`（クォータ制限・月次制限）
  - `src/__tests__/pairing.test.ts`: `pairWithCode` の各エラーケースと正常ケース
  - `npm test` で実行可能

### 9. ログ出力の統一 ✅ 対応済み（対応不要）
- **確認**: `functions/src/` 内に `console.*` 呼び出しは一切なし（全て HttpsError スロー方式で統一済み）

---

## 完了済み

| 日付 | タスク |
|---|---|
| 2026-05-09 | functions/src/index.ts を6ファイルに分割 |
| 2026-05-10 | Gemini APIキーを有料→無料枠（Google AI Studio）に切り替え。`firebase functions:secrets:set GEMINI_API_KEY --project futakoto` で更新・動作確認済み。モデル（gemini-2.5-flash）・品質に変化なし、レート制限のみ異なる（無料: 10 RPM / 500 RPD） |
| 2026-05-12 | consult.tsx を useConsultSession hook に分割（#4） |
| 2026-05-12 | calendar.tsx の myEntriesCache に MAX_CACHE_MONTHS=6 上限追加（#6） |
| 2026-05-12 | shared.ts の Record\<string,any\> を適切な型に修正（#7） |
| 2026-05-12 | jest + ts-jest セットアップ、20ユニットテスト追加（#8） |
| 2026-05-12 | functions/src/ の console 未使用を確認（#9） |
