# Codex タスク: レビュー指摘修正ハンドオフ

このファイルは、別スレッドに貼ってそのまま修正を進めるための移行用プロンプト。

方針:

- Codex版レビューを正本として採用する
- Claude版レビューは補強として使う
- App Store審査提出前のP0/P1を優先する
- 既存の未コミット変更を絶対に雑に上書きしない

---

## 別スレッドに貼るプロンプト

```text
プロジェクトパス: /Users/okabehiroyuki/futakoto

あなたはこのリポジトリの修正担当です。
あなたがClaude Codeであっても、このタスクでは `docs/reviews/2026-05-16-codex-multi-agent-review.md` を正本として扱ってください。Claude版レビューは補強材料であり、優先順位はこのハンドオフファイルに従ってください。
以下の方針で、レビュー指摘の修正を実装してください。

## 最重要方針

- `docs/reviews/2026-05-16-codex-multi-agent-review.md` を正本として採用する
- `docs/reviews/2026-05-16-CLAUDE-multi-agent-review.md` は補強材料として使う
- 修正優先順位はこのファイル `docs/CODEX-TASK-review-fixes-handoff.md` に従う
- 既存の未コミット変更が多いので、必ず `git status --short` と対象ファイルの `git diff` を読んでから編集する
- 自分が触っていない変更を戻さない
- docs/INBOX の画像移動・削除、eval結果ファイルなど、今回の修正と無関係な差分は触らない

## 最初に読むファイル

1. `AGENTS.md`
2. `.design/system.md`
3. `docs/reviews/2026-05-16-codex-multi-agent-review.md`
4. `docs/reviews/2026-05-16-CLAUDE-multi-agent-review.md`
5. `docs/app/release-status.md`
6. 対象ファイルの現在diff

## 進め方

まず Phase 0 を実行し、各修正項目を `済 / 未 / 部分対応 / 要確認` に仕分けしてください。
その後、Phase 1 から順に実装してください。

実装中は、既存変更と衝突する場合は既存変更を尊重して最小差分で直してください。
大きなリファクタは避け、審査提出前のP0/P1を短く安全に潰してください。

## Phase 0: 現状棚卸し

実行:

```bash
git status --short
git diff -- app/(app)/post.tsx app/(app)/consult.tsx app/(app)/calendar.tsx app/_layout.tsx components/PaywallModal.tsx components/AiConsentModal.tsx functions/src/shared.ts functions/src/ai-functions.ts functions/src/pairing.ts firestore.rules lib/auth.tsx app/(app)/settings/partner.tsx
```

確認:

- 既にClaudeCode側で修正済みの項目
- 未修正の項目
- 部分対応だが追加修正が必要な項目
- 外部確認が必要な項目

外部確認扱い:

- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` は `eas.json` に出ていなくてもEAS Secretに設定済みの可能性がある。`docs/app/release-status.md` では設定済み扱いなので、「未設定確定」と断定しない。
- Sandbox購入/復元、審査用アカウントはリポジトリだけでは確定できないため、コード修正ではなくチェックリスト更新に留める。

## Phase 1: Codex P0 修正

### 1. AI同意保存失敗後のAI送信を止める

対象:

- `app/(app)/post.tsx`
- `app/(app)/consult.tsx`

修正:

- `finally` でAI実行しない
- `setAiConsentAcknowledged()` と `refreshProfile()` が成功した場合だけAIを実行
- 失敗時は `classifyError` または既存のエラー処理でAlertを出す

期待:

- 同意保存失敗時に `runAiRewrite()` / `handleConsult()` が走らない

### 2. 月次AI要約にもAI同意ガードを入れる

対象:

- `app/(app)/calendar.tsx`

修正:

- `handleAiSummary()` 実行前に `profile.aiConsentAcknowledged` を確認
- 未同意なら `AiConsentModal` を表示
- 同意保存成功後だけ月次要約を実行

期待:

- AIリライト、AI相談、気持ち読み解き、月次要約の全AI機能で同意ガードが揃う

### 3. `aiConsult` schema不整合を修正

対象:

- `functions/src/shared.ts`
- `functions/src/ai-functions.ts`
- `hooks/useConsultSession.ts`

現状:

- `functions/src/shared.ts` の `CONSULT_SCHEMA` は `reflection` / `readyForDraft` 必須
- `functions/src/ai-functions.ts` とクライアントは `reply` を期待

修正方針:

- 現行クライアントに合わせて `reply` に統一する

例:

```ts
const CONSULT_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  required: ['reply'],
  properties: {
    reply: STRING_SCHEMA,
  },
};
```

期待:

- `aiConsult` が `reply` を返し、`hooks/useConsultSession.ts` の `nextResult.reply` と一致する

### 4. 法務リンクを公開済みURLへ統一

対象:

- `components/PaywallModal.tsx`
- `components/AiConsentModal.tsx`
- `app/(app)/settings/account.tsx` など法務リンクがある画面

修正:

- `https://futakoto.app/...` を使わない
- 公開済みURLへ統一する

候補:

- `https://futakoto.web.app/privacy.html`
- `https://futakoto.web.app/terms.html`

期待:

- アプリ内のプライバシーポリシー/利用規約リンクが審査時に開ける

### 5. Paywallに解約方法を明記

対象:

- `components/PaywallModal.tsx`

修正:

- 「解約はApp Storeのサブスクリプション管理からいつでも行えます」の文言を追加
- 無料トライアルがないなら、無料トライアルを連想する文言は避ける

## Phase 2: セキュリティP0修正

### 6. `inviteCodes` をクライアントから読めないようにする

対象:

- `firestore.rules`
- `functions/src/pairing.ts`

修正:

- `inviteCodes` の `allow read` を禁止
- `pairWithCode` のCloud FunctionだけがAdmin SDKで参照する
- 招待コードの形式検証を追加する

例:

```firestore
match /inviteCodes/{code} {
  allow read, create, update, delete: if false;
}
```

```ts
const normalizedCode = code.trim().toUpperCase();
if (!/^[A-HJ-KM-NP-Z2-9]{6}$/.test(normalizedCode)) {
  throw new HttpsError('invalid-argument', '招待コードの形式が正しくありません');
}
```

期待:

- クライアントSDKから `inviteCodes/{code}` を直接読めない
- ペアリングは `pairWithCode` 経由で継続動作する

### 7. `aiInterpret` cache lookup を権限確認後に移動

対象:

- `functions/src/ai-functions.ts`
- `functions/src/triggers.ts`

修正:

- `entryId` / `entryOwnerId` がある場合、投稿存在・ペア関係・`visibility === 'shared'` を確認してからcacheを返す
- 投稿編集やvisibility変更時に関係する `interpretationCache` を削除する

期待:

- sharedからprivateに戻した投稿の古い解釈キャッシュを相手が読めない

## Phase 3: 安定性P1修正

### 8. Auth guardで未認証時に保護画面を描画しない

対象:

- `app/_layout.tsx`

修正:

- `loading` 中はローダーまたは `null`
- `!user && inApp` の場合は `<Slot />` を描画しない

期待:

- サインアウト直後や起動直後に `(app)` 画面が一瞬見えない

### 9. calendar初期ロード失敗で無限ローディングにしない

対象:

- `app/(app)/calendar.tsx`

修正:

- 初期 `load()` 全体を `try/catch/finally`
- 失敗時はAlertまたは画面内エラー表示
- 必ず `setLoading(false)` する

### 10. AI関数の内部エラー詳細をクライアントに返さない

対象:

- `functions/src/ai-functions.ts`

修正:

- `throw new HttpsError('internal', \`AI処理に失敗しました: ${e.message}\`)` をやめる
- 詳細は `logger.error` に出す
- クライアントには固定文を返す

例:

```ts
logger.error('AI error', { fn: 'aiConsult', message: e?.message });
throw new HttpsError('internal', 'AI処理に失敗しました');
```

### 11. Cloud Functionsにコスト上限を入れる

対象:

- `functions/src/shared.ts`

修正:

- `AI_FUNCTION_OPTIONS` に `maxInstances` と `timeoutSeconds`
- 可能なら `PAIR_OPTIONS` にも `maxInstances`

例:

```ts
export const AI_FUNCTION_OPTIONS = {
  secrets: [GEMINI_API_KEY],
  region: REGION,
  invoker: 'public',
  maxInstances: 10,
  timeoutSeconds: 30,
};
```

## Phase 4: Claude補強を採用

### 12. アクセシビリティ赤項目

対象:

- `components/PaywallModal.tsx`
- `components/AiConsentModal.tsx`
- `app/(app)/consult.tsx`
- `app/(app)/post.tsx`
- `app/login.tsx`
- `components/HomeMoodInput.tsx`

採用する修正:

- Modal内に `accessibilityViewIsModal`
- 閉じるボタンに `accessibilityRole="button"` と `accessibilityLabel`
- TextInputに `accessibilityLabel`
- 主要タップ領域を44pt以上にする
- 共有範囲ボタンに `accessibilityState={{ selected: ... }}`

注意:

- `lib/theme.ts` の色変更は既存デザインに影響が大きいので、P0修正後に別コミットでもよい

### 13. アナリティクス補強

対象:

- `app/(app)/settings/partner.tsx`
- `app/(app)/index.tsx`
- `app/(app)/calendar.tsx`
- `lib/auth.tsx`

修正:

- ペアリング成功時に `trackPairCompleted()`
- `aiInterpret` 成功時に `trackAiFeatureUsed('interpret')`
- `aiSummary` 成功時に `trackAiFeatureUsed('summary')`
- Auth state changeで `Sentry.setUser({ id: uid })`、ログアウト時に `Sentry.setUser(null)`

注意:

- Firebase Analytics SDK自体の置換は大きいので、今回は呼び出し漏れ補正まででよい

## Phase 5: 検証

最低限実行:

```bash
cd /Users/okabehiroyuki/futakoto/functions && npm run build
cd /Users/okabehiroyuki/futakoto && npm exec tsc -- --noEmit
```

`tsc` が既存のeval/test系で落ちる場合:

- エラー内容を報告
- 今回修正由来の型エラーがないか切り分ける

可能なら実行:

```bash
cd /Users/okabehiroyuki/futakoto && npm run lint
```

## 完了時の報告フォーマット

最後に以下を報告してください。

```md
## 修正結果

- 実装した項目:
- 未対応/保留:
- 外部確認が必要:
- 触ったファイル:

## 検証

- `functions npm run build`: 成功/失敗
- `npm exec tsc -- --noEmit`: 成功/失敗
- その他:

## 次に人間がやること

- EAS Secret確認:
- Sandbox購入/復元:
- 審査用ペアリング済みアカウント:
- TestFlight確認:
```
```

---

## 補足: このタスクの正本

正本:

- `docs/reviews/2026-05-16-codex-multi-agent-review.md`

補強:

- `docs/reviews/2026-05-16-CLAUDE-multi-agent-review.md`

関連:

- `docs/app/release-status.md`
- `docs/REVIEW-PROMPT.md`

---

## 人間向けメモ

このプロンプトで別スレッドに渡すときは、上の「別スレッドに貼るプロンプト」全体を貼ればよい。

ClaudeCode側がすでに触っている可能性が高いファイル:

- `app.config.js`
- `app/(app)/post.tsx`
- `app/(app)/settings/account.tsx`
- `app/(app)/settings/ai.tsx`
- `app/(app)/settings/partner.tsx`
- `app/_layout.tsx`
- `app/login.tsx`
- `components/AiConsentModal.tsx`
- `components/HomeMoodInput.tsx`
- `components/PaywallModal.tsx`
- `functions/src/ai-functions.ts`
- `functions/src/shared.ts`
- `hooks/useConsultSession.ts`
- `lib/ai.ts`
- `lib/db.ts`
- `lib/firebase.ts`

よって、別スレッドでは必ず差分を読ませてから実装させること。
