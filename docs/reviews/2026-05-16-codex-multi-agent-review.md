# ふたこと Codex版 マルチエージェントレビュー 2026-05-16

> 作成者: Codex
> 目的: Claude側レビューと区別するための、Codex側マルチエージェントレビュー結果の保存版
> 対象: App Store審査提出前のセキュリティ・品質・UX・リリース判定
> 実行元プロンプト: `docs/REVIEW-PROMPT.md`

---

## 結論

**App Store審査提出判定: HOLD**

現状のまま提出するのは危険。理由は主に以下。

- AI同意まわりに、同意保存失敗後もAI送信される経路がある
- 月次AI要約がAI同意確認なしで投稿本文を送信できる
- `aiConsult` のレスポンスschemaとクライアント期待値が不一致
- アプリ内の法務リンクが `futakoto.app` になっており、公開済みURLとずれている
- PaywallにApp Storeサブスクリプション解約方法の明示が不足
- `inviteCodes` が全認証ユーザーから読める
- `aiInterpret` のキャッシュが権限確認より先に返る

ただし、5/31提出に向けて致命的に遠い状態ではない。P0/P1を直し、TestFlightで「新規ログイン、ペアなし、ペア済み、AI全機能、IAP購入/復元、オフライン」を通せばGO判定に近づく。

---

## 実行メモ

ユーザー指示では「8つのAgent toolを同時に呼び出す」指定だったが、Codex実行環境の同時エージェント上限により、実際には以下で実行した。

- 第1波: 6エージェント並列
- 完了した枠を閉じて、第2波: アクセシビリティ、アナリティクスを追加

結果として、8領域すべてのレビュー結果は取得済み。

---

## サマリー表

| エージェント | 🔴必須 | 🟡重要 | 🟢推奨 |
|---|---:|---:|---:|
| セキュリティ | 1 | 4 | 3 |
| バグ | 3 | 6 | 3 |
| バックエンド | 2 | 7 | 3 |
| フロントエンド | 3 | 10 | 0 |
| リリース | 3 | 2 | 3 |
| UX | 5 | 6 | 4 |
| アクセシビリティ | 5 | 6 | 1 |
| アナリティクス | 2 | 5 | 1 |

---

## 今すぐ直すべきTOP5

### 1. AI同意まわりの不備

**対象**

- `app/(app)/post.tsx:202`
- `app/(app)/consult.tsx:108`
- `app/(app)/calendar.tsx:371`

**問題**

- 投稿AIリライト: `setAiConsentAcknowledged()` または `refreshProfile()` が失敗しても、`finally` で `runAiRewrite()` が実行される
- AI相談: 同意保存失敗後も `handleConsult()` が走る
- 月次AI要約: `aiConsentAcknowledged !== true` でも同意モーダルなしで `aiSummary()` を実行できる

**影響**

- 同意が保存されていないのにユーザー本文・相談文・投稿本文がGeminiへ送信される
- プライバシー説明と実挙動がずれる
- App Store審査・ユーザー信頼の両面で危険

**修正方針**

```ts
async function handleAgreeConsent() {
  if (!user) return;
  try {
    await setAiConsentAcknowledged(user.uid);
    await refreshProfile();
    setConsentOpen(false);
    await runAiRewrite();
  } catch (e: any) {
    const c = classifyError(e);
    Alert.alert(c.title, c.message);
    setConsentOpen(false);
  }
}
```

月次要約にも `AiConsentModal` を追加し、同意保存成功後だけ `handleAiSummary()` を続行する。

---

### 2. `aiConsult` のレスポンスschema不整合

**対象**

- `functions/src/shared.ts`
- `functions/src/ai-functions.ts`
- `hooks/useConsultSession.ts`

**問題**

`functions/src/shared.ts` の `CONSULT_SCHEMA` は `reflection` / `readyForDraft` を要求している一方、`functions/src/ai-functions.ts` とクライアント側は `reply` を期待している。

**影響**

- AI相談が審査中・TestFlight中に失敗する可能性が高い
- アプリの主要機能のひとつが壊れて見える

**修正方針**

クライアント期待値に合わせるなら、schemaを `reply` に統一する。

```ts
const CONSULT_SCHEMA = {
  type: 'object',
  required: ['reply'],
  properties: {
    reply: STRING_SCHEMA,
  },
};
```

またはクライアント・保存形式を `reflection` に寄せる。どちらにしても、Functions build後にTestFlightでAI相談を実機確認する。

---

### 3. `inviteCodes` が全認証ユーザーに読める

**対象**

- `firestore.rules:7`
- `functions/src/pairing.ts:80`

**問題**

認証済みユーザーなら任意の `inviteCodes/{code}` を直接 `get` できる。存在判定と `uid` 取得が可能。

**攻撃シナリオ**

捨てアカウントで招待コードを総当たりし、未ペアユーザーに勝手にペアリングしてプロフィールや共有投稿を読む。

**修正方針**

クライアントから `inviteCodes` を読ませず、`pairWithCode` のAdmin SDKだけが参照する。

```firestore
match /inviteCodes/{code} {
  allow read, create, update, delete: if false;
}
```

`pairWithCode` 側には形式検証を追加する。

```ts
const normalizedCode = code.trim().toUpperCase();
if (!/^[A-HJ-KM-NP-Z2-9]{6}$/.test(normalizedCode)) {
  throw new HttpsError('invalid-argument', '招待コードの形式が正しくありません');
}
```

追加で、試行回数制限・コード期限・App Checkを検討する。

---

### 4. 法務リンクとPaywall審査要件

**対象**

- `components/PaywallModal.tsx:140`
- `components/AiConsentModal.tsx:35`
- 設定画面の法務リンク

**問題**

- PaywallとAI同意モーダル内の法務リンクが `https://futakoto.app/...` になっている
- 公開確認済みURLは `https://futakoto.web.app/privacy.html` または `https://futakoto.jp/privacy`
- Paywallに「App Storeのサブスクリプション管理から解約できる」旨の明示が不足

**影響**

- App Store審査でPrivacy Policy / Termsリンク不備として落ちる可能性
- サブスクリプション要件の説明不足

**修正方針**

- リンクを公開済みURLへ統一
- Paywallに解約方法を明記

```tsx
<Text style={styles.priceNote}>
  いつでも解約可能。解約はApp Storeのサブスクリプション管理から行えます。
  ペアの片方が契約すれば、ふたりとも無制限になります。
</Text>
```

---

### 5. `aiInterpret` のキャッシュが権限確認より先に返る

**対象**

- `functions/src/ai-functions.ts:460`
- `functions/src/triggers.ts:35`

**問題**

cache hit時に、ペア関係・投稿存在・`visibility == shared` を確認せず解釈結果を返している。visibility変更時のキャッシュ削除も不足。

**影響**

sharedからprivateに戻した後も、相手が古い解釈キャッシュを読める可能性がある。

**修正方針**

- 投稿取得と権限確認をcache lookupより前に移動
- 投稿編集・visibility変更時に関係する `interpretationCache` を削除

---

## P0: 提出前に必ず修正

### P0-1: AI同意保存失敗後もAI送信される

**対象**

- `app/(app)/post.tsx:202`
- `app/(app)/consult.tsx:108`

**修正**

`finally` でAI送信しない。`try` 成功後だけ実行する。

---

### P0-2: 月次AI要約に同意ガードがない

**対象**

- `app/(app)/calendar.tsx:371`

**修正**

投稿画面・相談画面と同じ `AiConsentModal` を挟む。

---

### P0-3: `aiConsult` schema不整合

**対象**

- `functions/src/shared.ts`
- `functions/src/ai-functions.ts`

**修正**

`reply` か `reflection` のどちらかに統一。現状のクライアントに合わせるなら `reply`。

---

### P0-4: 法務リンクが壊れている

**対象**

- `components/PaywallModal.tsx`
- `components/AiConsentModal.tsx`
- 設定画面の利用規約/プライバシーポリシーリンク

**修正**

`futakoto.app` を使わず、公開済みURLへ統一。

候補:

- `https://futakoto.web.app/privacy.html`
- `https://futakoto.web.app/terms.html`
- `https://futakoto.jp/privacy`
- `https://futakoto.jp/terms`

---

### P0-5: Paywallの解約方法明示

**対象**

- `components/PaywallModal.tsx`

**修正**

App Storeのサブスクリプション管理から解約できる旨を明記。

---

### P0-6: `inviteCodes` のread禁止

**対象**

- `firestore.rules`
- `functions/src/pairing.ts`

**修正**

Firestore rulesでread禁止。Cloud FunctionsだけがAdmin SDKで参照。

---

### P0-7: `aiInterpret` キャッシュの権限確認順

**対象**

- `functions/src/ai-functions.ts`
- `functions/src/triggers.ts`

**修正**

権限確認後にcache hitを返す。visibility変更時のcache invalidationを追加。

---

## P1: 審査前に強く推奨

### P1-1: Auth guardが未認証時も保護画面を一瞬描画する

**対象**

- `app/_layout.tsx:50`

**問題**

redirectは `useEffect` 後に走るが、常に `<Slot />` を返している。起動直後・サインアウト直後に `(app)` 画面が一瞬見える可能性。

**修正**

`loading` 中はローダー、`!user && inApp` は `null` または `Redirect` を返して描画を止める。

---

### P1-2: カレンダー初期ロード失敗で無限ローディング

**対象**

- `app/(app)/calendar.tsx:209`

**問題**

`load()` に外側の `try/catch/finally` がなく、Firestore取得失敗時に `setLoading(false)` されない。

**修正**

`load()` 全体を `try/catch/finally` で包み、ユーザー向けAlertとloading解除を保証する。

---

### P1-3: AI関数に `maxInstances` / timeout のハード上限がない

**対象**

- `functions/src/shared.ts:17`

**問題**

`AI_FUNCTION_OPTIONS` は `secrets/region/invoker` のみで、`maxInstances` / `timeoutSeconds` が未設定。Gemini SDK呼び出しにも明示timeoutがない。

**修正**

- AI関数に `maxInstances` と短めの `timeoutSeconds` を設定
- Gemini呼び出しにもtimeoutを追加
- Premiumにもabuse防止のhard capを置く

---

### P1-4: Paywall / AI同意モーダルのアクセシビリティ

**対象**

- `components/PaywallModal.tsx:91`
- `components/AiConsentModal.tsx`
- `app/(app)/consult.tsx:358`

**問題**

`accessibilityViewIsModal` がなく、VoiceOverフォーカスが背景へ漏れる可能性。閉じるXにもラベル不足。

**修正**

```tsx
<View style={styles.sheet} accessibilityViewIsModal>
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel="プレミアム案内を閉じる"
  >
```

---

### P1-5: ブランド主色の白文字コントラスト不足

**対象**

- `lib/theme.ts:4`

**問題**

`COLORS.primary #7B9E87` と白文字のcontrastが約2.96:1。ログイン・保存・購入CTAがWCAG AAの4.5:1に届かない。

**修正案**

```ts
primary: '#5A7E68',
primaryText: '#4F735D',
```

デザインシステム `.design/system.md` も合わせて更新する。

---

### P1-6: RevenueCat初期化がログイン後フローにない

**対象**

- `lib/auth.tsx`
- `lib/purchases.ts`

**問題**

`configurePurchases(uid)` の呼び出しが見当たらず、Paywallが常に開発中扱いになる可能性。

**修正**

AuthProviderのログイン確定後にRevenueCat初期化を呼ぶ。

---

### P1-7: TestFlightでの必須検証

**対象**

- `docs/app/release-status.md`
- App Review Notes

**確認項目**

- 新規登録
- ログイン
- Apple Sign in
- Google Sign in
- ペアなし利用
- ペア済み利用
- 投稿
- AIリライト
- AI相談
- 気持ち読み解き
- 月次AI要約
- Paywall表示
- Sandbox購入
- 復元
- オフライン起動
- アカウント削除

---

## P2: β配布中に直す

### P2-1: AI相談・投稿保存・読み解きの二重送信

**対象**

- `hooks/useConsultSession.ts:157`
- `app/(app)/post.tsx:142`
- `app/(app)/index.tsx:192`

**問題**

state反映前の連打でAI呼び出しや保存が二重実行される可能性。

**修正**

`loading` stateだけでなく `inFlightRef` / `savingRef` で同期的に排他する。

---

### P2-2: AIリライト結果が古い本文に反映される

**対象**

- `app/(app)/post.tsx:169`

**問題**

AI実行中に本文変更または画面離脱すると、古い入力へのリライト結果が表示される可能性。

**修正**

request idとmounted refを持ち、完了時に最新入力と一致する場合だけ反映する。

---

### P2-3: ログ一覧が `ScrollView + map` で全件描画

**対象**

- `app/(app)/calendar.tsx:789`

**問題**

100件超で初期描画・メモリ・スクロール性能が悪化。

**修正**

`FlatList` / `FlashList` に置換し、ヘッダーは `ListHeaderComponent` 化する。

---

### P2-4: TextInputがplaceholder依存

**対象**

- `app/login.tsx:97`
- `app/(app)/post.tsx`
- `app/(app)/consult.tsx`

**問題**

入力後にラベル文脈が失われる。

**修正**

`accessibilityLabel` / `textContentType` を付与する。

```tsx
<TextInput
  accessibilityLabel="メールアドレス"
  textContentType="emailAddress"
  placeholder="メールアドレス"
/>
```

---

### P2-5: タップ領域44pt未満

**対象**

- `components/HomeMoodInput.tsx:53`
- `app/(app)/index.tsx:295`
- `app/(app)/post.tsx:309`

**修正**

主要ボタンに `minHeight: 44` / `minWidth: 44` を追加。

---

### P2-6: Firebase AnalyticsがReact Nativeでno-opの可能性

**対象**

- `lib/analytics.ts`
- `lib/firebase.ts`

**問題**

`firebase/analytics` Web SDKはReact Nativeでは実質的に動かない可能性が高い。

**修正**

- `@react-native-firebase/analytics` などネイティブ対応SDKへ変更
- もしくはCloud Functions / PostHog等へ送る
- TestFlightでGA4 DebugView反映まで確認

---

### P2-7: 重要イベントの計測漏れ

**未計測**

- `pair_completed`
- `ai_feature_used: interpret`
- `ai_feature_used: summary`
- `ai_quota_exceeded: consult`
- `ai_quota_exceeded: interpret`
- `ai_quota_exceeded: summary`
- Apple / Google の `sign_up`

**修正**

成功時・quota時に `lib/analytics.ts` の関数を呼ぶ。

---

## P3: β後・運用改善

### P3-1: お気に入りIDを無制限取得

**対象**

- `lib/db.ts:385`

**問題**

`getFavoriteEntryIds` が favorites全件を毎回取得。

**修正**

表示中entryのキーだけ取得、またはページング・件数制限を入れる。

---

### P3-2: パートナー投稿を月範囲なしで500件取得

**対象**

- `app/(app)/calendar.tsx:238`

**問題**

月表示なのに最新500件を取得。過去月は500件外だと欠落する。

**修正**

`getPartnerSharedEntriesInRange(partnerUid, start, end)` を追加する。

---

### P3-3: `unpairPartner` がサブコレクション全件読み＋単一batch

**対象**

- `functions/src/pairing.ts:137`

**問題**

favorites / interpretationCacheを両ユーザー分全件取得し、1 batchで削除。500件超で失敗する。

**修正**

検索用フィールド追加、queryで絞り込み、400件程度でページング削除。

---

### P3-4: RevenueCatイベント順序・重複への防御不足

**対象**

- `functions/src/revenuecat-webhook.ts:170`

**問題**

`event_timestamp_ms` を保持・比較せず、届いた順にpremium状態を上書き。

**修正**

`revenuecatLastEventTimestampMs` を保存し、古いイベントは無視する。

---

### P3-5: Sentry user未設定

**対象**

- `lib/auth.tsx`

**問題**

`Sentry.setUser({ id: uid })` が見当たらない。

**修正**

Auth state changeでuidのみ設定。ログアウト時は `Sentry.setUser(null)`。

---

## エージェント別詳細

### Agent 1: セキュリティ

#### 🔴 `firestore.rules:7` inviteCodes が全認証ユーザーに読める

- 問題: 認証済みなら任意の `inviteCodes/{code}` を直接 `get` でき、存在判定と `uid` 取得が可能
- 攻撃シナリオ: 捨てアカウントでコードを総当たりし、未ペアユーザーに勝手にペアリングしてプロフィールや共有投稿を読む
- 修正: `inviteCodes` の `allow read` を禁止し、`pairWithCode` のみAdmin SDKで参照。試行回数制限、コード期限、App Checkも追加

#### 🟡 `functions/src/shared.ts:139` premium継承が片方向partnerUidを信頼

- 問題: `users/{uid}.partnerUid` の相手がpremiumなら、自分もpremium扱いにする。相手側の `partnerUid === uid` は確認していない
- 攻撃シナリオ: unpair/deleteの途中失敗や運用ミスで片方向の古い `partnerUid` が残ると、元パートナーのpremiumを継続利用できる
- 修正: 相手ドキュメント取得後に `partnerSnap.data().partnerUid === uid` を必須化

#### 🟡 `revenuecat-webhook.ts:122` RevenueCat app_user_id をそのままpremium対象UIDにしている

- 問題: クライアント指定UIDをRevenueCat `appUserID` にし、Webhookは `event.app_user_id` を信じて `users/{uid}.premium` を更新する
- 攻撃シナリオ: 改造クライアントやRevenueCat transfer設定次第で、購入・復元イベントを任意UIDに紐づけられる
- 修正: RevenueCat transfer behaviorを固定確認し、Webhookでproduct/entitlement/owner状態を厳格化

#### 🟡 `ai-functions.ts:393` wrapUserData未適用のユーザー制御値が残っている

- 問題: `communicationStyle`、`partnerName`、client-writableなsession `reflection` がプロンプトに生挿入される箇所がある
- 攻撃シナリオ: ユーザーが「以降の指示を無視」系の文を入れ、出力形式や安全制約を崩す
- 修正: 全ユーザー制御文字列を `wrapUserData` で囲む。`communicationStyle` はenum化または固定テンプレ化

#### 🟡 `ai-functions.ts:64` AI内部エラーのmessageをクライアントへ返している

- 問題: `catch` で `e.message` を `HttpsError('internal', ...)` に含めて返している箇所が複数ある
- 攻撃シナリオ: Gemini/SDK側の詳細、設定不備、内部パスに近い情報がアプリ利用者へ露出する
- 修正: サーバーログには詳細、クライアントには固定文を返す

#### 🟢 確認済み

- `premium` / `aiCreditsUsed` / `partnerUid` のクライアント直書きはブロック済み
- callableは `request.auth` チェック済み
- RevenueCat Webhookはsecret検証後に処理している

---

### Agent 2: バグハンター / QA

#### 🔴 `post.tsx:202` AI同意保存失敗後もAI送信される

- 再現条件: 同意モーダルで同意 → `setAiConsentAcknowledged` または `refreshProfile` が失敗
- 影響: 同意状態が保存されていないのに `runAiRewrite()` が実行され、本文がAIへ送信される
- 修正案: `try/catch` にして成功時だけ `runAiRewrite()`

#### 🔴 `consult.tsx:108` AI同意保存失敗後も相談が送信される

- 再現条件: 同意モーダルで同意 → Firestore/Authエラー
- 影響: 同意未保存のまま `handleConsult()` が走り、相談文がAI送信される
- 修正案: `finally` で送信しない。保存成功後だけ `pendingSend` を消して送信

#### 🔴 `calendar.tsx:371` AI月次要約が同意確認なしで実行される

- 再現条件: `aiConsentAcknowledged !== true` のユーザーが「今月を要約」を押す
- 影響: 投稿本文が同意モーダルなしでAIへ送信される
- 修正案: 投稿/相談と同じ `AiConsentModal` ガードを追加

#### 🟡 主な重要バグ

- `hooks/useConsultSession.ts:157`: AI相談の二重送信でセッションが分岐する
- `app/(app)/post.tsx:142`: 保存ボタン連打で重複投稿される
- `app/(app)/post.tsx:169`: AIリライト結果が古い本文に対して反映される
- `app/(app)/calendar.tsx:209`: 初期ロード失敗で画面がスピナー固定になる
- `lib/db.ts:262`: パートナー投稿取得クエリがインデックス未作成で落ちる
- `app/(app)/index.tsx:192`: 気持ち読み解きが二重実行される

#### 🟢 軽微

- カスタム文案入力がAI失敗時に消える
- 不正なmoodパラメータで壊れた投稿を保存できる
- optional settingsにundefinedが混じるとFirestore書き込み失敗

---

### Agent 3: バックエンド

#### 🔴 `functions/src/ai-functions.ts:460` aiInterpret のキャッシュが権限確認より先に返る

- 問題: cache hit時に、ペア関係・投稿存在・shared可視性を確認せず返している
- リスク: shared → private後も、相手が古い解釈キャッシュを読める可能性
- 修正: 投稿取得と権限確認をcache lookupより前に移動。visibility変更時もcache削除

#### 🔴 `functions/src/shared.ts:17` AI関数に maxInstances / timeout のハード上限がない

- 問題: `AI_FUNCTION_OPTIONS` は `secrets/region/invoker` のみ
- リスク: 多アカウント攻撃やGemini遅延でCloud Runインスタンスと課金が膨らむ
- 修正: `maxInstances`、`timeoutSeconds`、Gemini呼び出しtimeout、Premium hard capを追加

#### 🟡 主な重要指摘

- `consultationSessions` の内容が未検証のままプロンプト化される
- `communicationStyle` / `partnerName` が未制限・未ラップでpromptに入る
- Gemini JSON parseの復旧・検証が薄い
- 招待コードの形式検証がない
- `unpairPartner` がサブコレクション全件読み＋単一batch
- 通知cooldownが競合に弱い
- RevenueCatイベント順序・重複への防御がない
- AI_DAILY_TOTAL_LIMITと実際の利用制限の見え方が不一致

#### 🟢 確認済み

- `consumeAiQuota` の同時実行制御は概ね問題なし
- `pairWithCode` は同時二重ペアリングを防げている
- public webhookは内部認証あり、Secret管理も適切

---

### Agent 4: フロントエンド

#### 🔴 `app/_layout.tsx:50` Auth guardが未認証時も保護画面を描画する

- 問題: redirectは `useEffect` 後に走るが、常に `<Slot />` を返している
- 影響: サインアウト直後や起動直後に `(app)` 画面の内容が一瞬見える可能性
- 修正案: `loading` 中はローダー、`!user && inApp` は `Redirect` または `null`

#### 🔴 `calendar.tsx:209` 初期ロード失敗で無限ローディングになり得る

- 問題: `load()` に `try/catch/finally` がなく、Firestore取得失敗時に `setLoading(false)` されない
- 影響: 画面が固まり、ユーザー向けエラーも出ない
- 修正案: `try/catch/finally` で囲み、Alertを出す

#### 🔴 `calendar.tsx:789` ログ一覧がScrollView + mapで全件描画

- 問題: `ScrollView` 内で `logRecords.map(renderRecord)`
- 影響: 100件超で初期描画・メモリ・スクロール性能が悪化
- 修正案: `FlatList` / `FlashList` に置換

#### 🟡 主な重要指摘

- お気に入りIDを無制限に `getDocs`
- パートナー投稿を月範囲なしで500件取得
- 月変更時に同じ取得が重複しやすい
- `CalendarScreen` に状態と責務が集中しすぎ
- Home初回ロード中に空/未連携状態が表示される
- 投稿操作の失敗がユーザーに返らない
- Paywallのオファリング取得にロード/失敗状態がない
- PaywallボトムシートがSafeAreaInsets未対応
- RevenueCat初期化がログイン後フローにない
- `any` と非null assertionが残っている

---

### Agent 5: リリース / App Store審査

#### 判定: HOLD

#### 🟢 Apple Sign in / アカウント削除

- Google Sign-inがあり、iOSではApple Sign-inも表示
- `app.json` も `usesAppleSignIn: true`
- アカウント削除UIとCloud Functionあり
- 推奨: `functions/src/account.ts` に `invoker: 'public'` 明示

#### 🔴 サブスクリプション / Paywall

- 価格、自動更新説明、復元ボタン、IAP購入導線はある
- ただし解約方法が明示不足
- PaywallとAI同意の法務リンクが `https://futakoto.app/...`

#### 🔴 Privacy / AI同意

- Privacy Manifestは設定済み
- 公開済みURLは確認済み
- モーダル内リンクが壊れた `futakoto.app`

#### 🔴 AI機能のSandbox動作

- `CONSULT_SCHEMA` とクライアント期待値が不一致
- AI相談が失敗する可能性が高い

#### 🟡 審査官用フロー

- ペアリングなしでもホームは落ちない
- ペアリング済みデモアカウントの準備はリポジトリから未確認
- App Review Notesに単独/ペア済みアカウント、AI機能、課金Sandbox説明を書く

#### 🟡 オフライン耐性

- `AuthProvider` の `ensureUserProfile()` 失敗時の挙動が未証明
- 機内モードで起動・投稿一覧・AI押下を確認する

---

### Agent 6: UX / ユーザビリティ

#### 😣 ログイン/初回: 次に何をすればいいかが薄い

- 現象: 登録後すぐホームに入り、使い方・ペアリング・自分だけ記録の安全性が説明されない
- 改善案: 初回ホームに「今の気分を書く / 招待コードでつながる / ふたりだけで見る」の小さなガイドを出す

#### 😣 パートナー連携: ペアリング手順が少し迷いやすい

- 現象: 「どちらか一人が入力すればよい」の理解が弱い
- 改善案: 「相手に送る」または「相手のコードを自分が入力」の2択として明示

#### 😣 投稿: 未連携でも「ふたりへ」がデフォルトなのは不安

- 現象: パートナー未連携でも共有範囲が `shared`
- 改善案: 未連携時は「自分のみ」を初期値にし、「つながるまでは相手に見えません」を表示

#### 😐 主な改善点

- 今日の空状態が行動につながりにくい
- パートナー未投稿表示が待ち圧になりうる
- 記録フローに日付/時間が割り込んで少し重い
- 保存成功の手応えがない
- AI相談の10ターン上限が到達まで気づきにくい
- エラー/空状態に復旧方法が残らない

#### 😊 良い点

- 自分/相手/公開範囲は判別しやすい
- ストリークは控えめで圧が低い
- AIリライトはユーザーの言葉を勝手に奪わない構成
- AI同意は送信される/されない内容が具体的

**UX総合評価: ★3/5**

体験の核は温かいが、初回導線、未連携時の安全感、保存成功/失敗時の手応えが弱い。

---

### Agent 7: アクセシビリティ

#### 🔴 `components/PaywallModal.tsx:91` 課金モーダルがVoiceOverのモーダルとして閉じていない

- 対象ユーザー: VoiceOverユーザー、課金導線を確認する審査担当
- 問題: `Modal` 内の背景要素へフォーカスが漏れる可能性。閉じるXもラベルなし
- 修正: `accessibilityViewIsModal`、`accessibilityRole`、`accessibilityLabel` を追加

#### 🔴 `lib/theme.ts:4` ブランド主色のコントラストが不足

- 対象ユーザー: 弱視ユーザー、屋外利用、高齢ユーザー
- 問題: `COLORS.primary #7B9E87` は白文字とのcontrastが約2.96:1
- 修正: CTA用途は `#5A7E68` などへ変更

#### 🔴 `app/login.tsx:97` TextInputがplaceholder依存

- 対象ユーザー: VoiceOverユーザー、認知負荷が高いユーザー
- 問題: 入力後にラベル文脈が失われる
- 修正: `accessibilityLabel` を付与

#### 🔴 `components/HomeMoodInput.tsx:53` ホームの気分絵文字ボタンが44pt未満

- 対象ユーザー: 片手操作、手指操作が不安定なユーザー
- 修正: `minHeight: 44`

#### 🔴 `app/(app)/index.tsx:295` 「気持ちを読み解く」ボタンのタップ領域が小さすぎる

- 対象ユーザー: 片手操作、高齢ユーザー
- 修正: `minHeight: 44`、`paddingHorizontal: 12`

#### 🟡 主な重要指摘

- 相談モーダルに `accessibilityViewIsModal` がない
- 投稿画面の小ボタン群が44pt未満
- 共有範囲の選択状態が色依存
- PaywallがDynamic Typeで縦あふれしやすい
- モーション設定をReduce Motionに連動していない
- 気分カラーが色覚差で近く見えやすい

**App Store審査で指摘されるリスク: 中**

---

### Agent 8: アナリティクス / 可観測性

#### 🔴 Firebase Analytics が本番iOSで実質no-opになる可能性

- 問題: `lib/analytics.ts` は `firebase/analytics` Web SDKを使用。React Nativeでは `isSupported()` がfalseになり、`analyticsInstance` がnullのままになり得る
- 影響: GA4に `login` / `entry_created` / 課金ファネル等が出ず、利用状況分析ができない
- 修正: `@react-native-firebase/analytics` などネイティブ対応SDKへ切替、またはPostHog等に送る。TestFlightでDebugView反映まで確認

#### 🔴 重要イベントの呼び出し漏れ

- 問題: `trackPairCompleted()` は定義のみ。`aiInterpret` / `aiSummary` 成功時も `trackAiFeatureUsed()` がない
- 影響: ペアリング成功率、読み解き/月次要約の利用率が分析できない
- 修正: `handlePair()` 成功後、`runInterpret()` 成功後、`handleAiSummary()` 成功後に計測

#### 🟡 主な重要指摘

- `ai_quota_exceeded` がrewrite以外で取れていない
- Apple / Googleログイン計測が不正確
- Sentry userが設定されていない
- Sentry / Analyticsセットアップ手順が弱い
- `paywall_shown` が二重計測される経路あり

#### 🟢 良い点

- `Sentry.init()` は `_layout.tsx` トップレベル
- DSNはenv
- `tracesSampleRate: 0.2`
- `entry_created` は `mood` / `visibility` 付き
- `paywall_shown` reason、`purchase_failed` errorあり

---

## App Store提出前チェックリスト

### 修正

- [ ] AI同意保存失敗時にAI送信しない
- [ ] 月次AI要約にAI同意モーダルを追加
- [ ] `aiConsult` schema不整合を修正
- [ ] `inviteCodes` のFirestore readを禁止
- [ ] `pairWithCode` に招待コード形式検証を追加
- [ ] `aiInterpret` のcache lookupを権限確認後に移動
- [ ] 投稿編集/visibility変更時に解釈cacheを削除
- [ ] 法務リンクを公開済みURLへ統一
- [ ] Paywallに解約方法を明記
- [ ] RevenueCat初期化をログイン後に実行
- [ ] Auth guardで未認証時に保護画面を描画しない
- [ ] カレンダー初期ロード失敗時の無限ローディングを修正
- [ ] Paywall / AI同意 / 相談モーダルにアクセシビリティ対応
- [ ] CTAコントラストを改善
- [ ] 主要タップ領域を44pt以上にする

### TestFlight検証

- [ ] 新規登録
- [ ] メールログイン
- [ ] Apple Sign in
- [ ] Google Sign in
- [ ] ペアなし状態でホーム/投稿/設定が落ちない
- [ ] ペアリング済みデモアカウントで相互投稿確認
- [ ] 投稿作成
- [ ] 投稿編集
- [ ] 投稿削除
- [ ] 公開範囲変更
- [ ] AIリライト
- [ ] AI相談
- [ ] 気持ち読み解き
- [ ] 月次AI要約
- [ ] AI無料枠超過時のPaywall
- [ ] Sandbox購入
- [ ] 購入復元
- [ ] 解約後挙動
- [ ] オフライン起動
- [ ] オフライン時AI押下
- [ ] アカウント削除

### App Review Notes

- [ ] 単独ログイン用アカウント
- [ ] ペアリング済みアカウント2つ
- [ ] ペアリング確認手順
- [ ] AI機能の確認手順
- [ ] Sandbox課金確認手順
- [ ] プライバシーポリシーURL
- [ ] サポートURL

---

## 最短の修正順

1. `aiConsult` schema修正
2. AI同意まわり修正
3. 法務リンクとPaywall文言修正
4. `inviteCodes` read禁止 + `pairWithCode`形式検証
5. `aiInterpret` cache権限確認順修正
6. Auth guard / calendar無限loading修正
7. RevenueCat初期化確認
8. アクセシビリティ赤項目修正
9. TestFlightでAI全機能 + IAP + オフライン確認
10. App Review Notes作成

---

## Codex側の最終所感

リリース直前レビューとして見ると、UIの温度感やAIリライトの思想はかなり良い。一方で、審査提出に必要な「同意・法務リンク・課金説明・実機検証」の詰めがまだ残っている。

最も危ないのは、ユーザーの感情テキストを扱うアプリで、同意保存失敗後もAI送信される点。ここは機能バグというより信頼の問題なので最優先で直す。

次に危ないのは `aiConsult` schema不整合。審査官がAI相談を触って落ちると、その時点で印象が悪くなる。まず主要機能が確実に動く状態に戻す。

この2つと法務リンクを潰せば、HOLDからGO候補に戻せる。そこから `inviteCodes` と `aiInterpret` cacheを直せば、セキュリティ面の大きな穴もかなり塞がる。
