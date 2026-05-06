# ふたこと（futakoto）— エージェント向けハンドオフ

このファイルは、AIコーディングエージェント（Codex / Claude Code等）がこのプロジェクトを継続実装するためのコンテキスト集約ドキュメント。最初に必ず全文を読むこと。

## ⚠️ 必ず参照すること

UI実装・スタイル決定・新規画面作成・色やサイズの判断を伴う作業を行う前に、必ず以下を読むこと:

- **[.design/system.md](.design/system.md)** — デザインシステム（色・タイポ・スペーシング・トーン）の唯一の真実の源

このファイルから外れた色やトーンを勝手に使わない。新しい判断が必要な場合は `.design/system.md` に追記してから採用する。

---

## プロジェクト概要

**アプリ名**: ふたこと（futakoto）
**コンセプト**: 「一言を、ふたりで」— 一言（ひとこと）の二人版
**コア体験**: 忙しい毎日の中で、お互いの気持ちを伝える
**プラットフォーム**: iOS（React Native / Expo）
**ターゲット**: 子持ち夫婦（20-40代）

夫婦間で「言いたいけど言いにくいモヤモヤ」を気軽に共有できるアプリ。気分絵文字＋一言メモを「ふたりだけ／自分だけ」の範囲で投稿し、AIで「伝わる文章」へのリライトや相手の意図の読み解きを支援する。

**開発者の方針**:
- ユーザー（オーナー）はエンジニアではない。コードはAIが書く前提
- UI/プログラム面でユーザーの手を煩わせない
- 「とりあえず動くものを作る」を優先。完璧な計画より速度
- 副業化が目的ではなく「AI活用個人開発の経験」を得るのが主目的

---

## 進捗状況（2026-05-06 時点）

| Week | 内容 | 状態 |
|---|---|---|
| W1 | Expo初期化・Firebase認証 | ✅ 完了 |
| W2 | 投稿画面・絵文字・Firestore保存 | ✅ 完了 |
| W3 | ペアリング（招待コード）・共有エリア | ✅ 完了 |
| W4 | タブナビ・6桁コード・displayName・投稿削除/公開切替・カレンダー | ✅ 完了 |
| W6 | Cloud Functions + Gemini AIリライト/AI相談/意図汲み取り/月次要約 | ✅ 基盤完了・動作確認済み |
| W6.5 | 相談タブ・相談履歴・投稿転記・お気に入り・振り返りフィルタ | ✅ 実装済み |
| LP | ランディングページ（futakoto.jp）・Firebase Hosting | ✅ 公開済み |
| W5 | 課金導線（RevenueCat）・広告（AdMob） | 未着手 |
| W7 | プライバシーポリシー・利用規約・アカウント削除 | 未着手 |
| W8 | TestFlight → App Store審査提出 | 未着手 |

---

## 直近で実施したこと（2026-05-06）

### 振り返り画面のカレンダーデザイン刷新

Webサイトの「色で振り返る」グリッドとアプリの表示を近づけるためリデザイン。

**変更内容（`app/(app)/calendar.tsx`）**:
- 各日付セルの背景 = 自分の最新気分色（`MOOD_COLORS[mood] + '44'`、27%透明度）
- パートナーの気分色 = セル下部4px全幅ストリップ
- ストリップ上部に `rgba(255,255,255,0.7)` の1pxセパレーター追加（自分と相手が同色の日も判別可能）
- 選択状態: 背景塗りつぶし → sage色2pxボーダーリングに変更（気分色を消さずに選択位置が明確）
- 選択日の数字を太字（`fontWeight: '700'`）に変更
- `dayCell` 高さ: 42px → 36px（カレンダー全体をコンパクト化）
- `overflow: 'hidden'` 追加（ストリップがセルの角丸に沿う）
- 相談ドット（紫）は右上に維持

**レジェンド更新**:
- 「上: 自分の最新 / 下: 相手の最新」→「背景: 自分 / 下線: 相手 / 相談」に整理

### 投稿画面の日付選択ピッカー改善

**変更内容（`app/(app)/post.tsx`）**:
- `@react-native-community/datetimepicker` を削除（OS依存で見た目が統一されない問題）
- `react-native-calendars` の `<Calendar>` コンポーネントに置き換え
- `package.json` から `@react-native-community/datetimepicker` 依存を除去

### ランディングページ公開

`web/index.html` をフルスクラッチで作成し、Firebase Hosting に公開した。

**URL**: https://futakoto.web.app（futakoto.jp ドメインも取得済み・DNS設定未完）

**構成**:
- `web/index.html` — スタンドアロン HTML ファイル（JS フレームワーク不使用）
- `firebase.json` の `hosting.public` を `"web"` に設定
- CSS 変数でデザインシステムを実装（`--sage: #7B9E87` etc.）

**主な内容**:
- COMING SOON バナー
- ヒーローセクション（電話モックアップ ×2、blob 背景）
- 特徴セクション（3カラムカード）
- 使い方セクション（3ステップ）
- CTA セクション（App Store / Google Play ボタン・未公開のため無効化）
- フッター

**対応したコピー**:
- ヒーローノートのコピーは `"夜寝る前の30秒を、ふたりのために。"` に統一
- 旧：`"無料 · 広告なし · ペアリングは招待コード一つだけ"` は廃止（安っぽい印象）

**モバイル最適化（最終状態）**:
- `body` に `overflow-x: hidden; max-width: 100vw` を設定（横スクロール防止）
- `.hero-visual` には `overflow: hidden` を設定しない（回転した電話が clipされるため）
- モバイル（max-width: 880px）では `.hero-visual { display: none }` で電話モックアップを非表示
- PC（880px超）では電話 ×2 が `-6deg / +6deg` で回転したまま表示される

**デプロイコマンド**:
```bash
cd ~/futakoto && firebase deploy --only hosting
```

**アイコン**:
- `assets/icon.png` は Claude Design で生成した SVG を `rsvg-convert` で 1024×1024 PNG に変換したもの
- 2つの円が重なるデザイン（左: sage #7B9E87 / 右: dim #C8D8CC / 重なり: #5A7E68）
- 変換コマンド: `rsvg-convert -w 1024 -h 1024 icon.svg -o assets/icon.png`

---

### AI認証エラー解決

投稿画面の `AIで整える` が失敗していた問題は解決済み。

原因:
- Cloud Functions v2 callable の裏側にある Cloud Run が、未認証呼び出しを IAM で遮断していた
- callable はアプリの Firebase Auth 認証を関数内部で見るため、Cloud Run 側は public invoker にする必要がある
- その後、Gemini API key の Secret 値不備で `API_KEY_INVALID` も発生したが、新しい Secret version 2 で解決済み

対応済み:
- `functions/src/index.ts` の各 callable に `invoker: 'public'` を設定
- Cloud Run services に `roles/run.invoker` / `allUsers` を付与
  - `airewrite`
  - `aiinterpret`
  - `aisummary`
  - `aiconsult`
- `GEMINI_API_KEY` Secret は version 2 を使用
- API key 文字列は絶対にリポジトリやこのファイルに書かない

確認方法:

```bash
curl -i -X POST https://asia-northeast1-futakoto.cloudfunctions.net/aiRewrite \
  -H 'Content-Type: application/json' \
  --data '{"data":{"text":"テスト"}}'
```

期待値:
- `HTTP/2 401`
- body: `{"error":{"message":"ログインが必要です","status":"UNAUTHENTICATED"}}`
- これは Cloud Run で遮断されず、関数本体まで届いているという意味

### AI添削の方針変更

単純な「要約・言い換え」だと、ユーザーの自己認識や葛藤が削られる問題が見つかった。

例:
- 元文に「本当は自分が早起きしないといけないのは分かっている」がある
- 旧プロンプトではその重要ニュアンスが消え、「夜の趣味がやめられなくて眠い」だけに見える文章になった

対応:
- `aiRewrite` は `意図の読み取り → 削ってはいけないニュアンス特定 → 添削文生成` の流れに変更
- 出力に `understanding` を追加
  - `coreFeeling`
  - `importantNuance`
  - `messageGoal`
- 投稿画面で `AIの読み取り` として表示
- 添削案ラベルを `気持ちを残す / 具体的に / お願いにする` に変更
- `aiSummary` も自己認識・葛藤を削らないプロンプトに変更

### 新機能追加

実装済み:
- `相談` タブ
- AI相談 `aiConsult`
- 相談結果の自分専用保存
- 相談結果から投稿画面へ `投稿に使う`
- ホーム投稿のお気に入り
- 振り返りフィルタ
  - `すべて`
  - `自分`
  - `相手`
  - `お気に入り`
  - `相談`
- 振り返りで自分/相手/相談を色分け

設計意図:
- 返信機能は採用しない
- チャット化・既読プレッシャー・LINE化を避ける
- 相談は「相手に送る前に自分の気持ちを整理する場所」
- お気に入りは自分だけに見える。相手には通知・表示しない

---

## ⚠️ 次に解決すべき最優先タスク

**アプリ側 TypeScript エラー修正**

現在 `npm exec tsc -- --noEmit` は以下の既存エラーで失敗する:

```text
lib/firebase.ts(2,26): error TS2305:
Module '"firebase/auth"' has no exported member 'getReactNativePersistence'.
```

今回追加した相談タブ・お気に入り・AI読み取り表示による型エラーは出ていない。

次に Claude Code が着手するなら、まず `lib/firebase.ts` の Firebase Auth 初期化を Expo / React Native / firebase v12 に合わせて修正すること。

候補:
- `getReactNativePersistence` の import 元を見直す
- Firebase v12 + React Native の推奨初期化を確認する
- 必要なら `@react-native-async-storage/async-storage` と `initializeAuth` の組み合わせを再確認する

---

## 技術スタック

| レイヤー | 採用 | バージョン |
|---|---|---|
| フロント | Expo (React Native) + Expo Router | expo ~54.0.33, expo-router ~6.0.23 |
| 認証 | Firebase Auth（メール+パスワード） | firebase ^12.12.1 |
| DB | Firestore（東京リージョン） | 同上 |
| Functions | Cloud Functions v2（asia-northeast1） | firebase-functions ^6.1.0, Node 20 |
| AI | Gemini 2.5 Flash | @google/generative-ai ^0.21.0 |
| 課金（未実装） | RevenueCat | - |
| 広告（未実装） | AdMob | - |

**Firebaseプロジェクト**: `futakoto`（Blazeプラン・予算アラート¥1,000設定済み）
**Gemini APIキー**: Secret Manager に `GEMINI_API_KEY` として保存済み

---

## ディレクトリ構造

```
/Users/okabehiroyuki/futakoto/
├── app/                          # Expo Router
│   ├── _layout.tsx               # ルート: AuthProvider + 認証ガード
│   ├── login.tsx                 # ログイン画面
│   └── (app)/                    # 認証必須エリア
│       ├── _layout.tsx           # タブナビゲーション（4タブ + post隠し画面）
│       ├── index.tsx             # ホーム（投稿一覧 + FAB + お気に入り）
│       ├── consult.tsx           # 相談（AI相談 + 自分専用保存 + 投稿転記）
│       ├── post.tsx              # 投稿画面（AI読み取り + リライト付き）
│       ├── calendar.tsx          # 振り返り（カレンダーUI + フィルタ）
│       └── settings.tsx          # 設定（招待コード・displayName）
├── lib/
│   ├── firebase.ts               # Firebase初期化（auth, db, functions）
│   ├── auth.tsx                  # 認証Context
│   ├── db.ts                     # Firestore CRUD
│   └── ai.ts                     # Cloud Functions呼び出し（AI機能）
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts              # 4つのCloud Functions
├── web/
│   └── index.html                # ランディングページ（Firebase Hosting で公開中）
├── .design/
│   └── system.md                 # デザインシステム（色・タイポ・トーン）
├── assets/
│   └── icon.png                  # 1024×1024 アイコン（rsvg-convert で生成）
├── .env                          # Firebase設定（Git管理外）
├── app.json                      # Expo設定
├── firebase.json                 # Firebase CLI設定（hosting.public = "web"）
├── .firebaserc                   # default project = futakoto
└── package.json
```

---

## 確定仕様

| 項目 | 決定 |
|---|---|
| 招待コード | 6桁英数字（紛らわしい文字 0/O/1/I/L 除外） |
| オンボーディング画面 | なし（空状態でヒント表示） |
| 表示名 | ユーザー入力（設定画面で編集可） |
| 投稿の削除 | 可（自分の投稿のみ・確認ダイアログ） |
| 公開範囲の後変更 | 可（カードタップ → アクションシート） |
| マネタイズ | 無料 + 買い切り¥980（広告非表示）+ 月額¥500（AI無制限） |
| AIモデル | Gemini 2.5 Flash |

---

## データモデル（Firestore）

### `users/{uid}`

```typescript
{
  uid: string;
  email: string;
  displayName?: string;          // メアドの@前がデフォルト
  inviteCode?: string;           // 6桁英数字
  partnerUid?: string;           // ペアリング相手
  createdAt: Timestamp;
  // 将来用（任意）
  isPremium?: boolean;
  aiCreditsUsed?: number;
}
```

### `users/{uid}/entries/{entryId}`

```typescript
{
  id?: string;
  uid: string;
  mood: number;                  // 1-5
  memo: string;
  visibility: 'private' | 'shared';
  createdAt: Timestamp;
  // 将来用（任意）
  aiSummary?: string;
  aiTags?: string[];
}
```

### `users/{uid}/consultations/{consultationId}`

AI相談の自分専用記録。相手には見せない。

```typescript
{
  id?: string;
  uid: string;
  input: string;                 // ユーザーが相談に書いた元文
  reflection: string;            // AIの整理メモ
  messageDraft: string;          // 投稿に転記できる相手向け文案
  createdAt: Timestamp;
}
```

### `users/{uid}/favorites/{favoriteKey}`

投稿のお気に入り。自分だけが持つ印。相手には通知・表示しない。

`favoriteKey` は `${entryUid}_${entryId}`。

```typescript
{
  entryUid: string;              // 投稿を書いたユーザー
  entryId: string;               // 対象投稿ID
  createdAt: Timestamp;
}
```

### `inviteCodes/{code}`

```typescript
{
  uid: string;
}
```

招待コードでユーザーを引くためのインデックス用コレクション。

---

## Cloud Functions（実装済み）

すべて `asia-northeast1` リージョン・v2 callable。

### `aiRewrite(text, partnerName?)`

伝えたい文を、まず意図・葛藤・自己認識を読み取ったうえで、相手に伝わる文章へ書き直す。

**入力**: `{ text: string, partnerName?: string }`
**出力**:

```typescript
{
  understanding: {
    coreFeeling: string;
    importantNuance: string;
    messageGoal: string;
  };
  rewrites: { label: string; text: string }[];
}
```

ラベル:
- `気持ちを残す`
- `具体的に`
- `お願いにする`

重要:
- 単純要約ではない
- 「本当は分かっているけど難しい」「自分にも原因がある」などのニュアンスを削らない

### `aiConsult(text, partnerName?)`

自分専用の壁打ち。困っていること・思っていることを整理し、投稿に使える文案を作る。

**入力**: `{ text: string, partnerName?: string }`
**出力**:

```typescript
{
  reflection: string;
  messageDraft: string;
}
```

### `aiInterpret(text, mood, partnerName?)`

相手の投稿の意図を3つの可能性として読み解く（「〜かもしれません」のトーン）。

**入力**: `{ text: string, mood: number, partnerName?: string }`
**出力**: `{ interpretations: string[] }`

### `aiSummary(entries)`

期間の投稿群を要約。気分の波・共通テーマ・自己認識/葛藤・次のアドバイス。

**入力**: `{ entries: { mood: number, memo: string }[] }`
**出力**: `{ summary: string }`

すべて Gemini API キーを `GEMINI_API_KEY` Secret から読む。`responseMimeType: 'application/json'` 指定で構造化出力。

---

## 既知の技術的制約・落とし穴

1. **Expo Go は常に New Architecture（Fabric）が強制ON**
   - `app.json` の `newArchEnabled: false` は Expo Go では無効
   - 関連: `react-native-screens` との互換性に注意

2. **Firestore 複合クエリ（where + orderBy）にはインデックスが必要**
   - 現在は JS 側フィルタで回避（`getPartnerSharedEntries` 参照）
   - 将来的にスケールしたら適切なインデックスを作る

3. **Firestoreルールは開発中「認証済みなら全部OK」**
   ```
   match /{document=**} {
     allow read, write: if request.auth != null;
   }
   ```
   - **リリース前に必ず厳密化すること**（パートナー以外は読めない等）

4. **React Native + Firebase JS SDK + initializeAuth(AsyncStorage) の型エラーが残っている**
   - `lib/firebase.ts` の `getReactNativePersistence` import が `firebase/auth` から解決できない
   - AI callable の実行自体は動作確認済み
   - ただしアプリ全体の `tsc --noEmit` はこの既存エラーで失敗する

5. **Apple Sign-In はリリース時に追加必須**（App Store審査要件）

6. **インデックス必要なクエリの作成リンク**
   - Firestore側でエラーメッセージにURLが含まれる
   - 開発元アカウントでないとアクセスできないので、複数Googleアカウント運用時は注意

---

## 次にやるべき具体タスク

### 1. AI機能のUI統合と精度向上（最優先）

#### 1-1. 振り返り画面のAI月次要約（`calendar.tsx`）

カレンダー上部またはフィルター行の近くに「今月をAI要約」ボタンを追加。
- 対象月の自分の投稿（`myEntries` をフィルタ）を `aiSummary` に渡す
- 結果を展開可能なカードで表示（デフォルト折りたたみ）
- Phosphor `Sparkle` アイコンを使う（絵文字禁止）
- 月をまたいだときにリセット

`aiSummary` の入力形式: `{ entries: { mood: number, memo: string }[] }`

#### 1-2. 相談（壁打ち）機能の精度向上（`aiConsult` + `consult.tsx`）

現在の `aiConsult` プロンプトの課題：
- 入力が短い（「疲れた」だけ等）でも応答してしまう → 最低限の入力量ガード（50文字以下はヒントを表示してUX誘導）
- パートナー名が渡せていない可能性 → `partnerName` を必ず渡す
- AIの整理メモが長すぎる場合がある → `reflection` は200文字以内の制約をプロンプトに追加
- 「相談」という言葉が重く感じる → UIコピーを「気持ちを整理する」「壁打ち」方向に変える

`aiConsult` 出力:
```typescript
{ reflection: string; messageDraft: string; }
```
- `reflection`: AIの整理メモ（自分だけ見る）→ 200文字以内を目標
- `messageDraft`: 相手への一言案（投稿に使える）

#### 1-3. ホーム画面の「意図を読み解く」（`index.tsx`）

パートナーの投稿カードに `aiInterpret` の導線を追加。
- カードをタップで展開→「この気持ちを読み解く（Sparkle）」ボタン
- 3つの解釈を箇条書きで表示
- 一度呼んだ結果はそのカードが再描画されるまでキャッシュ（`useState<Record<string,string[]>>`）

### 2. `lib/firebase.ts` の TypeScript エラー修正

`npm exec tsc -- --noEmit` が通る状態にする。

現在のエラー:

```text
lib/firebase.ts(2,26): error TS2305:
Module '"firebase/auth"' has no exported member 'getReactNativePersistence'.
```

### 3. AI使用量管理・課金前のガード

- `users/{uid}.aiCreditsUsed` をインクリメント
- 月初リセット
- 無料プランは月10回、課金は無制限
- Cloud Functions側で制限チェック

### 4. Firestoreルール厳密化（リリース前）

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      allow read: if request.auth != null && resource.data.partnerUid == request.auth.uid;
    }
    match /users/{uid}/entries/{entry} {
      allow write: if request.auth != null && request.auth.uid == uid;
      allow read: if request.auth != null && (
        request.auth.uid == uid ||
        (resource.data.visibility == 'shared' &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.partnerUid == uid)
      );
    }
    match /inviteCodes/{code} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /users/{uid}/consultations/{consultation} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /users/{uid}/favorites/{favorite} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### 5. App Store要件（W7）

- プライバシーポリシー作成（AI処理を含む内容で）
- 利用規約作成
- アカウント削除機能（Settings画面に追加）
- App Tracking Transparency（広告導入時）
- 年齢レーティング 17+

---

## 重要なドキュメント

すべて Obsidian Vault 内（プロジェクト管理層）:

```
/Users/okabehiroyuki/Library/Mobile Documents/iCloud~md~obsidian/Documents/
├── 4.Life/夫婦アプリ開発/
│   ├── README.md                # プロジェクトメインドキュメント
│   ├── 03_要件定義.md             # 仕様確定事項・AI統合設計
│   └── リサーチ/
│       ├── 01_アプリ名候補.md
│       └── 02_UIパターン.md
└── 1.Notes/Inbox/
    ├── 260504 OUT ふたこと開発 Day1.md
    └── 260505 OUT ふたこと開発 Day2.md
```

---

## 開発時のコマンド

```bash
# アプリ起動（Expo）
cd ~/futakoto && npx expo start

# 現在起動中のExpo dev server（2026-05-06時点）
# http://localhost:8082

# Cloud Functions ビルド
cd ~/futakoto/functions && npm run build

# Cloud Functions デプロイ
cd ~/futakoto && firebase deploy --only functions

# 個別デプロイ例
cd ~/futakoto && firebase deploy --only functions:aiRewrite,functions:aiSummary
cd ~/futakoto && firebase deploy --only functions:aiConsult

# ランディングページ デプロイ
cd ~/futakoto && firebase deploy --only hosting

# Cloud Functions ログ
cd ~/futakoto && firebase functions:log

# Cloud Functions Secret 設定
firebase functions:secrets:set GEMINI_API_KEY

# 認証アカウント切り替え
firebase logout && firebase login
```

---

## アカウント・URL

- Firebase Console: https://console.firebase.google.com/project/futakoto
- Google AI Studio (APIキー): https://aistudio.google.com/app/apikey
- ランディングページ（本番）: https://futakoto.web.app（futakoto.jp にも同じ内容を予定）
- SNS: X / Instagram `@futakoto_app`
- ドメイン: futakoto.jp 取得済み（DNS接続は未設定）
- 招待コードのテスト: 設定画面に表示される6桁コードでアカウント間ペアリング可能

---

## 開発者向けTips

- **このディレクトリはGit repoではない**: 2026-05-06時点で `/Users/okabehiroyuki/futakoto` は `git status` が失敗する。変更履歴は手元ファイルとこの `AGENTS.md` を信じること
- **新機能追加時**: まず `lib/db.ts` または `lib/ai.ts` に関数を追加し、UI コンポーネントから呼ぶ
- **画面追加時**: `app/(app)/` 配下にファイル追加。`_layout.tsx` のタブ定義も更新（タブから隠す場合は `href: null`）
- **Firestore操作時**: 必ず `try/catch` し、ユーザーに `Alert.alert` でエラーを見せる
- **AI処理時**: Loading表示・エラーハンドリング必須。無限呼び出しを避けるためデバウンスやキャッシュも検討
- **AI添削時**: 単純な要約は禁止。必ず「意図・葛藤・自己認識」を残す。特に「本当は分かっているけど難しい」系のニュアンスを削らない
- **相談タブ**: チャットUIに寄せない。吹き出しではなく、入力欄・AI整理カード・投稿転記ボタンで構成する
- **返信機能**: 2026-05-06に不採用。チャット化・既読プレッシャーを避ける
- **お気に入り**: 自分だけの印。相手に通知・表示しない
- **デザイントーン**: 詳細は `.design/system.md` を参照。色・サイズ・トーン判断はすべてこのファイル基準
- **絵文字スコア対応**: `MOOD_EMOJI = ['', '😣', '😔', '😐', '🙂', '😊']`, `MOOD_COLORS = ['', '#E57373', '#FFB74D', '#FFF176', '#AED581', '#81D4FA']`

---

## 2026-05-06 最終確認ログ

実行済み:

```bash
npm --prefix functions run build
```

結果:
- 成功

```bash
npm exec tsc -- --noEmit
```

結果:
- 失敗
- ただし既存の `lib/firebase.ts` の `getReactNativePersistence` 型エラーのみ

デプロイ済み:
- `aiRewrite`
- `aiSummary`
- `aiConsult`
- `aiInterpret` は既存デプロイ済み

疎通確認:
- `aiRewrite` / `aiConsult` に未ログインcurlを投げて `401 ログインが必要です` を確認
- これは Cloud Run IAM で遮断されず、関数本体まで届いている状態
