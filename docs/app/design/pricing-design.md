# ふたこと 課金設計

**策定日**: 2026-05-09
**対象リリース**: 2026年6月（5/31 App Store審査提出）
**目標**: 2026年8月31日までに月額¥500の課金が1人発生
**事前検死v2 対応**: 🔴 R10（無料が便利すぎて課金しない）/ D08（課金UI未実装）

> このドキュメントは「ふたこと」のフリーミアム設計とPremium特典・実装方針の確定版。
> 議論の詳細・競合リサーチの出典は本文末尾の「補遺」を参照。

---

## 1. 設計サマリー

| 項目 | 決定内容 |
|---|---|
| 価格 | **月額¥500のみ**（買い切り・年額なし） |
| 課金単位 | **1契約でふたり分**（ペアの片方が払えば両方Premium扱い） |
| 無料トライアル | **なし**（無料月5回が事実上のトライアル兼用） |
| 無料枠 | **AI機能 6種合算で月5回**（aiRewrite / aiConsult / aiDraftOptions / aiDraft / aiInterpret / aiSummary） |
| リセット方式 | **初回利用日基準のローリング月**（cron不要、ユーザーごとに30日リセット） |
| ペアリング前 | **AI使用OK**（誘導効果狙い） |
| 失効後 | 過去データはすべて閲覧維持。新規生成のみ無料枠に戻る |
| Apple税 | **Small Business Program 登録**（標準30% → 15%、手取り¥425/月） |

### Premium特典（¥500/月）

```
ふたこと Premium ¥500/月（1契約でふたり分）

✓ AI機能 月何回でも（書き換え・相談・解釈・要約）
✓ 過去全期間の振り返り（無料は当月のみ）
✓ AI相談の会話履歴を長期保存・閲覧（無料は直近10件）
  ※AIに渡すのは直近10件のみ。それ以前は閲覧専用
```

「広告非表示」は不採用（広告投入の予定なし。夫婦がじっくり話す体験を阻害したくない）。

---

## 2. 設計判断の根拠

### なぜ月5回か
- 月3回だと AI 4機能を1つずつ試す前に枠が消える可能性 → R10対策として弱い
- 月10回以上だと「夫婦で週2-3回使う」想定で満足してしまい課金理由が消える
- **5回 = 各機能を1つずつ試した上で、お気に入り機能を1-2回追加で使える**ボリューム
- 初期値は5。β配布後の利用ログを見て、数値はFirestoreの定数で後から調整可能にする

### なぜ¥500か（競合との比較）

| アプリ | 価格/月 | 課金単位 | 夫婦2人で必要な金額/月 |
|---|---:|---|---:|
| TimeTree（日） | ¥300 | 個別 | ¥600 |
| みてね（日） | ¥480 | 個別 | ¥960 |
| Paired（米） | ¥1,050（$7） | 1契約2人 | ¥1,050 |
| Lasting（米） | ¥4,500（$30） | 1契約2人 | ¥4,500 |
| Wysa（印・AI） | ¥940（$6.25） | 個別 | ¥1,880 |
| **ふたこと** | **¥500** | **1契約2人** | **¥500** |

- 1契約2人方式なので、**夫婦単位の比較で最安値**
- 米系の同型アプリ（Paired・Lasting）と比べて圧倒的に安い
- 課金1人達成は**価格より分母（DL数）の問題**（事前検死 B01）。価格を下げても流入は増えない
- 一度下げた価格は心理的に上げにくい → まず¥500で出して、半年後に転換率0%なら下げる方が安全

### なぜ1契約2人か
- Paired / Lasting / Relish はすべて1契約2人方式
- 「夫婦アプリ」のコア価値（ふたりで使う）と整合
- 実装は「ペアの片方が premium なら両方 premium 扱い」で済む（pairedWith フィールド参照）
- ペア相手の追加課金導線を作らなくて済むので UX もシンプル

### なぜ初回利用日基準ローリングか
- 月初一括 cron だと月末登録ユーザーが数日で枠消費して不満
- Firestore 全件更新で cron 負荷が増える
- ローリング方式は**リクエスト時にチェック・更新するだけ**で cron 不要
- Figma / MS Copilot / Lovart も同方式

### なぜトライアルなしか
- 無料月5回が事実上のトライアル
- RevenueCat 2025レポート: ハードペイウォール（トライアルなし）はフリーミアムより5倍転換（10.7% vs 2.1%）
- 二重トライアル（無料5回 + 7日無料）は冗長

---

## 3. UI動線

### ヘッダー（無料ユーザー）
- 各タブ（ホーム/相談/振り返り/投稿）の右上に **AI 残N/5** チップ
- Premium ユーザーは非表示（代わりに設定画面に Premium バッジ）

### 課金誘導モーダルが出るタイミング
1. **5回使い切った直後**にAIボタンを押した瞬間（ペイウォールモーダル＝ボトムシート）
2. **残1回時にトースト警告**（「残り1回。¥500で無制限になります」）
3. **設定画面**に常時「Premiumにアップグレード」セクション
4. **月次振り返り画面**で過去月遡及時に「Premiumなら全期間見られる」訴求

### Premium限定UI
- 振り返り画面の月遷移ボタンが当月以前で無効化 → タップ時にペイウォール
- AI相談の履歴で11件目以降が「Premiumで閲覧」プレースホルダ

---

## 4. 実装方針

### 技術選定
- **RevenueCat**（必須）: StoreKit直叩きより楽。無料枠 $10K MTR/月で個人開発者には十分
- **EAS Build**（必須）: `react-native-purchases` はネイティブモジュールなので Expo Go では動かない。`expo-dev-client` + EAS Build に移行
- **Apple Small Business Program**（必須）: 登録で税率15%

### Firestore データモデル

```
users/{uid}
  ├ premium: boolean             // RevenueCat webhook で更新
  ├ premiumExpiresAt: Timestamp  // 失効日
  ├ aiUsageCount: number         // 当期使用回数（0-5）
  ├ aiResetAt: Timestamp         // 次回リセット日時
  └ pairedWith: string | null    // ペアの uid（既存）
```

### Cloud Functions の使用回数ガード

`functions/src/index.ts` の6つのAI関数（`aiRewrite` / `aiConsult` / `aiDraftOptions` / `aiDraft` / `aiInterpret` / `aiSummary`）の冒頭に共通ヘルパーを差し込む:

```ts
async function checkAndConsumeAiQuota(uid: string): Promise<void> {
  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const u = snap.data()!;

    // 1. ペア相手が premium なら自分も premium 扱い（1契約で2人）
    let isPremium = u.premium === true;
    if (!isPremium && u.pairedWith) {
      const partner = await tx.get(db.doc(`users/${u.pairedWith}`));
      isPremium = partner.data()?.premium === true;
    }
    if (isPremium) return; // 制限なし

    // 2. リセット判定（初回利用日基準ローリング）
    const now = admin.firestore.Timestamp.now();
    let count = u.aiUsageCount ?? 0;
    let resetAt = u.aiResetAt;
    if (!resetAt || now.toMillis() >= resetAt.toMillis()) {
      count = 0;
      resetAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 30 * 86400_000);
    }

    // 3. 上限チェック
    if (count >= 5) {
      throw new HttpsError('resource-exhausted', 'FREE_LIMIT_REACHED');
    }

    // 4. 消費を予約（成功確定後にコミット）
    tx.update(userRef, { aiUsageCount: count + 1, aiResetAt: resetAt });
  });
}
```

**重要**: Gemini呼び出しが失敗したらカウンタを戻す（catch でロールバック）。

### RevenueCat Webhook → Cloud Functions

```ts
export const revenuecatWebhook = onRequest(async (req, res) => {
  // RevenueCat から INITIAL_PURCHASE / RENEWAL / CANCELLATION 等が飛ぶ
  // app_user_id（=Firebase uid）で users/{uid}.premium を更新
});
```

イベント種別:
- `INITIAL_PURCHASE` / `RENEWAL`: `premium = true`、`premiumExpiresAt` 更新
- `CANCELLATION` / `EXPIRATION`: `premium = false`
- `BILLING_ISSUE`: 猶予期間あり（grace_period_expires_atまでpremium維持）

### クライアント側（Expo）の追加ファイル

| ファイル | 役割 |
|---|---|
| `lib/purchases.ts` | RevenueCat 初期化、`Purchases.configure({ apiKey, appUserID: auth.currentUser.uid })` |
| `lib/usage.ts` | Firestore の `aiUsageCount` / `premium` を購読するhook（`useAiQuota`） |
| `components/AiQuotaChip.tsx` | ヘッダー右上の残回数チップ |
| `components/PaywallModal.tsx` | ボトムシート、特典4つを表示、`Purchases.purchasePackage()` で購入 |
| `components/PremiumTeaser.tsx` | Premium限定機能の場所に置く誘導カード |

### App Store Connect 作業
1. Apple Developer Program 承認後（D. リリース準備の今週TOP3）
2. サブスクグループ `futakoto_main` 作成
3. Product ID: `futakoto_premium_monthly`、価格 ¥500（Tier 5）、期間1ヶ月
4. ローカライゼーション + 審査スクショ
5. **Apple Small Business Program 登録**
6. RevenueCat ダッシュボードで Entitlement `premium` にマップ

---

## 5. 実装順（来週以降）

| # | タスク | 想定工数 |
|---|---|---|
| 1 | EAS Build 環境整備（`expo-dev-client` 追加、`eas build` 動作確認） | 0.5日 |
| 2 | Cloud Functions の使用回数ガード（6関数すべてに差し込み・トランザクション化） | 1日 |
| 3 | RevenueCat 統合（`react-native-purchases` 追加、初期化、Webhook） | 1日 |
| 4 | `AiQuotaChip` + `PaywallModal` 実装 | 1日 |
| 5 | 振り返り画面の当月のみフィルタ（`calendar.tsx` に Premium 判定） | 0.5日 |
| 6 | AI相談履歴の10件制限（`consult.tsx` + Firestore クエリ） | 0.5日 |
| 7 | App Store Connect SKU 作成 + Sandbox テスト | 0.5日 |
| 8 | β配布で課金フロー検証 | 配布期間中 |

合計: **約6日**（5/15週〜5/20週で完了させる想定）。

---

## 6. β配布での検証ポイント

同僚2組+奥さん（合計3ペア）への配布時に確認:

- [ ] 5回使い切った瞬間のペイウォール表示が違和感なく出る
- [ ] 残1回時のトーストが鬱陶しくない
- [ ] ペアの片方が課金したら、もう片方が即時 Premium 扱いになる（30秒以内）
- [ ] 解約後、過去データが閲覧できる
- [ ] 月をまたぐタイミングでカウンタが正しくリセットされる（初回利用日基準）
- [ ] **「3回でも10回でもなく5回が適切か」のフィードバック**を聞く

---

## 7. 補遺: リサーチ出典

### 主要参考アプリ
- [Paired Premium](https://www.paired.com/premium) / [Paired×Amplitude事例（+5%転換）](https://amplitude.com/blog/paired-amplitude-engagement-retention)
- [Lasting Subscription](https://getlasting.com/subscription)
- [Relish FAQ](https://hellorelish.com/faqs/)
- [Replika Subscriptions](https://help.replika.com/hc/en-us/articles/39551043419149-Choosing-a-Subscription)
- [Wysa FAQ](https://www.wysa.com/faq)
- [TimeTree Premium](https://timetreeapp.com/intl/ja/premium)
- [みてねPremium](https://family-album.com/premium)
- [Eureka社 Couplesサービス終了告知](https://eure.jp/press/20200512/)（日本のカップル特化アプリの市場リスク）

### 業界ベンチマーク
- [RevenueCat State of Subscription Apps 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- [RevenueCat 2026版](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026/)
- [Business of Apps: Trial Benchmarks](https://www.businessofapps.com/data/app-subscription-trial-benchmarks/)
- [Schematic HQ: AI Credits設計](https://schematichq.com/blog/ai-credits)

### 実装ドキュメント
- [RevenueCat × Expo公式](https://www.revenuecat.com/docs/getting-started/installation/expo)
- [Zenn: App Storeサブスク公開手順 2025](https://zenn.dev/moutend/articles/10111adb25d877)
- [Firebase Schedule Functions](https://firebase.google.com/docs/functions/schedule-functions)

### 検討したが不採用にしたもの
- **7日無料トライアル**: 無料5回が実質トライアル。二重化する必要なし
- **広告非表示特典**: 広告投入予定なしのため特典として成立しない
- **「深掘りモード」（understanding 限定公開）**: `understanding` は既に `aiRewrite` で全ユーザー表示中。"つかみ"として無料で見せる方が課金動線が強い
- **A+Cハイブリッド（パートナー送信を有料のみ）**: 「夫婦で共有」というコア価値と矛盾するため不採用
- **¥350への値下げ**: 1契約2人なので競合より既に安い。価格より分母（DL数）が課題
