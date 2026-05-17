# Codex タスク: ホーム画面リデザイン

**目的**: ホームを「玄関」として設計し直す。全件フィード → インライン入力 + 今日の記録（自分・パートナー各最新1件）。
**関連**: Fix 7（振り返り画面構造刷新）とセットで考えているが、このタスクはホームのみ。他タブは変更しない。

---

## 変更ファイル一覧

| ファイル | 変更種別 |
|---------|---------|
| `components/HomeMoodInput.tsx` | 新規作成 |
| `app/(app)/index.tsx` | 大幅変更 |
| `lib/db.ts` | 関数追加（Streak計算） |

---

## Task 1 — `components/HomeMoodInput.tsx` を新規作成

ホーム専用のインライン気持ち入力コンポーネント。

### 仕様

**初期状態（未選択）**
- `MOODS`（5種類）の絵文字を横並びで表示する
- 絵文字の下に `今日の気持ちを伝える` というサブテキスト（`COLORS.textWeak`、`fontSize: 12`）
- カード全体の高さは低く抑える（余白少なめ、シンプル）

**絵文字タップ後（展開状態）**
- `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` を呼んでからstateを変更し、滑らかに展開する
- 選択した絵文字をハイライト表示（選択以外は `opacity: 0.35`）
- 下部に以下が展開される：
  - `TextInput`：プレースホルダー `ひとことメモ（任意）`、`multiline`、最大3行まで
  - 送信ボタン：`伝える` というラベル、`COLORS.primary` 背景、全幅

**送信後**
- テキスト・選択状態をリセットし、未選択の初期状態に戻す
- 送信後に `onSubmit()` コールバックを呼ぶ（ホーム側でリロード処理をする）

**複数投稿**
- 送信後に展開を閉じるだけ。「今日すでに入力済み」の場合でも制限しない（追記を許可する）

### Props

```ts
type Props = {
  uid: string;
  profile: UserProfile;
  partnerProfile: UserProfile | null;
  onSubmit: () => void; // 送信成功後のコールバック（ホーム側でリロード）
};
```

### 実装方針

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager, ActivityIndicator } from 'react-native';
import { MOODS } from '../lib/mood';
import { COLORS } from '../lib/theme';
import { addEntry, updateLastVisibility } from '../lib/db';

// Android で LayoutAnimation を有効化
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function HomeMoodInput({ uid, profile, partnerProfile, onSubmit }: Props) {
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSelectMood(score: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedMood(score);
  }

  async function handleSubmit() {
    if (selectedMood === null) return;
    setLoading(true);
    try {
      const visibility = profile.lastVisibility ?? 'shared';
      await addEntry(uid, selectedMood, memo.trim(), visibility);
      await updateLastVisibility(uid, visibility);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSelectedMood(null);
      setMemo('');
      onSubmit();
    } catch (e: any) {
      console.error('[HomeMoodInput] 送信エラー:', e?.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.card}>
      {/* 顔文字セレクター */}
      <View style={styles.emojiRow}>
        {MOODS.map((m) => (
          <TouchableOpacity
            key={m.score}
            onPress={() => handleSelectMood(m.score)}
            style={styles.emojiBtn}
          >
            <Text style={[
              styles.emoji,
              selectedMood !== null && selectedMood !== m.score && styles.emojiDimmed,
            ]}>
              {m.emoji}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 未選択時のヒントテキスト */}
      {selectedMood === null && (
        <Text style={styles.hint}>今日の気持ちを伝える</Text>
      )}

      {/* 展開エリア（選択後） */}
      {selectedMood !== null && (
        <View style={styles.expanded}>
          <TextInput
            style={styles.textInput}
            placeholder="ひとことメモ（任意）"
            placeholderTextColor={COLORS.placeholder}
            value={memo}
            onChangeText={setMemo}
            multiline
            maxLength={200}
          />
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={COLORS.surface} size="small" />
              : <Text style={styles.submitText}>伝える</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  emojiBtn: { padding: 4 },
  emoji: { fontSize: 28 },
  emojiDimmed: { opacity: 0.3 },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textWeak,
    marginTop: 8,
  },
  expanded: { marginTop: 12, gap: 10 },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitText: { color: COLORS.surface, fontSize: 15, fontWeight: '700' },
});
```

---

## Task 2 — `lib/db.ts` に `getConsecutiveDays` を追加

連続記録日数を算出するユーティリティ。Firebaseを叩かず、すでに取得済みの `entries` 配列から算出する（ホームはすでにentriesを持っているため余分なクエリ不要）。

```ts
/**
 * 自分のエントリ一覧（降順ソート済みを想定）から
 * 今日を起点とした連続記録日数を返す。
 * 今日の記録がない場合でも、昨日まで連続していれば昨日基準で計算する。
 */
export function getConsecutiveDays(myEntries: Entry[]): number {
  if (myEntries.length === 0) return 0;

  function toDateStr(ts: any): string {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 日付の重複を除いたユニークな記録日セット（新しい順）
  const uniqueDates = [...new Set(myEntries.map((e) => toDateStr(e.createdAt)))]
    .sort()
    .reverse();

  // 今日か昨日の記録がない場合、連続は0
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

  let count = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diff === 1) {
      count++;
    } else {
      break;
    }
  }
  return count;
}
```

---

## Task 3 — `app/(app)/index.tsx` を書き直す

### 変更の全体方針

| 変更前 | 変更後 |
|--------|--------|
| 全件FlatList（最大100件） | 今日の記録のみ表示（自分+パートナー各最新1件） |
| FAB（+ボタン）で post 画面へ遷移 | FAB廃止。`HomeMoodInput` をインライン配置 |
| ヘッダーなし（navigation.setOptionsで設定なし） | ヘッダー右端にStreak小テキスト（2日以上のみ） |
| パートナー連携ピル | 維持（表示位置はそのまま） |

### 今日のエントリ絞り込みロジック

```ts
function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function toDateStr(ts: any): string {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().slice(0, 10);
}

// load() の中で entries をセットした後に算出する
const today = todayStr();
const myTodayEntry = myEntries.find((e) => toDateStr(e.createdAt) === today) ?? null;
const partnerTodayEntry = partnerEntries?.find((e) => toDateStr(e.createdAt) === today) ?? null;
```

`myTodayEntry` と `partnerTodayEntry` を state として持つ。

### Streak表示

```ts
import { useLayoutEffect } from 'react';
import { getConsecutiveDays } from '../../lib/db';

// load() の中でmyEntries取得後に計算
const streak = getConsecutiveDays(myEntries);

// useLayoutEffect でヘッダーに反映
useLayoutEffect(() => {
  navigation.setOptions({
    headerRight: streak >= 2
      ? () => (
          <Text style={{ fontSize: 12, color: COLORS.textWeak, marginRight: 16 }}>
            {streak}日連続
          </Text>
        )
      : undefined,
  });
}, [navigation, streak]);
```

### 新しいJSX構造

```tsx
return (
  <View style={styles.container}>
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* パートナー連携ピル（既存） */}
      <View style={styles.connectionHeader}>
        {/* ... 既存のコードそのまま ... */}
      </View>

      {/* インライン入力（HomeMoodInput） */}
      <HomeMoodInput
        uid={user!.uid}
        profile={profile!}
        partnerProfile={partnerProfile}
        onSubmit={() => load()}
      />

      {/* 今日の記録セクション */}
      <View style={styles.todaySection}>
        <Text style={styles.sectionLabel}>今日の記録</Text>

        {/* 自分の今日のカード */}
        {myTodayEntry ? (
          <EntryCard
            entry={myTodayEntry}
            authorName="自分"
            isOwn={true}
            isFavorite={myTodayEntry.id ? favoriteIds.has(favoriteKey(myTodayEntry.uid, myTodayEntry.id)) : false}
            timeLabel={formatEntryDate(myTodayEntry.createdAt)}
            onPressActions={() => showActions(myTodayEntry)}
            onToggleFavorite={() => handleToggleFavorite(myTodayEntry)}
            // footer はなし（ホームでは自分カードにAI機能出さない）
          />
        ) : (
          <Text style={styles.noEntryText}>まだ今日の記録がありません</Text>
        )}

        {/* パートナーの今日のカード（ペアリング済みのみ） */}
        {isPaired && (
          partnerTodayEntry ? (
            <View>
              <EntryCard
                entry={partnerTodayEntry}
                authorName={partnerName}
                isOwn={false}
                isFavorite={partnerTodayEntry.id ? favoriteIds.has(favoriteKey(partnerTodayEntry.uid, partnerTodayEntry.id)) : false}
                timeLabel={formatEntryDate(partnerTodayEntry.createdAt)}
                onToggleFavorite={() => handleToggleFavorite(partnerTodayEntry)}
                footer={/* 既存のAI読み解きフッター（パートナーカードのみ維持） */}
              />
            </View>
          ) : (
            <Text style={styles.noEntryText}>{partnerName} はまだ今日の記録がありません</Text>
          )
        )}
      </View>
    </ScrollView>

    {/* PaywallModal・AiConsentModal は既存そのまま */}
    <PaywallModal ... />
    <AiConsentModal ... />
  </View>
);
```

### スタイル追加・削除

```ts
// 追加
todaySection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
sectionLabel: { fontSize: 12, color: COLORS.textWeak, fontWeight: '600', marginBottom: 10, letterSpacing: 0.5 },
noEntryText: { fontSize: 13, color: COLORS.textWeak, textAlign: 'center', paddingVertical: 16 },
scrollContent: { paddingBottom: 80 },

// 削除
fab: { ... },       // FABは不要になる
list: { ... },      // FlatListのcontentContainerStyle
```

### 削除するコード

- `FlatList` → `ScrollView` に置き換える（今日の2件のみなのでFlatListは不要）
- `styles.fab` と `<TouchableOpacity style={styles.fab}>` ブロック全体
- `renderItem` の関数全体（EntryCardは直接JSXで書く）

### 維持するコード（変更しない）

- `load()` の中のFirestoreクエリ全体（既存のFix 1の並列化をそのまま使う）
- `handleToggleFavorite`・`handleInterpret`・`handleToggleVisibility`・`handleDelete`・`handleEdit`・`showActions` の各関数
- `PaywallModal`・`AiConsentModal` のマウント部分
- `EntryActionPanel` （自分カードのアクション操作は維持）

---

## 動作確認チェックリスト

- [ ] ホームに顔文字5つが横並びで表示される
- [ ] 顔文字タップで展開アニメーションが走り、テキスト入力と「伝える」ボタンが出る
- [ ] 「伝える」タップで投稿され、展開が閉じる（追記のため再び顔文字選択できる状態に戻る）
- [ ] 今日の自分のカードが1件表示される（昨日以前は表示されない）
- [ ] ペアリング済みの場合、パートナーの今日のカードが表示される
- [ ] パートナーカードに「気持ちを読み解く」ボタンが表示される
- [ ] 自分カードのアクション（編集・削除・公開範囲変更）が動く
- [ ] 2日以上連続記録している場合、ヘッダー右端にStreak日数が表示される（1日目は表示なし）
- [ ] 今日2件以上投稿した場合、最新1件のみ自分カードに表示される
- [ ] 今日の記録がない場合、「まだ今日の記録がありません」テキストが表示される
- [ ] pull-to-refresh で再ロードされる
- [ ] FABが画面上に存在しない

---

## 注意事項

- `HomeMoodInput` の送信で使う `visibility` は `profile.lastVisibility ?? 'shared'` を使う。送信後に `updateLastVisibility` も呼ぶ（post.tsx と同じ挙動）。
- `getConsecutiveDays` はFirestoreを叩かず、すでに取得済みの `myEntries` から計算すること。
- AI解釈（`handleInterpret`）のロジックはパートナーカードのフッター部分のみで使う。自分カードには出さない。
- `EntryActionPanel`（編集・削除等）は自分カードにのみ表示する（変更なし）。
