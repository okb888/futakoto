# EAS Update運用メモ

**目的**: TestFlight/App Store配布後の軽微なJS/UI修正を、毎回App Store Connectへビルド提出せずに反映する。

## できること

- 文言修正
- React Native / Expo Router の画面UI修正
- TypeScript/JavaScriptのロジック修正
- 既存アセットの差し替え

## ビルドが必要なこと

- `expo install` / `npm install` でネイティブモジュールを追加・更新したとき
- `app.json` / `app.config.js` のネイティブ設定を変えたとき
- iOS権限、Info.plist、通知、認証プロバイダ、課金SDKなどネイティブ層に関わる変更
- Expo SDK / React Native のアップグレード

## 初回手順

EAS Updateは、`expo-updates` と `updates.url` / `runtimeVersion` が入ったビルドで初めて有効になる。既存のbuild 16以前には効かない。

1. `eas build --platform ios --profile production`
2. App Store Connect / TestFlight に提出
3. そのビルドをインストールしてスモークテスト
4. 以後、JS/UIだけの修正は `npm run update:production -- --message "修正内容"` で配信

## チャンネル

| 用途 | EAS profile | channel | コマンド |
|---|---|---|---|
| 内部検証 | `preview` | `preview` | `npm run update:preview -- --message "..."` |
| TestFlight/App Store | `production` | `production` | `npm run update:production -- --message "..."` |

## 注意

- 更新は「同じchannel」かつ「同じruntimeVersion」のビルドだけが受け取る。
- `runtimeVersion` は `fingerprint` ポリシー。ネイティブ依存やExpo設定が変わると別ランタイムになり、古いビルドには配信されない。
- OTA更新は通常、起動時に確認・ダウンロードされ、次回起動時に反映される。
