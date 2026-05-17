# UI修正プラン & 進捗

作成日: 2026-05-17

---

## 進捗サマリー

| 画面 | ファイル | 状態 |
|------|---------|------|
| ホーム | `app/(app)/index.tsx` + `app/(app)/post.tsx` | ✅ 完了 |
| 相談 | `app/(app)/consult.tsx` | ✅ 完了 |
| 振り返り | `app/(app)/calendar.tsx` | ✅ 完了 |
| 設定 | `app/(app)/settings/index.tsx` | ✅ 完了 |
| ログイン | `app/login.tsx` | ✅ 完了 |

---

## ✅ 完了済み

### ホーム画面 (`app/(app)/index.tsx`)

1. **当日記録を全件表示（最新3件+折りたたみ）**
   - `myTodayEntry: Entry | null` → `myTodayEntries: Entry[]`
   - `partnerTodayEntry` → `partnerTodayEntries` に変更
   - `showAllMy`, `showAllPartner` state追加
   - 3件超は「他 n件を見る」ボタンで展開

2. **自分/パートナーの色枠**
   - 自分: `borderLeftWidth: 3, borderLeftColor: COLORS.primary`（緑）
   - パートナー: `borderLeftWidth: 3, borderLeftColor: COLORS.partner`（ピンク）

3. **顔文字タップでフルサイズ入力モーダル**
   - `moodModalOpen`, `moodModalMood`, `moodModalMemo`, `moodModalSubmitting` state追加
   - 顔文字タップ → `setMoodModalOpen(true)` に変更
   - `Modal + KeyboardAvoidingView` によるボトムシート型モーダル追加

4. **キーボード時に入力欄が隠れない**
   - `ScrollView` を `KeyboardAvoidingView` でラップ

5. **プレースホルダーテキスト変更**
   - `"ひとことメモ（任意）"` → `"いまの気持ちや${partnerName}に伝えたいこと"`

### post.tsx (`app/(app)/post.tsx`)
- ラベル `そのときの気持ち・{partnerName}に伝えたいこと` → `いまの気持ちや{partnerName}に伝えたいこと`

### 相談画面 (`app/(app)/consult.tsx`)

1. **「壁打ち」→「AIに話す」**（タイトル）
2. **「AIと壁打ちする」→「AIに話す」**（ボタンテキスト）
3. **「過去の相談を見る」を紫色に**
   - `color: COLORS.primary` → `color: COLORS.ai`
   - ArrowRightアイコンも同様
4. **AI上限時にPaywall表示**
   - `lib/db.ts` から `AI_FREE_MONTHLY_LIMIT` をインポート
   - `ensureConsentAndConsult` の先頭で `profile.aiCreditsUsed >= AI_FREE_MONTHLY_LIMIT` をチェック
   - 上限超過 → `setPaywallOpen(true)` してreturn

---

## ❌ 未完了: 振り返り画面 (`app/(app)/calendar.tsx`)

### カレンダービュー

**C1: タップしないと記録カードを出さない**
- `useState(todayKey())` → `useState('')` に変更
- `selected === ''` のとき「日付を選択してください」と表示
- `sortRow`（日付表示行）も `selected === ''` の場合はデフォルトテキスト

**C2: 無料ユーザーが先月に移動したときのグレーオーバーレイ**
- 現状: Paywall出して今月に戻す
- 変更: 月表示は許可し、カレンダーの上にグレーオーバーレイを重ねる
- `isPastMonthLocked = !premium && isPastMonth(currentMonth)` を計算
- カレンダーを `View` でラップし、`isPastMonthLocked` のとき `position: 'absolute'` のオーバーレイを表示
- オーバーレイ内: Sparkleアイコン + 「過去月の振り返りはプレミアム機能です」 + 「プレミアムを見る」ボタン

**C3: AI要約ボタンをAI上限時に無効化**
- `!premium` のとき → `setPaywallReason('AI要約はプレミアム機能です'); setPaywallOpen(true); return;`

### ログビュー

**L1: 「並び順」をフィルターパネルから外す**
- フィルターパネル内の「並び順」セクションを削除
- `logHeader` 行にソートボタンを追加（フィルタートグルの左横）
- スタイル `sortChip`, `sortChipText` を追加

**L2: フィルターの「その他」グループ修正**
- `logFavoriteOnly: boolean = false` state追加
- フィルターパネルに「その他」グループ追加（「★ お気に入りのみ」チップ）
- `filteredLogRecords` の useMemo に `logFavoriteOnly` フィルター追加
  - entry: isFavorite が false なら除外
  - consultation: logFavoriteOnly 時は除外
- deps配列に `logFavoriteOnly` を追加

**L3: フィルターのリセットボタン**
- フィルターパネル最下部にリセットボタン追加
- 押下で全フィルターを初期値に戻す `resetLogFilters()` を実装
  ```
  setPeriodFilter('thisMonth')
  setLogAuthorFilter('all')
  setVisibilityFilter('all')
  setMoodFilter(0)
  setLogTypeFilter('all')
  setLogSortOrder('desc')
  setLogFavoriteOnly(false)
  ```

**L4: 期間フィルター「先月・過去3ヶ月・全期間」を紫色に**
- `filterChipPremium`, `filterChipPremiumActive`, `filterChipPremiumText`, `filterChipPremiumTextActive` スタイルを追加
- `p.premium === true` のチップに適用（`COLORS.ai` / `COLORS.aiBg` / `COLORS.aiBorder` 使用）
- 無料ユーザーが押したら `setPaywallOpen(true)`

**L5: 相談から遷移してきたらフィルターをリセット**
- 既存の `useFocusEffect`（params対応）を修正
- `params.viewMode === undefined`（通常戻り）の場合は `setLogTypeFilter('all')` でリセット

---

## ❌ 未完了: 設定画面 (`app/(app)/settings/index.tsx`)

### 目標UI（スクショ参照）

各グループ1行・アイコン付き・サブタイトルあり

```
アカウント
[👤] アカウント / 表示名・ログイン方法・データ管理  →  displayName

パートナー連携
[❤] パートナー連携 / 招待コード・連携状況  →  パートナー名 or 未連携

サブスクリプション  ← 新規追加
[☆] プレミアム / AI機能を無制限で使う  →  AI残り XXX/500回

通知
[🔔] 通知 / パートナー投稿通知ON  →  時刻

AI
[✨] AI口調・送信範囲 / 話し方スタイルとAI利用量  →  ソフト

その他
[✉] お問い合わせ  →  ← 新規追加
[📄] 利用規約  →
[🔒] プライバシーポリシー  →
```

### 実装方針

**SettingRow に `icon`, `subtitle` propsを追加**
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

**スタイル追加**
```
rowIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.borderSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }
rowContent: { flex: 1 }
rowSubtitle: { fontSize: 12, color: COLORS.textWeak, marginTop: 2 }
```

**Phosphorアイコン追加import**
```tsx
import { ArrowRight, User, Heart, Star, Bell, Sparkle, Envelope, FileText, Lock } from 'phosphor-react-native';
```

**AI使用量の表示**
- `lib/db.ts` の `UserProfile` 型を確認
- `aiCreditsUsed` フィールドがある（相談画面実装で判明）
- `AI_FREE_MONTHLY_LIMIT`（=5）を使って `AI残り ${AI_FREE_MONTHLY_LIMIT - (profile?.aiCreditsUsed ?? 0)}/${AI_FREE_MONTHLY_LIMIT}回` などで表示

---

## ❌ 未完了: ログイン画面 (`app/login.tsx`)

**L1: アプリアイコン画像を追加**
- `assets/` ディレクトリを確認してアイコンファイルを特定
- `<Image>` を `react-native` からインポート
- `<Text style={styles.logo}>ふたこと</Text>` の上に `<Image source={require('../assets/icon.png')} style={styles.appIcon} />` を挿入
- `appIcon: { width: 80, height: 80, alignSelf: 'center', marginBottom: 16, borderRadius: 18 }`

**L2: 両ボタンを白背景・黒字に統一**
- Apple: `buttonStyle` を `WHITE_OUTLINE` に変更
- Google: すでに白背景だが `backgroundColor: '#FFFFFF'` を明示、`borderColor: '#000'` に変更

**L3: ボタンテキストを「〜ではじめる」に**
- Apple: ネイティブAPIボタンは「ではじめる」に変更不可 → カスタム `TouchableOpacity` に置き換えて `signInAsync` を直接呼ぶ
  - スタイル: 白背景、黒テキスト、Appleロゴ（ `" "` or SF Symbol）+ `"Appleではじめる"`
- Google: `<Text>Googleではじめる</Text>` に変更

**L4: フォントサイズ統一**
- 両ボタンの `fontSize: 16, fontWeight: '600'` に揃える

---

## 参考情報

### COLORS定数 (`lib/theme.ts`)
```
primary: '#7B9E87'   // 緑
ai: '#7C5BB7'        // 紫
partner: '#E58B8B'   // ピンク
aiBg: '#F3EDFA'
aiBorder: '#E8E0F2'
aiBorderSoft: '#EBE4F5'
aiBgSoft: '#F9F7FC'
```

### AI利用量 (`lib/db.ts`)
- `AI_FREE_MONTHLY_LIMIT = 5`
- `UserProfile.aiCreditsUsed: number`
- `UserProfile.premium: boolean`
- `UserProfile.premiumExpiresAt: Timestamp | null`
