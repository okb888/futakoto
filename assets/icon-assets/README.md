# ふたこと — App Icon Assets

確定したアプリアイコン（重なる二円・文字なし）の書き出しデータ。

## デザインの趣旨
- 左の濃いセージ `#7B9E87` = 自分
- 右の淡いセージ `#C8D8CC` = 相手
- 重なった深いセージ `#5A7E68` = ふたりが交わる場所

## ファイル一覧

### マスター（SVG / ベクター）
| ファイル | 用途 |
|---|---|
| `futakoto-icon-1024.svg` | デフォルト（背景グラデーションあり）。Appストア／ホーム画面用のマスター。 |
| `futakoto-icon-mark.svg` | 透過・背景なし。サイトロゴやドキュメント内の差し込み用。 |
| `futakoto-icon-dark.svg` | ダーク背景版（`#2D2D2D`）。スプラッシュやダークUI用。 |
| `futakoto-icon-android-foreground.svg` | Android Adaptive Icon の前景（中央66%にマーク）。 |
| `futakoto-icon-android-background.svg` | Android Adaptive Icon の背景レイヤー。 |

### PNG（書き出し済み）
`png/` 以下。

| ファイル | サイズ | 用途 |
|---|---|---|
| `futakoto-icon-1024-1024.png` | 1024 | App Store Connect / Google Play |
| `futakoto-icon-1024-512.png` | 512 | Play Store / 中サイズ用 |
| `futakoto-icon-1024-180.png` | 180 | iPhone @3x ホーム |
| `futakoto-icon-1024-167.png` | 167 | iPad Pro @2x |
| `futakoto-icon-1024-152.png` | 152 | iPad @2x |
| `futakoto-icon-1024-120.png` | 120 | iPhone @2x |
| `futakoto-icon-1024-88.png` | 88 | Settings @3x |
| `futakoto-icon-1024-60.png` | 60 | Spotlight |
| `futakoto-icon-mark-{1024,512,256}.png` | 透過 | Web / OGP / 資料埋め込み |
| `futakoto-icon-dark-{1024,512}.png` | ダーク背景 | スプラッシュ |
| `futakoto-icon-android-foreground-432.png` | 432 | Android Adaptive Icon 前景 |

## カラーコード
```
セージ濃     #7B9E87
セージ淡     #C8D8CC
セージ重なり #5A7E68
背景グラデ   #FFFFFF → #FAFAF8 → #EDF0EA  (135°)
ダーク背景   #2D2D2D
```

## 注意
- iOSアイコンには角丸を含めないこと（OSが自動で角丸処理）
- 背景は完全な白ではなく `#FAFAF8` 寄りで、わずかに温かみを残す
- マークの中心は左にオフセット（円の重なりが視覚的中央に来るよう調整済み）
