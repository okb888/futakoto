# Codex タスク: build 6 実機テスト後UX改善

詳細な背景・アプローチ比較は [`docs/reviews/2026-05-16-self-test-feedback.md`](./reviews/2026-05-16-self-test-feedback.md) を参照。
β配布デッドライン **5/20** までに Fix 1〜5 を完了、Fix 6 は可能なら、Fix 7 はβ後でOK。

---

## Fix 1 — ホーム起動速度: クエリ並列化

**ファイル**: `app/(app)/index.tsx`

`load()` 関数内の5本のFirestoreクエリを `Promise.all` で並列化する。

```ts
// BEFORE（逐次 await）
const p = authProfile ?? await refreshProfile();
const favorites = await getFavoriteEntryIds(user.uid);
const caches = await getAllInterpretationCaches(user.uid, 200);
const myEntries = await getRecentEntries(user.uid, 100);
// partnerUid があれば partnerProfile + partnerEntries も逐次

// AFTER（並列）
const p = authProfile ?? await refreshProfile();
if (!p) return;

const [favorites, caches, myEntries, partnerData] = await Promise.all([
  getFavoriteEntryIds(user.uid).catch(() => new Set<string>()),
  getAllInterpretationCaches(user.uid, 200).catch(() => ({})),
  getRecentEntries(user.uid, 100),
  p.partnerUid
    ? Promise.all([
        getUserProfile(p.partnerUid),
        getPartnerSharedEntries(p.partnerUid, 100),
      ]).then(([pp, pe]) => ({ pp, pe }))
    : Promise.resolve(null),
]);
```

`isCancelled()` チェックは並列化後も各 `setState` 前に維持すること。
エラー処理は既存の `console.error` 出力を保つ。

---

## Fix 2 — AI上限到達時のボタンを「Paywall起動」に変更

### 2-1. 相談タブ
**ファイル**: `app/(app)/consult.tsx`

「壁打ちする」ボタンが `disabled` になる挙動をやめ、上限時はタップで `PaywallModal` を開くようにする。

```ts
// BEFORE
<TouchableOpacity disabled={isQuotaExceeded} onPress={runConsult}>

// AFTER
<TouchableOpacity onPress={() => {
  if (isQuotaExceeded) {
    setPaywallReason('AI相談の無料枠を使い切りました');
    setPaywallOpen(true);
    return;
  }
  runConsult();
}}>
```

`PaywallModal` は既に他画面で使われているので、import + state追加 + JSX末尾にマウントするだけ。

### 2-2. ホームの「意図を読み解く」ボタン
**ファイル**: `app/(app)/index.tsx`

同様に上限時はPaywall起動。

### 2-3. 振り返りの「今月をAI要約」ボタン
**ファイル**: `app/(app)/calendar.tsx`

同様にPaywall起動。

---

## Fix 3 — ホーム右上のAI上限ピル廃止 + お気に入りリンク削除

**ファイル**: `app/(app)/index.tsx`

- `AiQuotaChip` のヘッダー表示を削除（コンポーネント自体は他で使う可能性があるので残す）
- ヘッダーから「お気に入り」への遷移リンクを削除（タブナビにお気に入りタブがあるため重複）

```ts
// 該当のヘッダー設定 useLayoutEffect / navigation.setOptions の headerRight を削除または簡素化
```

---

## Fix 4 — AI要約のFirestore永続化

### 4-1. データモデル追加
**ファイル**: `lib/db.ts`

```ts
// 新規追加
export type AiSummaryRecord = {
  id?: string;
  uid: string;
  month: string;          // 'YYYY-MM'
  target: 'me' | 'partner';
  text: string;
  entryCountAtGeneration: number;
  createdAt: Timestamp | FieldValue;
};

export async function saveAiSummary(
  uid: string,
  month: string,
  target: 'me' | 'partner',
  text: string,
  entryCount: number,
): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'aiSummaries'), {
    month,
    target,
    text,
    entryCountAtGeneration: entryCount,
    createdAt: serverTimestamp(),
  });
}

export async function getLatestAiSummary(
  uid: string,
  month: string,
  target: 'me' | 'partner',
): Promise<AiSummaryRecord | null> {
  const q = query(
    collection(db, 'users', uid, 'aiSummaries'),
    where('month', '==', month),
    where('target', '==', target),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, uid, ...(d.data() as Omit<AiSummaryRecord, 'id' | 'uid'>) };
}
```

### 4-2. Firestoreルール
**ファイル**: `firestore.rules`

`/users/{uid}/aiSummaries/{id}` への read/write を本人のみに許可。

```
match /users/{uid}/aiSummaries/{summaryId} {
  allow read, write: if request.auth.uid == uid;
}
```

### 4-3. カレンダー画面の連携
**ファイル**: `app/(app)/calendar.tsx`

- 画面マウント時に `getLatestAiSummary(uid, currentMonth, 'me')` を呼び、結果があれば `setAiSummaryText` する
- 生成成功時に `saveAiSummary` を呼ぶ
- ボタン文言を以下に変更:
  - 未生成: 「**今月をここまでで要約**」
  - 生成済み: 「**さらに最新で要約**」
- `currentMonth` が past month のときは「過去月の振り返りはプレミアム」を表示（今月時には表示しない）

---

## Fix 5 — 設定画面: プレミアムセクション追加 + 行整理

**ファイル**: `app/(app)/settings/index.tsx`

### 5-1. 「表示名」「パスワード・データ管理」を「アカウント設定」1行に統合
両方とも `account.tsx` に飛ぶため二重表示になっている。

```ts
// BEFORE: 2行（表示名 → / パスワード・データ管理 →）
// AFTER: 1行
<SettingRow
  label="アカウント"
  value={profile?.displayName ?? '未設定'}
  onPress={() => router.push('/(app)/settings/account')}
/>
```

### 5-2. 「AIアシスタント」を「AI口調・送信範囲」に改名
`ai.tsx` 画面の中身を表す具体名にする。

### 5-3. 「サブスクリプション」セクション新規追加
パートナー連携セクションと通知セクションの間に配置。

```tsx
<Text style={styles.sectionLabel}>サブスクリプション</Text>
<View style={styles.section}>
  <SettingRow
    label={isPremium ? "プレミアム（加入中）" : "プレミアム"}
    value={isPremium ? "解約・管理" : "無料5回 → 無制限"}
    onPress={() => setPaywallOpen(true)}
  />
</View>
```

`isPremium` 判定と `PaywallModal` のマウントを画面に追加。

---

## Fix 6 — 設定画面アイコン化（できれば）

**ファイル**: `app/(app)/settings/index.tsx`

参考デザイン: `docs/INBOX/アプリUI 参考画像/0D69556B-FAD4-4323-AC02-4198708964FE_1_105_c.jpeg`

### 6-1. `SettingRow` を拡張

```tsx
type SettingRowProps = {
  icon?: React.ReactNode;
  label: string;
  subtitle?: string;
  value?: string;
  showChevron?: boolean;
  danger?: boolean;
  onPress?: () => void;
};
```

アイコンコンテナ: 36×36px、`borderRadius: 10`、背景 `COLORS.borderSoft`、中に `phosphor-react-native` の線アイコン（薄グレー）。

### 6-2. アイコン割当

| 行 | アイコン |
|---|---|
| アカウント | `User` |
| パートナー連携 | `Heart` |
| 通知 | `Bell` |
| AI口調・送信範囲 | `Sparkle` |
| プレミアム | `Star` |
| お問い合わせ | `EnvelopeSimple` |
| 利用規約 | `FileText` |
| プライバシーポリシー | `Lock` |
| レビューで応援 | `Heart`（線版） |
| ログアウト | `SignOut` |
| アカウント削除 | `Trash` |

色は基本 `COLORS.text` の薄め1色。多色アイコンは使わない（参考画像のトーンを保つ）。

---

## Fix 7 — 振り返り画面の構造刷新（β後でOK）

**ファイル**: `app/(app)/calendar.tsx`

### 7-1. 上部にタブ切替を追加
参考デザイン: `docs/INBOX/アプリUI 参考画像/B7DC2D73-9499-4A37-ACF3-F1D4AB8E01D8_1_105_c.jpeg` の右上トグル

```tsx
type ViewMode = 'calendar' | 'log';
const [viewMode, setViewMode] = useState<ViewMode>('calendar');
```

- `calendar`モード: カレンダー + 今月のAI要約のみ
- `log`モード: 縦スクロールタイムライン + フィルタ（すべて/自分/相手/お気に入り/相談）

### 7-2. フィルタ仕様の見直し
`log` モードで意味を持つようにする。期間フィルタ（今月/先月/過去3ヶ月）と対象フィルタ（自分/相手/両方）の組み合わせに。

### 7-3. 「日付タップ→その日固定」の廃止
`calendar` モードでは日付タップ時にボトムシートで該当日の投稿一覧を表示するに変更（画面の主構造を変えない）。

---

## Fix 8 — 初回オンボーディング実装（β前必須）

**前提**: `release-status.md` には「実装済み」と書かれていたが実際は未実装。`components/OnboardingModal.tsx` も `hasSeenOnboarding` も存在しない。β配布前に新規実装する。

### 8-1. コンポーネント新規作成
**ファイル**: `components/OnboardingModal.tsx`（新規）

3枚スライド構成のフルスクリーンModal。

| Slide | 内容 |
|---|---|
| 1 | コンセプト: 「言いたいけど言えないモヤモヤ、ふたことで」 |
| 2 | ペアリング: 「6桁の招待コードで相手とつなぐ」 |
| 3 | AI機能: 「気持ちの整理・相手の気持ち解釈・月次要約」 |

実装ポイント:
- `react-native` の `Modal` + 横スワイプで切替（`react-native-pager-view` か `ScrollView horizontal pagingEnabled`）
- 下部にページインジケーター（3つのドット）
- 最終ページに「始める」ボタン（参考画像 `E37D7E96-890A-43D9-976B-CD18107E2C8B_1_105_c.jpeg` 風の黒ボタン全幅）
- スキップボタンを右上に小さく置く

### 8-2. 表示判定
**ファイル**: `app/(app)/index.tsx`

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'hasSeenOnboarding_v1';

useEffect(() => {
  (async () => {
    const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (!seen) setOnboardingOpen(true);
  })();
}, []);

async function handleOnboardingDone() {
  await AsyncStorage.setItem(ONBOARDING_KEY, '1');
  setOnboardingOpen(false);
}
```

キーに `_v1` を付けることで、将来オンボーディング内容を刷新した時に再表示できるようにする。

### 8-3. デザイン規約
- 背景: `COLORS.background`（FAFAF8）
- イラストはまずSVG絵文字または `phosphor-react-native` の大きいアイコン（後で差し替え可）
- ボタン色: `COLORS.text`（黒）
- フォントは `display` 系を使い、コピーは1スライド1文に絞る

### 8-4. 招待コード共有への接続
スライド2の「ペアリング」セクションに「招待コードを送る」ボタンを設置し、`Share` APIで招待コードを共有できるようにする。これによりオンボーディング→招待コード共有→パートナーインストールの動線が完結する。

---

## 動作確認チェックリスト

各Fix完了後、TestFlightで以下を確認:

- [ ] Fix 1: ホーム起動から最初の投稿カード表示までの体感速度（before/after比較）
- [ ] Fix 2: 相談タブ・ホーム・カレンダーでAI上限到達時にPaywall起動
- [ ] Fix 3: ヘッダーがすっきりしている
- [ ] Fix 4: AI要約を生成→アプリkill→再起動で要約が残っている
- [ ] Fix 4: 同月内に複数回「さらに最新で要約」が押せる
- [ ] Fix 5: 設定からPaywallが起動
- [ ] Fix 6: 設定画面のアイコンが薄グレー線で統一されている
- [ ] Fix 7（β後）: カレンダー/ログタブ切替が機能する
- [ ] Fix 8: アプリ削除→再インストール→初回起動でオンボーディング3枚スライドが出る
- [ ] Fix 8: スライド2から招待コード共有が動く

---

## 参考

- 背景・アプローチ比較: [`docs/reviews/2026-05-16-self-test-feedback.md`](./reviews/2026-05-16-self-test-feedback.md)
- 既存Codexタスク: [`docs/CODEX-TASK.md`](./CODEX-TASK.md)
- リリースステータス: [`docs/app/release-status.md`](./app/release-status.md)
- UI参考画像: `docs/INBOX/アプリUI 参考画像/`（8枚）
