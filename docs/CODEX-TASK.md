# Codex タスク: コードレビュー指摘修正

詳細なレビュー結果は `docs/reviews/2026-05-14-code-review.md` にあります。
以下の6件を修正してPRを作成してください。

---

## Fix 1 — `app/(app)/post.tsx`

`handleAgreeConsent` 関数の `finally` に `runAiRewrite()` が入っていてコンセント失敗でもAIが実行される。
`finally` を廃止し、成功時のみ実行する形に変える。

```ts
// BEFORE
async function handleAgreeConsent() {
  if (!user) return;
  try {
    await setAiConsentAcknowledged(user.uid);
    await refreshProfile();
  } finally {
    setConsentOpen(false);
    await runAiRewrite();
  }
}

// AFTER
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

`classifyError` が `../../lib/errors` からインポートされているか確認し、なければ追加する。

---

## Fix 2 — `functions/src/account.ts`

`deleteAccount` の `onCall` に `invoker: 'public'` が欠けている。

```ts
// BEFORE
export const deleteAccount = onCall(
  { region: REGION },

// AFTER
export const deleteAccount = onCall(
  { region: REGION, invoker: 'public' },
```

---

## Fix 3 — `firestore.rules`

`inviteCodes` の `allow read` が list（全件列挙）も許可している。`get` のみに制限する。

```
// BEFORE
match /inviteCodes/{code} {
  allow read: if request.auth != null;
  allow create, update, delete: if false;
}

// AFTER
match /inviteCodes/{code} {
  allow get: if request.auth != null;
  allow list: if false;
  allow create, update, delete: if false;
}
```

---

## Fix 4 — `components/AiQuotaChip.tsx`

`profile.premium` だけで判定し `premiumExpiresAt` の期限切れを無視している。

`export function AiQuotaChip` の直前にヘルパー関数を追加し、判定を差し替える。

```ts
// 追加するヘルパー関数
function isProfilePremiumActive(p: UserProfile): boolean {
  if (!p.premium) return false;
  const exp = p.premiumExpiresAt as any;
  if (!exp) return true;
  const ms = typeof exp?.toMillis === 'function' ? exp.toMillis() : 0;
  return ms === 0 || ms > Date.now();
}

// if (profile.premium) { を以下に変更
if (isProfilePremiumActive(profile)) {
```

---

## Fix 5 — `app/(app)/calendar.tsx`

`handleAiSummary` の catch ブロックでクォータ超過時に Paywall を表示していない。

```ts
// BEFORE
} catch (e: any) {
  Alert.alert('エラー', firebaseErrorMessage(e));
}

// AFTER
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

`classifyError` を `../../lib/errors` からインポートに追加する（`firebaseErrorMessage` は残す）。

---

## Fix 6 — `functions/src/revenuecat-webhook.ts`

Authorization 比較をタイミングセーフにする。

```ts
// ファイル先頭に import 追加
import { timingSafeEqual } from 'crypto';

// revenuecatWebhook の前にヘルパー関数追加
function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// 比較箇所を変更
// BEFORE: if (provided !== expected) {
// AFTER:  if (!safeStringEqual(provided, expected)) {
```

---

## 完了条件

- 上記6ファイルを修正してPRを作成する
- PRタイトル: `fix: コードレビュー指摘事項を修正（P1/P2）`
- 既存のコードスタイル・インデントを維持すること
