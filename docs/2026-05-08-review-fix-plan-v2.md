# ふたこと 修正プラン v2（2026-05-08 第2次レビュー起票）

v1（[2026-05-08-review-fix-plan.md](./2026-05-08-review-fix-plan.md)）の P0〜P2 完了後の再レビューで見つかった残課題。
**v2 の P0 は「リリース前に必ず塞ぐべきセキュリティ穴」中心** — v1 で Cloud Function 化したペアリングの裏側で、ルール側のフィールド制限が手付かずだった。

優先度: **P0=リリース前必須 / P1=近いスプリント / P2=こなれたら**

---

## 📊 進捗サマリー（2026-05-08 更新）

| タスク | タイトル | 状態 |
|--------|---------|------|
| P0-1 | Firestore `partnerUid` 直書き禁止 | ✅ 完了 |
| P0-2 | `inviteCodes` 直書き禁止 + `createUserProfile` CF化 | ✅ 完了 |
| P0-3 | `aiSummary` 入力サイズ上限 | ✅ 完了 |
| P0-4 | プライバシーポリシー・サポートURL | ✅ 完了 |
| P0-5 | TestFlight 実機検証 | ⏳ 未着手 |
| P1-1 | 解釈キャッシュ invalidate | ⏳ 未着手 |
| P1-2 | Firebase Auth エラー日本語化 | ✅ 完了（2026-05-08） |
| P1-3 | メール認証 `sendEmailVerification` | ⏳ 未着手 |
| P1-4 | ログアウト確認ダイアログ | ✅ 完了（2026-05-08） |
| P1-5 | `COLORS`トークン全画面適用 | ✅ 完了（2026-05-08） |
| P1-6 | 重複コンポーネント抽出 | ⏳ 未着手 |
| P1-7 | デッドコード削除 | ⏳ 未着手 |
| P1-8 | AGENTS.md 更新 | ✅ 完了（2026-05-08） |
| P1-9 | 通知タップ時のディープリンク | ⏳ 未着手 |
| P1-10 | アクセシビリティラベル最低限付与 | ⏳ 未着手 |
| P1-11 | 利用規約 | ⏳ 未着手 |
| P2-1〜P2-5 | こなれたら対応 | 💤 保留 |

---

## P0: リリース前必須

### ✅ P0-1. Firestore ルール `partnerUid` 直書き禁止 🔴 セキュリティ

- **問題**: [firestore.rules:19](../firestore.rules#L19) `users/{uid}` の write は `request.auth.uid == uid` のみで `partnerUid` フィールドの値を制限していない。攻撃者が自分の `partnerUid` を被害者UIDに直接書き換えると、ルール上 `users/{被害者uid}/entries` の `visibility == 'shared'` を全件読めてしまう。
- **対応**:
  - `users/{uid}` の write を `create / update` に分割
  - `update` では `request.resource.data.partnerUid == resource.data.partnerUid` を強制
  - `create` では `partnerUid` が含まれない（または null）であることを強制
  - クライアント側の `lib/db.ts:208-209` `updateDoc(... { partnerUid })` 系を全廃 → Cloud Function 経由のみに（v1 P0-1 で実装済みの関数だけが Admin SDK で書ける形に）
- **受け入れ条件**:
  - エミュレータで「自分の partnerUid を別人UIDに書き換える」write が拒否される
  - Cloud Function `pairWithCode` / `unpairPartner` / `deleteAccount` は通常通り動作
  - ペア中の正規のパートナー shared 投稿は引き続き読める
- **工数**: 0.5日

```
// ルール案
match /users/{uid} {
  allow read: if request.auth != null && (
    request.auth.uid == uid ||
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.partnerUid == uid
  );
  allow create: if request.auth.uid == uid
    && (!('partnerUid' in request.resource.data) || request.resource.data.partnerUid == null);
  allow update: if request.auth.uid == uid
    && request.resource.data.partnerUid == resource.data.partnerUid;
  allow delete: if false;
  ...
}
```

### ✅ P0-2. `inviteCodes` 直書き禁止＋`createUserProfile` 関数化 🔴 セキュリティ

- **問題**:
  - [firestore.rules:8](../firestore.rules#L8) `allow create: if request.auth.uid == request.resource.data.uid`。任意の6桁コードを攻撃者が事前占有可能。`regenerateInviteCode` のトランザクションを衝突させ続ける DoS、または将来コードを先取りして相手の招待コード採番を妨害できる。
  - クライアント `createUserProfile`（[lib/db.ts:120-148](../lib/db.ts#L120-L148)）が `setDoc(inviteCodes/code) → updateDoc(users/uid)` の二段書き込みをルール越しに行っている。これがあるかぎり `allow create: if false` にできない構造的不整合。
  - 二段書き込みがトランザクション外なので、片側失敗で孤立 inviteCode が残る。
- **対応**:
  - `inviteCodes/{code}` のルールを `allow create, update, delete: if false`（read のみ許可）に変更
  - `createUserProfile` の機能を Cloud Function `ensureUserProfile`（callable）に移植。Admin SDK で `runTransaction` 化
  - `lib/auth.tsx` の `refreshProfile` を新 callable 呼び出しに切替
  - もしくは Auth `beforeUserCreated` トリガー（v2 functions）で初回プロフィール作成
- **受け入れ条件**:
  - `inviteCodes` への直書きがエミュレータで拒否される
  - 新規アカウント作成時に inviteCode が一意発行される
  - 既存ユーザーで inviteCode が無いケースもバックフィルで補える
- **工数**: 0.5日

### ✅ P0-3. `aiSummary` 入力サイズ上限 🟠 コスト

- **問題**: [functions/src/index.ts:660](../functions/src/index.ts#L660) `aiSummary` は `entries` 配列の長さ・各 memo の長さ・合計文字数チェックがない。callable に直接巨大データを投げると Gemini 課金が膨らむ。
- **対応**:
  - `entries.length > 500` で `invalid-argument`
  - 合計文字数 > 50000 で `invalid-argument`
  - 各 entry の memo を 500文字でtruncate（プロンプトに乗せる前段で）
- **受け入れ条件**: 上記超過で 400系エラーが返る。通常の月内投稿（200件以内）では従来通り動作。
- **工数**: 0.1日

### ✅ P0-4. プライバシーポリシー・サポートURL・App Privacy 申告

- **問題**: App Store Connect 提出に必須。
- **対応**:
  - `web/privacy.html` `web/support.html` を Firebase Hosting にデプロイ（既存の `web/index.html` と同じデザインシステムで）
  - プライバシーポリシーに以下を明示:
    - 収集するデータ: メールアドレス（Firebase Auth）、投稿テキスト・気分スコア（Firestore）、Push Token（Expo）
    - AI 処理: 投稿/壁打ち/要約のテキストを Google Gemini API に送信して処理する旨。Google の保持/学習方針へのリンク
    - 第三者: Firebase（Google）、Expo Push、Google Generative AI
    - データ削除: 設定画面からアカウント削除可能（5.1.1(v) 準拠）
    - 連絡先: サポートメール
  - サポートページ: お問い合わせ導線・FAQ（最低5項目）
  - App Store Connect の App Privacy セクションで申告:
    - Contact Info – Email Address（Auth用、リンクされる）
    - User Content – Other User Content（投稿memo、リンクされる、トラッキングなし）
    - Identifiers – User ID（Firebase uid、リンクされる）
    - Usage Data – Product Interaction（任意）
- **受け入れ条件**:
  - https://futakoto.jp/privacy と https://futakoto.jp/support が公開済み
  - App Store Connect の App Privacy が「No Issues」表示
- **工数**: 1日

### ⏳ P0-5. TestFlight 実機検証

- **問題**: 開発中は Expo Go ベースで実機特有の挙動（push token 発行、通知タップディープリンク、Apple ID連携時の Firebase 挙動など）が未検証。
- **対応**:
  - EAS Build で iOS preview ビルド作成
  - TestFlight 内部テスト配信
  - チェック項目:
    - [ ] 新規アカウント登録 → ホーム表示
    - [ ] パートナーとペアリング（実機 ×2）
    - [ ] 投稿（自分のみ/共有）
    - [ ] 共有投稿で相手側に push 通知が届く
    - [ ] 通知タップでアプリが正しい画面に遷移する（P1-9 と連動）
    - [ ] 壁打ち→投稿転記
    - [ ] 月次AI要約
    - [ ] パスワード再設定メール受信
    - [ ] データエクスポート（ファイル共有）
    - [ ] アカウント削除→再ログイン不可
    - [ ] 解除→再ペア
- **受け入れ条件**: 上記チェック全項目が実機で動作。
- **工数**: 0.5〜1日（バグ修正含む）

---

## P1: 近いスプリント

### ⏳ P1-1. 解釈キャッシュ invalidate

- **問題**: パートナーが投稿を編集（`updateEntry`）しても、自分側の `interpretationCache/${entryOwnerId}_${entryId}` は古い解釈テキストのまま残る。「気持ちを読み解く」が古い意図を返し続ける。
- **対応**:
  - `entries` の `onDocumentUpdated` トリガーを追加し、`memo` か `mood` が変更されたら関連する全 viewer の `interpretationCache/{key}` を削除
  - もしくは entry の `updatedAt` をキャッシュキーに含める
  - クライアント側 `getAllInterpretationCaches` でも `entry.updatedAt > cache.createdAt` なら無視するフィルタ
- **受け入れ条件**: パートナーが投稿を編集→自分の画面で「気持ちを読み解く」を再タップ→新しい解釈が返る。
- **工数**: 0.3日

### ✅ P1-2. Firebase Auth エラー日本語化

- **問題**: `Alert.alert('エラー', e.message)` で `Firebase: Error (auth/email-already-in-use).` のような英文がそのまま表示される。リリース後の体験品質を直接下げる。
- **対応**:
  - `lib/errors.ts` を新設し、`firebaseErrorMessage(e: any): string` を実装
  - 主要 code を網羅:
    - `auth/email-already-in-use` → 「このメールアドレスはすでに使われています」
    - `auth/invalid-email` → 「メールアドレスの形式が正しくありません」
    - `auth/weak-password` → 「パスワードは6文字以上で設定してください」
    - `auth/wrong-password` / `auth/invalid-credential` → 「メールアドレスまたはパスワードが違います」
    - `auth/user-not-found` → 「アカウントが見つかりません」
    - `auth/network-request-failed` → 「通信に失敗しました。ネットワークを確認してください」
    - `auth/too-many-requests` → 「しばらくしてからもう一度お試しください」
    - `functions/resource-exhausted` → AIレート制限のメッセージはサーバー側で日本語済み、そのまま表示
  - 全 `Alert.alert('エラー', e.message)` を `Alert.alert('エラー', firebaseErrorMessage(e))` に置換
- **受け入れ条件**: ログイン画面・設定画面・各AI画面で英文エラーが出ない。
- **工数**: 0.5日

### ⏳ P1-3. メール認証 `sendEmailVerification`

- **問題**: 新規登録後すぐにアプリに入れる。パスワード再設定は所有メール宛に届くので、登録時のメール所有確認をしないと「赤の他人のメールで作り捨て」が可能。
- **対応**:
  - `app/login.tsx:30` `createUserWithEmailAndPassword` 成功直後に `sendEmailVerification(user)` を呼ぶ
  - 設定画面の「アカウント」セクションに「メール未認証」バッジと「認証メールを再送」ボタンを追加（`user.emailVerified` 監視）
  - 強制はしない（UX阻害）。ただし「アカウント削除」「パスワード再設定」前に未認証なら警告
- **受け入れ条件**: 新規登録時に確認メールが届く。設定画面で再送できる。
- **工数**: 0.3日

### ✅ P1-4. ログアウト確認ダイアログ

- **問題**: [settings.tsx:594](../app/(app)/settings.tsx#L594) `signOut(auth)` を直で呼ぶ。誤タップで再ログインの摩擦。
- **対応**: `Alert.alert('ログアウトしますか？', 'もう一度ログインが必要になります', [...])` を1段挟む。
- **工数**: 0.1日

### ✅ P1-5. `COLORS` / `MOODS` トークンの全画面適用

- **問題**: P1-1 v1 で `lib/theme.ts` を作ったが、import しているのは `TimePickerSheet.tsx` のみ。他は依然 `'#7B9E87'` `'#FAFAF8'` `'#E0E0E0'` のリテラル散在。
- **対応**:
  - 各画面の `StyleSheet.create({...})` 内のリテラル色を `COLORS.*` 参照に置換
  - 対象: `index.tsx` `calendar.tsx` `post.tsx` `consult.tsx` `settings.tsx` `favorites.tsx` `EntryCard.tsx` `EntryActionPanel.tsx` `app/(app)/_layout.tsx` `app/login.tsx`
  - 機械的置換できる箇所が大半。デザインに影響しない範囲で
  - `COLORS` に不足している色（`#E58B8B` パートナーピンク、`#5F856B` 濃緑など）を追加
- **受け入れ条件**: `grep -rn "#[0-9A-Fa-f]\{6\}" app components | grep -v 'theme.ts\|mood.ts'` の件数が大幅減（目安: 50件以下）。
- **工数**: 1〜1.5日

### ⏳ P1-6. 重複コンポーネントの抽出

- **問題**: 同一実装の散在
  - `sourceConsultationLink` × 3（`index.tsx:372` `calendar.tsx:738` `favorites.tsx:185`）
  - 日付フォーマット関数 `formatDate` `formatTime` `dateKey` の重複
  - `partnerName` 算出ロジック（`partnerProfile?.displayName ?? partnerProfile?.email?.split('@')[0] ?? 'パートナー'`）の重複
- **対応**:
  - `components/SourceConsultationLink.tsx` を新設し、3画面から呼び出し
  - `lib/format.ts` に `formatEntryDate` `formatTime` `dateKey` を集約
  - `lib/profile.ts` に `getPartnerDisplayName(profile)` を集約
- **工数**: 0.3日

### ⏳ P1-7. デッドコード削除

- **対応**:
  - `App.tsx`（Expo Router 採用後の残骸）削除
  - `lib/db.ts:297` `addConsultation` 削除（`getRecentConsultations` は `calendar.tsx` で使用中なので残す。ただし新規データは入らないことを明示するコメント1行）
  - `Entry.aiSummary` `Entry.aiTags` 型定義削除（書き込み・読み込みなし）
  - `UserProfile.isPremium` も同様に未使用なら削除
- **受け入れ条件**: `tsc --noEmit` がこれまで以上にクリーン。
- **工数**: 0.2日

### ✅ P1-8. AGENTS.md 更新

- **問題**: [AGENTS.md:534-540](../AGENTS.md#L534-L540) に「Firestoreルールは開発中認証済みなら全部OK」「リリース前に必ず厳密化すること」と書かれているが実際は厳密化済み。未来の自分や別エージェントを誤誘導する。
- **対応**:
  - 「既知の技術的制約」3項を「Firestore ルール（2026-05-08 厳密化済）」に書き換え
  - 進捗表に W7（プライバシー・規約・削除）= ✅完了、W8 = TestFlight 中 を反映
  - 「次にやるべき具体タスク」を v2 の本ファイルへのリンクに置換
- **工数**: 0.2日

### ⏳ P1-9. 通知タップ時のディープリンク

- **問題**: [notifications.ts:53](../lib/notifications.ts#L53) で `data.screen='post'`、Cloud Function の push に `data.kind='sharedEntry'` を含むが、タップハンドラがない。タップしてもアプリ起動するだけで該当画面に飛ばない。
- **対応**:
  - `app/_layout.tsx` の `RootLayout` で `Notifications.addNotificationResponseReceivedListener` を登録
  - `data.kind === 'sharedEntry'` → `router.push('/(app)/')` （ホームの該当投稿付近にスクロール）
  - `data.kind === 'dailyReminder'` → `router.push('/(app)/post')`
  - 起動時の cold-start 通知も拾う（`Notifications.getLastNotificationResponseAsync`）
- **受け入れ条件**: バックグラウンド／キル状態の双方で、通知タップから該当画面に遷移。
- **工数**: 0.3日

### ⏳ P1-10. アクセシビリティラベル最低限付与

- **問題**: 全画面で `accessibilityLabel` `accessibilityRole` がゼロ。VoiceOver で絵文字や Phosphor アイコンが読み上げられない。
- **対応**:
  - 主要操作のみまず付ける:
    - 投稿の気分ボタン × 5
    - お気に入り星アイコン
    - FAB（投稿追加）
    - パートナー連携ボタン
    - 削除アイコン
    - タブアイコン × 4
  - `<TouchableOpacity accessibilityLabel="気分: いい感じ" accessibilityRole="button">` 形式
- **受け入れ条件**: VoiceOver 起動状態で主要操作が音声で完結する。
- **工数**: 0.5〜1日

### ⏳ P1-11. 利用規約

- **問題**: App Store 提出は必須ではないが、AI生成コンテンツの責任分界・年齢制限・禁止事項を明示しておくと審査・運用ともに安心。
- **対応**:
  - `web/terms.html` を Firebase Hosting にデプロイ
  - 内容: サービス概要、AIによる生成物の責任、禁止事項、退会、知的財産、免責、準拠法
  - 設定画面に「プライバシーポリシー」「利用規約」リンクを追加
- **工数**: 0.3日

---

## P2: こなれたら

### 💤 P2-1. `consultations` collection の整理

- 現状 `consultations` （旧）と `consultationSessions` （新）が二重存在。`addConsultation` 削除後も `getRecentConsultations` を `calendar.tsx` で使い続けるかを判断。
- 新データはすべて `consultationSessions` に入っているので、`consultations` 表示を `consultationSessions` の最初のターンで代用するように `calendar.tsx` を書き換えれば、`getRecentConsultations` を完全廃止できる。
- 工数: 0.3日

### 💤 P2-2. TimePickerSheet → spinner 置換 or スクロール追従

- v1 P1-2 で共通化したが UX は引き続き劣る。値変更時に `ScrollView` が追従しない。
- 案A: `@react-native-community/datetimepicker` の `display="spinner"` に置換
- 案B: 値変更時に `scrollTo({ y: value * ITEM_HEIGHT - 100 })` を呼ぶ ref ベース実装
- 工数: 0.5日

### 💤 P2-3. 壁打ちセッション「続きから再開」導線

- 現状: 過去セッションは展開表示のみ。続きから話したい場合は新規開始するしかない。
- 対応: セッションヘッダーに「続きから話す」ボタン → 進行中の `conversation` を上書き確認 → セッションの turns を `conversation` に復元
- 工数: 0.3日

### 💤 P2-4. オンボーディング/初回パートナー連携CTAの強化

- 現状: 初回ログイン後ホームの空状態は「右下の＋ボタンで記録してみよう」のみ。
- 対応:
  - 初回1回だけ表示する3画面オンボード（投稿／壁打ち／ペアリング）
  - パートナー未連携時のホームに「招待コードをコピーして送る」CTAを大きく
  - パートナー連携後、最初の共有投稿前に「最初のひとことを送ってみよう」プロンプト
- 工数: 0.5〜1日

### 💤 P2-5. 17+ レーティング・通報機能

- App Store のレーティング設定で「ユーザー生成コンテンツ・無制限のWebアクセス」を Yes にすると 17+ になる。ふたことは「相互フォロー型のクローズドコンテンツ」のみで第三者には公開されないため、12+ で出せる可能性が高い。判断と申告を整える。
- それでも保険として「ペアからのコンテンツ報告」導線（パートナー投稿カードに通報メニュー）を入れておくと将来安全。
- 工数: 0.3日（レーティング判断のみ）／+0.5日（通報導線実装）

---

## 順序の推奨

1. **P0-1 → P0-2**（セキュリティ穴）
2. **P0-3**（コスト穴）
3. **P0-4**（プライバシーポリシー・サポート・App Privacy）
4. **P1-2 / P1-3 / P1-4**（ユーザー体験を直接傷つけているもの）
5. **P0-5**（ここまで終わったら TestFlight 実機検証へ）
6. **P1-1 / P1-9 / P1-10**（外側からの認知品質）
7. P1-5 / P1-6 / P1-7 / P1-8 を片付けてリファクタの土台を作ってから、P2 へ。

---

## デプロイ手順メモ

```bash
# Firestore ルールのみ
firebase deploy --only firestore:rules

# 関数のみ
cd functions && npm run build && cd .. && firebase deploy --only functions

# 個別関数（例）
firebase deploy --only functions:ensureUserProfile,functions:aiSummary

# Hosting（プライバシー/規約/サポート）
firebase deploy --only hosting

# 全部
firebase deploy
```

---

## 進捗ログ

- **2026-05-08 AM**: v2 起票。v1 で塞ぎ切れていなかった `partnerUid` 改竄経路 / `inviteCodes` 直書き経路 / `aiSummary` 入力サイズの3点を P0 として識別。Apple 提出に必要な privacy/support 公開と TestFlight 実機検証も P0 化。
- **2026-05-08 PM**: P0-1/P0-2/P0-3/P0-4 は前セッションで実装済みと判明。P1-8（AGENTS.md更新）→ P1-2（`lib/errors.ts`新設・全画面Authエラー日本語化）→ P1-4（ログアウト確認ダイアログ）→ P1-5（COLORSトークン全画面統一、202件→3件）を完了。git push 済み。

## メモ

- v1 のP0-1（ペアリング Cloud Function 化）は正解だが、ルール側の「partnerUid 直書き禁止」を組にしないと半分しか塞げていなかった。今回の v2 P0-1/P0-2 で完全クローズ。
- App Store 提出に必要なものは「アカウント削除（v1 P0-2 完了）」「プライバシーポリシー（v2 P0-4）」「サポートURL（v2 P0-4）」「実機検証（v2 P0-5）」の4本。これが揃えばリリース提出可能。
- Apple Sign In は現状サードパーティ認証なしなので不要。Google/Twitter等を追加する場合のみ必須化。
