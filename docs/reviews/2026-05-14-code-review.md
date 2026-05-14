# ふたこと コードレビュー 2026-05-14

TestFlight β配布直前・App Store審査提出（5/31）に向けたセキュリティ・品質レビュー。

---

## P1 修正タスク（審査前必須）

### P1-1: `post.tsx:191-199` — handleAgreeConsent の finally バグ
**問題**: `finally` ブロックで常に `runAiRewrite()` が実行される。`setAiConsentAcknowledged` が失敗（ネットワークエラー等）してもAIが実行され、同意未保存でデータ送信が起きる。

**修正**:
```ts
// app/(app)/post.tsx
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

---

### P1-2: `functions/src/account.ts:4-5` — deleteAccount の invoker 未設定
**問題**: 他のすべての callable functions は `invoker: 'public'` を明示しているが `deleteAccount` だけ省略。Firebase v2 のデフォルト次第でクライアントから 403 になる。App Store 審査でアカウント削除機能は必須要件。

**修正**:
```ts
// functions/src/account.ts
export const deleteAccount = onCall(
  { region: REGION, invoker: 'public' },
  async (request) => {
```

**確認**: デプロイ後に `deleteAccount` が実際にクライアントから呼べるか動作確認必須。

---

### P1-3: `firestore.rules:7` — inviteCodes の全 UID 列挙可能
**問題**: `allow read` は `get`（単一取得）と `list`（コレクション一覧）の両方を許可する。認証済みユーザーが `getDocs(collection(db, 'inviteCodes'))` で全ユーザーの uid をマッピングできる。

**修正**:
```firestore
match /inviteCodes/{code} {
  allow get: if request.auth != null;   // 単一取得のみ
  allow list: if false;                 // 列挙禁止
  allow create, update, delete: if false;
}
```

---

### P1-4: `components/AiQuotaChip.tsx:17` — Premium 期限切れを無視した「無制限」表示
**問題**: `profile.premium` が `true` なら期限に関わらず「無制限」表示。Webhook で `premium = false` になるまでの間、期限切れでも「無制限」が出続ける（AI制限自体はサーバー側で正しく動くが UX が misleading）。

**修正**:
```ts
// components/AiQuotaChip.tsx
function isProfilePremiumActive(profile: UserProfile): boolean {
  if (!profile.premium) return false;
  const exp = profile.premiumExpiresAt as any;
  if (!exp) return true;
  const ms = typeof exp?.toMillis === 'function' ? exp.toMillis() : 0;
  return ms === 0 || ms > Date.now();
}

// chip の判定を変更（行17）
if (isProfilePremiumActive(profile)) {
  return (
    <TouchableOpacity style={[styles.chip, styles.chipPremium]} onPress={onPress} activeOpacity={0.7}>
      ...
    </TouchableOpacity>
  );
}
```

---

## P2 修正タスク（β 配布中）

### P2-1: `calendar.tsx:254-259` — aiSummary のクォータ超過時に Paywall が出ない
**問題**: `Alert.alert('エラー', firebaseErrorMessage(e))` だけで、クォータ超過エラーでも Paywall が表示されない。

**修正**:
```ts
// app/(app)/calendar.tsx
} catch (e: any) {
  const classified = classifyError(e);
  if (classified.kind === 'quota') {
    setPaywallReason(classified.message);
    setPaywallOpen(true);
  } else {
    Alert.alert('エラー', classified.message);
  }
}
```

また `classifyError` / `COLORS` / `classifyError` のインポートが calendar.tsx に必要か確認すること（`firebaseErrorMessage` は現在インポート済み）。

---

### P2-2: `revenuecat-webhook.ts:99-100` — タイミングセーフでない比較
**問題**: `provided !== expected` は単純な文字列比較。RevenueCat は HMAC 署名を提供しないため、これが現状の最善だが、`crypto.timingSafeEqual` を使うとより堅固。

**修正**:
```ts
// functions/src/revenuecat-webhook.ts
import { timingSafeEqual } from 'crypto';

function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// 使用箇所（行 99-100 を差し替え）
if (!safeStringEqual(provided, expected)) {
  logger.warn('Unauthorized RevenueCat webhook request', { hasHeader: !!provided });
  res.status(401).send('Unauthorized');
  return;
}
```

---

## P3 修正タスク（β 後）

### P3-1: `calendar.tsx:174` — パートナー500件を毎フォーカスで全件取得
**問題**: `getPartnerSharedEntries(p.partnerUid, 500)` を画面フォーカス毎に実行。`myEntriesCache` と同様に `partnerEntriesCache` を実装する。

---

### P3-2: `index.tsx:79` — interpretationCache 全件をフォーカス毎取得
**問題**: `getAllInterpretationCaches(user.uid)` でフォーカス毎にコレクション全件を読む。ユーザーがパートナー投稿を多数解釈すると読み取りコストが増加。`onSnapshot` またはキャッシュ戦略の見直しが必要。

---

## P4 修正タスク（β 後・コード品質）

### P4-1: `lib/ai.ts:44` — `data: any`
```ts
// 変更前
async function call<T>(name: string, data: any): Promise<T>
// 変更後
async function call<T>(name: string, data: Record<string, unknown>): Promise<T>
```

### P4-2: `firestore.rules` — entry の uid フィールド整合性
クライアントがエントリ内の `uid` フィールドを任意の値に設定できる（自分のコレクション内のみ、実害は限定的）。
```firestore
allow create: if request.auth.uid == uid
  && request.resource.data.uid == request.auth.uid
  && request.resource.data.visibility in ['shared', 'private'];
```

### P4-3: `calendar.tsx` — 864行、責務分離が可能
`loadMonthEntries`・`handleAiSummary`・`renderDay`・マーキングロジック等をカスタムフックやサブコンポーネントに分離できる。

---

## 確認済み・問題なし

- AI クォータカウントはサーバーサイドトランザクション（`consumeAiQuota`）で完結、クライアント改ざん不可 ✓
- RevenueCat Webhook の `Authorization` ヘッダ検証は実装済み（シークレット使用）✓
- Premium 判定は `isPremiumUser` でサーバーサイド検証（`premiumExpiresAt` チェック含む）✓
- Firestore Security Rules: エントリへのクロスユーザーアクセス不可、`visibility == 'shared'` 強制済み ✓
- AI 機能の多重発火防止（`disabled={isLoading}`）全 AI ボタンに付いている ✓
- `wrapUserData` によるプロンプトインジェクション防御実装済み ✓
- Apple Sign-in の nonce 実装（rawNonce → SHA256 → Firebase）仕様通り ✓
- `onSnapshot` は使っていないためログアウト時のリスナーリークなし ✓
- `.env` / API キーはクライアントバンドルに混入していない（Firebase config は `EXPO_PUBLIC_` 設計通り）✓
- Cloud Functions の認証チェック（`if (!request.auth)`）全関数に適用済み ✓

---

## アーキテクチャ上の懸念（長期）

### AI クォータ消費の多重カウント
`aiDraftOptions` + `aiDraft` のセットで `aiConsult` が 2 カウント消費される。「伝え方を選んで文を生成する」1操作が実質 2 消費。無料ユーザー（月5回）の体験に直接影響する。UI 表示（AiQuotaChip）と実際の消費数の乖離がある。

### Premium チェックの3か所への散在
- `calendar.tsx:69-78` — `isPremium()` ローカル関数
- `AiQuotaChip.tsx:17` — `profile.premium` 直接参照
- `shared.ts:133-151` — `isPremiumUser()` サーバーサイド

→ `lib/profile.ts` 等に共通関数として一本化を推奨。
