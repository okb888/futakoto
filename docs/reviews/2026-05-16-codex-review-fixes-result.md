# ふたこと Codexレビュー指摘 修正実装結果 2026-05-16

> 実装者: Claude Code (Opus 4.7)
> 正本: `docs/reviews/2026-05-16-codex-multi-agent-review.md`
> ハンドオフ: `docs/CODEX-TASK-review-fixes-handoff.md`
> ブランチ: `codex/fix-review-p3-p4`

---

## サマリー

App Store審査提出前に必要な P0 (7項目) と P1 (4項目) をすべて実装。加えてアクセシビリティ赤項目とアナリティクス補強も完了。

- **P0**: 7/7 完了
- **P1**: 4/4 完了
- **Phase 4 (a11y + 計測)**: 完了
- **検証**: `functions npm run build` 成功、`npx tsc --noEmit` でアプリ側コードはエラーなし

---

## 実装した項目

### P0 (App Store提出前必須)

#### P0-1: AI同意保存失敗後のAI送信を止める

**対象**:
- [app/(app)/post.tsx](app/(app)/post.tsx)
- [app/(app)/consult.tsx](app/(app)/consult.tsx)

**修正内容**:
`finally` でAI送信していた箇所を、`try` 成功時のみAIを実行するように変更。失敗時は `classifyError` でAlert表示しモーダルを閉じる。

```ts
async function handleAgreeConsent() {
  if (!user) return;
  try {
    await setAiConsentAcknowledged(user.uid);
    await refreshProfile();
    setConsentOpen(false);
    await runAiRewrite();
  } catch (e: any) {
    const c = classifyError(e);
    Alert.alert(c.title, c.message);
    setConsentOpen(false);
  }
}
```

`consult.tsx` には `Alert`、`classifyError` のインポートを追加。

#### P0-2: 月次AI要約に同意ガード追加

**対象**: [app/(app)/calendar.tsx](app/(app)/calendar.tsx)

**修正内容**:
- `AiConsentModal` を import
- `consentOpen` / `pendingSummary` state を追加
- `handleAiSummary` を「同意確認のみ行うフロー」に整理し、`runAiSummary` を分離
- `aiConsentAcknowledged !== true` のときは `AiConsentModal` を表示
- `handleAgreeAiConsent` で同意保存成功後だけ `runAiSummary` を実行

#### P0-3: aiConsult schema不整合修正

**対象**: [functions/src/shared.ts](functions/src/shared.ts)

**修正内容**:
`CONSULT_SCHEMA` を `reflection` / `readyForDraft` 必須から `reply` 必須に変更。クライアントの期待値 (`json.reply`) と一致。

```ts
const CONSULT_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  required: ['reply'],
  properties: {
    reply: STRING_SCHEMA,
  },
};
```

#### P0-4: 法務リンクを公開済みURLへ統一

**対象**:
- [components/PaywallModal.tsx](components/PaywallModal.tsx)
- [components/AiConsentModal.tsx](components/AiConsentModal.tsx)
- [app/(app)/settings/index.tsx](app/(app)/settings/index.tsx)

**修正内容**:
- `https://futakoto.app/...` → `https://futakoto.web.app/...`
- `https://futakoto.jp/...` (DNS未接続) → `https://futakoto.web.app/...`

統一後のURL:
- `https://futakoto.web.app/privacy.html`
- `https://futakoto.web.app/terms.html`
- `https://futakoto.web.app/support.html`

#### P0-5: Paywallに解約方法を明記

**対象**: [components/PaywallModal.tsx](components/PaywallModal.tsx)

**修正内容**:
priceNote に「解約は端末の『設定 → Apple ID → サブスクリプション』から行えます」を追記。

#### P0-6: inviteCodes read禁止 + pairWithCode形式検証

**対象**:
- [firestore.rules](firestore.rules)
- [lib/db.ts](lib/db.ts)
- [functions/src/pairing.ts](functions/src/pairing.ts)

**修正内容**:
- `firestore.rules`: `inviteCodes` の `read, create, update, delete` をすべて `false`
- `lib/db.ts`: 未使用になった `findUidByCode` を削除
- `functions/src/pairing.ts`: 招待コード形式 `^[A-HJ-KM-NP-Z2-9]{6}$` の検証を追加

```ts
const normalizedCode = code.trim().toUpperCase();
if (!/^[A-HJ-KM-NP-Z2-9]{6}$/.test(normalizedCode)) {
  throw new HttpsError('invalid-argument', '招待コードの形式が正しくありません');
}
```

#### P0-7: aiInterpret cache lookupを権限確認後に移動

**対象**:
- [functions/src/ai-functions.ts](functions/src/ai-functions.ts)
- [functions/src/triggers.ts](functions/src/triggers.ts)

**修正内容**:
- `aiInterpret`: 権限確認 (ペア関係・投稿存在・visibility) をキャッシュ参照より先に実行
- `invalidateInterpretationCacheOnEntryUpdate`: `memo`/`mood` に加え `visibility` 変更時もキャッシュを無効化

これで shared → private に戻した投稿の古い解釈キャッシュを相手が読めなくなる。

---

### P1 (審査前強く推奨)

#### P1-1: Auth guardで未認証時に保護画面を描画しない

**対象**: [app/_layout.tsx](app/_layout.tsx)

**修正内容**:
`loading` 中 or `!user && inApp` の場合、`<Slot />` の代わりに `ActivityIndicator` を返す。起動直後・サインアウト直後の `(app)` 画面チラ見えを防止。

#### P1-2: calendar初期ロード失敗の無限ローディング修正

**対象**: [app/(app)/calendar.tsx](app/(app)/calendar.tsx)

**修正内容**:
`load()` 全体を `try/catch/finally` で囲み、Firestore取得失敗時に Alert表示 + `setLoading(false)` を保証。

#### P1-3: AI関数のエラー詳細をクライアントに返さない

**対象**: [functions/src/ai-functions.ts](functions/src/ai-functions.ts)

**修正内容**:
6箇所すべての `throw new HttpsError('internal', \`AI処理に失敗しました: ${e.message}\`)` を、`logger.error` でサーバーログ + 固定文 `'AI処理に失敗しました'` に変更。

```ts
import * as logger from 'firebase-functions/logger';

// ...
} catch (e: any) {
  logger.error('AI error', { fn: 'aiConsult', message: e?.message });
  throw new HttpsError('internal', 'AI処理に失敗しました');
}
```

#### P1-4: Cloud Functionsにコスト上限

**対象**: [functions/src/shared.ts](functions/src/shared.ts)

**修正内容**:
- `AI_FUNCTION_OPTIONS`: `maxInstances: 10`, `timeoutSeconds: 60`
- `PAIR_OPTIONS`: `maxInstances: 10`, `timeoutSeconds: 30`

これで Gemini遅延・多アカウント攻撃時のコスト暴走を抑制。

---

### Phase 4: アクセシビリティ + アナリティクス補強

#### アクセシビリティ

| 対象 | 修正内容 |
|------|---------|
| [components/PaywallModal.tsx](components/PaywallModal.tsx) | `accessibilityViewIsModal`、閉じる/CTA/復元ボタンに `accessibilityRole`/`accessibilityLabel` |
| [components/AiConsentModal.tsx](components/AiConsentModal.tsx) | `accessibilityViewIsModal`、同意/あとでボタンにラベル |
| [app/login.tsx](app/login.tsx) | TextInput に `accessibilityLabel`/`textContentType`/`autoComplete` |
| [components/HomeMoodInput.tsx](components/HomeMoodInput.tsx) | 絵文字ボタンに `minHeight: 44` |
| [app/(app)/index.tsx](app/(app)/index.tsx) | 「気持ちを読み解く」ボタンに `minHeight: 44` |

#### アナリティクス補強

| 対象 | 修正内容 |
|------|---------|
| [app/(app)/settings/partner.tsx](app/(app)/settings/partner.tsx) | ペアリング成功時に `trackPairCompleted()` |
| [app/(app)/index.tsx](app/(app)/index.tsx) | `aiInterpret` 成功時に `trackAiFeatureUsed('interpret')`、quota時に `trackAiQuotaExceeded`/`trackPaywallShown` |
| [app/(app)/calendar.tsx](app/(app)/calendar.tsx) | `aiSummary` 成功時に `trackAiFeatureUsed('summary')`、quota時も同様 |
| [lib/auth.tsx](lib/auth.tsx) | AuthState変化時に `Sentry.setUser({ id: uid })`、ログアウト時 `Sentry.setUser(null)` |

---

## 未対応/保留

| 項目 | 理由 |
|------|------|
| `lib/theme.ts` のブランド主色変更 (P1-5) | 既存デザインに影響大。ハンドオフで「別コミットでも可」とされている |
| Firebase Analytics SDK のネイティブ置換 (P2-6) | 大規模変更。今回は呼び出し漏れ補正のみ |
| `unpairPartner` のページング削除 (P3-3) | β後・運用改善スコープ |
| RevenueCatイベント順序チェック (P3-4) | β後・運用改善スコープ |
| ScrollView→FlatList 移行 (P2-3) | β後・運用改善スコープ |
| AI関数のGemini呼び出し個別timeout | 関数レベル `timeoutSeconds` で代替。SDK個別timeoutはサポート要確認 |

---

## 外部確認が必要

- **EAS Secret 確認**: `EXPO_PUBLIC_REVENUECAT_IOS_KEY` が EAS Secret に登録されているか
- **Sandbox購入/復元**: TestFlight 実機で動作確認
- **審査用ペアリング済みアカウント**: リポジトリでは確認不能
- **Firestore Rules デプロイ後の動作**: `inviteCodes` read禁止後にペアリングフローが動くか
- **Cloud Functions デプロイ後の反映**: `maxInstances`/`timeoutSeconds` 確認

---

## 触ったファイル一覧

### アプリ側

- `app/(app)/calendar.tsx`
- `app/(app)/consult.tsx`
- `app/(app)/index.tsx`
- `app/(app)/post.tsx`
- `app/(app)/settings/index.tsx`
- `app/(app)/settings/partner.tsx`
- `app/_layout.tsx`
- `app/login.tsx`
- `components/AiConsentModal.tsx`
- `components/HomeMoodInput.tsx`
- `components/PaywallModal.tsx`
- `lib/auth.tsx`
- `lib/db.ts`

### サーバー側

- `firestore.rules`
- `functions/src/ai-functions.ts`
- `functions/src/pairing.ts`
- `functions/src/shared.ts`
- `functions/src/triggers.ts`

---

## 検証

| 検証 | 結果 |
|------|------|
| `cd functions && npm run build` | ✅ 成功 (tsc クリーン) |
| `npx tsc --noEmit` (アプリ側) | ✅ エラーなし |
| 既存の事前エラー | `functions/src/__tests__/` の jest 型不足、`eval/*.ts` の `.ts` 拡張子、`index.ts` の App module not found (今回の修正と無関係) |

---

## TestFlight確認項目 (人間タスク)

### 認証・初期動線

- [ ] 新規登録
- [ ] メールログイン
- [ ] Apple Sign in
- [ ] Google Sign in
- [ ] ログアウト直後に (app) 画面チラ見えしないか

### ペアリング

- [ ] 招待コード形式エラー (5文字、I/L/O含む等) で適切なエラー表示
- [ ] 正しいコードでペアリング成功
- [ ] ペアなし状態でホーム/投稿/設定が落ちない

### AI機能 (同意モーダル)

- [ ] AIリライトで同意モーダル表示 → 「あとで」でAI実行されない
- [ ] AIリライトで同意モーダル → 同意 → リライト実行
- [ ] AI相談で同意モーダル → 「あとで」でAI実行されない
- [ ] 気持ち読み解きで同意モーダル → 「あとで」でAI実行されない
- [ ] 月次AI要約で同意モーダル表示 (P0-2)
- [ ] 月次AI要約で「あとで」→ 要約実行されない

### AI機能 (動作)

- [ ] AI相談が応答する (P0-3 schema修正の確認)
- [ ] 気持ち読み解きで投稿 visibility 変更後、相手の解釈キャッシュが消える (P0-7)

### Paywall

- [ ] 解約方法の文言が表示される (P0-5)
- [ ] 法務リンクから利用規約・プライバシーポリシーが開ける (P0-4)
- [ ] Sandbox購入
- [ ] 購入復元

### その他

- [ ] カレンダー初期ロード失敗時にAlert表示 (P1-2)
- [ ] オフライン起動
- [ ] アカウント削除

---

## デプロイチェックリスト

- [ ] `firebase deploy --only firestore:rules` (inviteCodes read禁止)
- [ ] `firebase deploy --only functions` (CONSULT_SCHEMA, pairWithCode形式検証, AI関数のerrorメッセージ、maxInstances/timeoutSeconds)
- [ ] EAS Build で iOS バイナリ生成
- [ ] TestFlight 配布
- [ ] App Review Notes 更新 (ペアリング済みデモアカウント情報など)

---

## Codex版レビューの判定への影響

| 判定 | 修正前 | 修正後 |
|------|--------|--------|
| App Store審査提出判定 | **HOLD** | **GO候補** (TestFlight検証後) |

レビュー指摘の通り、AI同意・schema不整合・法務リンク・inviteCodes・aiInterpret cacheの5大リスクは塞いだ。残るは TestFlight 実機検証と運用面 (EAS Secret、デモアカウント) のみ。
