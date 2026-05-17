# TestFlight Build 15 実機確認フィードバック修正

**日付**: 2026-05-17  
**対象**: TestFlight build 15 実機確認後の修正  
**目的**: β配布前に、ログイン・ホーム・投稿入力・振り返りの違和感を潰す

---

## 対応した指摘

### ログイン画面

- Appleログインでロゴが消える問題を修正
  - `AppleAuthenticationButton` を外側の `TouchableOpacity` で包まず、ネイティブボタンを直接描画する形に変更
- ログイン方法を Google / Apple のみに整理
  - メールアドレス・パスワード入力欄、メールログイン、登録切替リンクを削除

### ホーム

- 当日の記録を表示対象に変更
  - 以前のように過去記録込みで最新順表示すると、今日入れた記録が相手の投稿などに押し出されて「消えた」ように見えるため
  - 今日の記録だけを対象にし、最新3件を常時表示
  - 4件目以降は「今日の記録をあとN件見る」で展開
- 自分とパートナーの区切りを強化
  - 各カード上に「自分の記録」「パートナーの記録」ラベルを追加
  - `EntryCard` の枠線を自分/パートナーで色分け

### 投稿入力

- 入力中に画面がキーボードで隠れる違和感を軽減
  - `KeyboardAvoidingView` に `keyboardVerticalOffset` を追加
  - iOSで `automaticallyAdjustKeyboardInsets` を有効化
  - メモ欄フォーカス時にスクロール位置を上げる処理を追加
- 過去資料で確認した入力フォーム修正意図
  - `docs/reviews/2026-05-12-ui-research.md`
  - `docs/app/archive/done.md`
  - 意図は「入力欄のフォーカス状態・視認性・押せる感を上げる」こと。今回の修正では、そこにキーボード回避を追加した。

### 振り返り

- フィルターのリセットボタンを追加
  - フィルターまたはソートが初期状態から変わっている時だけ表示
- フィルターとソートを別操作として整理
  - フィルター: すべて / 自分 / 相手 / お気に入り / 相談
  - ソート: 新しい順 / 古い順
- 画面離脱時にフィルターとソートをリセット
  - 相談から振り返りへ遷移した後、別ページへ移動したら初期状態へ戻る
- 無料ユーザーの過去月表示を修正
  - 過去月へ移動してもカレンダー月自体は表示
  - 記録内容・気分色・相談ドットはロック
  - 何が起きたか分かるよう、過去月の記録はプレミアム対象である説明カードを表示

---

## 変更ファイル

- `app/login.tsx`
- `app/(app)/index.tsx`
- `app/(app)/post.tsx`
- `app/(app)/calendar.tsx`
- `components/EntryCard.tsx`

---

## 追加対応: UIロールバック（build 17予定）

build 16でログインとチュートリアルは動作確認できた一方、ホーム・投稿・振り返り・カードのUIが意図せず悪化したため、以下の方針で戻す。

- 残す
  - `app/login.tsx` のGoogle/Appleログイン対応
  - `components/OnboardingModal.tsx` のチュートリアル対応
- 戻す
  - `app/(app)/index.tsx`
  - `app/(app)/post.tsx`
  - `app/(app)/calendar.tsx`
  - `components/EntryCard.tsx`
- 戻し先
  - `7b3d812`（オンボーディング追加後・build 16 UI変更前）

この戻しにより、build 16で追加したホーム当日3件表示、振り返りリセット、過去月paywall、投稿入力キーボード回避は一旦外れる。必要なものは、UI復旧後に見た目を壊さない形で再実装する。

### build 17 提出結果

- EAS production build 成功
  - Build ID: `d4bcc9cc-d1d3-4453-808e-ce218952e523`
  - Build number: `17`
  - Build logs: https://expo.dev/accounts/h.okb/projects/futakoto/builds/d4bcc9cc-d1d3-4453-808e-ce218952e523
  - IPA: https://expo.dev/artifacts/eas/sgDn8wvqMehdZzL4DWymVi.ipa
- EAS Submit 成功
  - Submission ID: `80157b09-22c0-4694-95f6-bd9fb3b66c93`
  - Submission details: https://expo.dev/accounts/h.okb/projects/futakoto/submissions/80157b09-22c0-4694-95f6-bd9fb3b66c93
  - App Store Connect / TestFlight: https://appstoreconnect.apple.com/apps/6768653868/testflight/ios
- EAS Update 配信
  - Channel / branch: `production`
  - Runtime version: `f09ee4c59864a80773dcaf4b0d6ee1fcbaa19986`
  - Update group ID: `5ee34a59-c6d8-43c9-a028-04b23fcc9ed3`
  - iOS update ID: `019e3562-6b3e-7fe4-be2e-1a46d17e7a6f`
  - Message: `Restore UI from build 15 baseline`
  - EAS Dashboard: https://expo.dev/accounts/h.okb/projects/futakoto/updates/5ee34a59-c6d8-43c9-a028-04b23fcc9ed3
- EAS Update 再配信（build 17 runtimeVersion一致版）
  - Channel / branch: `production`
  - Runtime version: `bf2feced9265c7a3b546aa2ae67e74683ba50d16`
  - Update group ID: `7b83ad3e-7d9f-4d7b-8c72-a0b401bb8e36`
  - iOS update ID: `019e35a2-ca11-77ed-b566-455d52c1b87f`
  - Message: `Restore UI for build 17 runtime`
  - EAS Dashboard: https://expo.dev/accounts/h.okb/projects/futakoto/updates/7b83ad3e-7d9f-4d7b-8c72-a0b401bb8e36

---

## 確認

- `npx expo export --platform ios --output-dir /tmp/futakoto-export-check` 成功
- `npx expo export --platform ios --output-dir /tmp/futakoto-ui-rollback-check` 成功
- EAS production build 成功
  - Build ID: `52de6598-a8f5-4e1b-8ef5-91a34d0a1d6c`
  - Build number: `16`
  - Build logs: https://expo.dev/accounts/h.okb/projects/futakoto/builds/52de6598-a8f5-4e1b-8ef5-91a34d0a1d6c
  - IPA: https://expo.dev/artifacts/eas/bevLb6rJxdpmUvwaTsGYm5.ipa
- EAS Submit 成功
  - Submission ID: `5cab2fbf-40b9-4300-989e-7768420d70dc`
  - Submission details: https://expo.dev/accounts/h.okb/projects/futakoto/submissions/5cab2fbf-40b9-4300-989e-7768420d70dc
  - App Store Connect / TestFlight: https://appstoreconnect.apple.com/apps/6768653868/testflight/ios
- `npx tsc --noEmit` は既存の `eval/` と `functions/__tests__/` 側の未設定依存で失敗。今回の変更箇所由来のMetroバンドルエラーはなし。
