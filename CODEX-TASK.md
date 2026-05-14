# Codex タスク: P3/P4 修正

> **重要**: このリポジトリ (`okb888/futakoto`) のルートディレクトリで作業してください。
> Obsidian Vault や別のディレクトリを探す必要はありません。
> 最初に `AGENTS.md`（リポジトリルートにあります）を読んでプロジェクト構成を把握してください。

---

## Fix 1 — `app/(app)/calendar.tsx`

パートナーエントリをフォーカス毎に毎回全件取得している。`myEntriesCache` と同様に `partnerEntriesCache` を実装してキャッシュする。

### 変更内容

**Step 1: `useState` にキャッシュを追加**

```ts
// BEFORE (約97行目付近)
const [partnerEntries, setPartnerEntries] = useState<Entry[]>([]);

// AFTER
const [partnerEntries, setPartnerEntries] = useState<Entry[]>([]);
const [partnerEntriesCache, setPartnerEntriesCache] = useState<Record<string, Entry[]>>({});
```

**Step 2: `load` 関数内のパートナーエントリ取得をキャッシュ対応に変更**

```ts
// BEFORE (約170-178行目付近)
    if (p?.partnerUid) {
      const pp = await getUserProfile(p.partnerUid);
      if (isCancelled()) return;
      setPartnerProfile(pp);
      const partner = await getPartnerSharedEntries(p.partnerUid, 500);
      if (isCancelled()) return;
      setPartnerEntries(partner);

// AFTER
    if (p?.partnerUid) {
      const pp = await getUserProfile(p.partnerUid);
      if (isCancelled()) return;
      setPartnerProfile(pp);
      if (partnerEntriesCache[currentMonth]) {
        setPartnerEntries(partnerEntriesCache[currentMonth]);
      } else {
        const partner = await getPartnerSharedEntries(p.partnerUid, 500);
        if (isCancelled()) return;
        const newPartnerCache = trimCache({ ...partnerEntriesCache, [currentMonth]: partner });
        setPartnerEntries(partner);
        setPartnerEntriesCache(newPartnerCache);
      }
```

**Step 3: `useFocusEffect` の依存配列に `partnerEntriesCache` を追加しない**（`load` が closure でキャプチャするため `useCallback` の deps は変更不要）

---

## Fix 2 — `app/(app)/index.tsx`

`getAllInterpretationCaches(user.uid)` をフォーカス毎に全件取得している。件数上限を追加して読み取りコストを削減する。

### 変更内容

`lib/db.ts` の `getAllInterpretationCaches` 関数（または呼び出し箇所）に limit を追加する。

**`app/(app)/index.tsx` の呼び出し箇所**

```ts
// BEFORE (約79行目)
caches = await getAllInterpretationCaches(user.uid);

// AFTER
caches = await getAllInterpretationCaches(user.uid, 200);
```

**`lib/db.ts` の `getAllInterpretationCaches` 関数定義を変更**

現在の定義を探して limit パラメータを追加する:

```ts
// BEFORE
export async function getAllInterpretationCaches(uid: string): Promise<Record<string, string[]>> {
  const snap = await db.collection(`users/${uid}/interpretationCache`).get();

// AFTER
export async function getAllInterpretationCaches(uid: string, limit = 500): Promise<Record<string, string[]>> {
  const snap = await db.collection(`users/${uid}/interpretationCache`).limit(limit).get();
```

---

## Fix 3 — `lib/ai.ts`

`call` 関数の `data` パラメータが `any` 型になっている。

```ts
// BEFORE (約44行目)
async function call<T>(name: string, data: any): Promise<T> {

// AFTER
async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
```

`call` の呼び出し元（同ファイル内）も確認し、型エラーが出る場合は `data` を `Record<string, unknown>` にキャストする。

---

## Fix 4 — `firestore.rules`

エントリの `allow write` を `allow create` / `allow update` / `allow delete` に分離し、`create` 時に `uid` フィールドの整合性と `visibility` 値を強制する。

```
// BEFORE (約41-48行目)
      match /entries/{entryId} {
        allow read: if request.auth.uid == uid ||
          (
            get(/databases/$(database)/documents/users/$(uid)).data.partnerUid == request.auth.uid &&
            resource.data.visibility == 'shared'
          );
        allow write: if request.auth.uid == uid;
      }

// AFTER
      match /entries/{entryId} {
        allow read: if request.auth.uid == uid ||
          (
            get(/databases/$(database)/documents/users/$(uid)).data.partnerUid == request.auth.uid &&
            resource.data.visibility == 'shared'
          );
        allow create: if request.auth.uid == uid
          && request.resource.data.uid == request.auth.uid
          && request.resource.data.visibility in ['shared', 'private'];
        allow update, delete: if request.auth.uid == uid;
      }
```

---

## 完了条件

- 上記4ファイルを修正してPRを作成する
- PRタイトル: `fix: P3/P4 コードレビュー指摘修正（キャッシュ・型安全・Rulesアクセス制御）`
- 既存のコードスタイル・インデントを維持すること
- TypeScript の型エラーがないことを確認すること（`tsc --noEmit` を実行）
