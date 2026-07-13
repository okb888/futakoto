# ふたこと リリース前 修正計画

**作成**: 2026-05-17  
**対象**: Codex / Claude Code エージェント  
**背景**: コードベース全体調査（50件以上の落とし穴リサーチと実コード突合）で判明した対応必要項目を実装指示にまとめた。

---

## 読む前に必ず確認

- デザイン判断は `.design/system.md` を参照。色・トーンはここが唯一の真実。
- Firestore操作は必ず `try/catch` し、`Alert.alert` でユーザーにエラーを見せる。
- コメントは「なぜ」が自明でない場合のみ書く。

---

## 優先度別タスクリスト

| 優先度 | ID | タイトル | 対象ファイル |
|--------|-----|---------|------------|
| 🔴 緊急 | F1 | アカウント削除で `aiSummaries` が漏れる | `functions/src/account.ts` |
| 🔴 緊急 | F2 | 通知タップでホームにしか飛ばない（Deep Link未実装） | `app/_layout.tsx` |
| 🔴 緊急 | F3 | ログイン画面にプライバシーポリシー導線がない | `app/login.tsx` |
| 🟡 重要 | F4 | BILLING_ISSUE 発生時のアプリ内通知UIがない | `lib/db.ts` + `app/_layout.tsx` または `app/(app)/_layout.tsx` |
| 🟡 重要 | F5 | 評価依頼（レビューで応援）が未実装 | `app/(app)/settings/index.tsx` |
| 🟡 重要 | F6 | Apple/Google ユーザーのアカウント削除前に再認証を促す | `app/(app)/settings/account.tsx` |
| 🟡 重要 | F7 | カレンダーの月送りUIが「今月」と被る + スワイプ月替え未対応 | `app/(app)/calendar.tsx` |
| 🔴 緊急 | F8 | AI壁打ちで本文が空の返答カードが表示される | `app/(app)/consult.tsx` + `lib/ai.ts` + `functions/src/ai-functions.ts` |
| 🟡 重要 | F9 | 課金ステータスチップを課金ユーザーにも出してしまう | `components/AiQuotaChip.tsx` 付近 |

---

## F1: アカウント削除で `aiSummaries` が漏れる

### 問題

`functions/src/account.ts` の `subcollections` 配列に `aiSummaries` が含まれていない。Firestoreでは親ドキュメント削除でサブコレクションは自動削除されないため、削除済みユーザーのAIサマリーデータが孤立する。

### 修正箇所

**`functions/src/account.ts` の 42〜53行目あたり**

```ts
// 修正前
const subcollections = [
  'entries',
  'consultations',
  'consultationSessions',
  'favorites',
  'pushTokens',
  'aiUsage',
  'aiMonthlyUsage',
  'interpretationCache',
];

// 修正後
const subcollections = [
  'entries',
  'consultations',
  'consultationSessions',
  'favorites',
  'pushTokens',
  'aiUsage',
  'aiMonthlyUsage',
  'interpretationCache',
  'aiSummaries',
];
```

### デプロイ

```bash
cd ~/futakoto && firebase deploy --only functions:deleteAccount
```

---

## F2: 通知タップでホームにしか飛ばない（Deep Link未実装）

### 問題

`app/_layout.tsx` の `handleNotificationResponse()` で、パートナーの共有投稿通知をタップするとホーム（`/(app)/`）にしか遷移しない。`notifications.ts` から `data: { kind: 'sharedEntry', entryId, authorUid }` を送信しているが受信側がこれを無視している。

現在のコード（`app/_layout.tsx` 45〜48行目あたり）:

```ts
if (data.kind === 'sharedEntry') {
  router.push('/(app)/');  // entryId を使っていない
}
```

### 修正方針

`sharedEntry` 通知を受けたとき、ホーム画面に遷移しつつ `entryId` と `authorUid` を渡して対象エントリをハイライトする。ただし現状のホーム画面（`app/(app)/index.tsx`）はパラメータでエントリを特定するUIがないため、**まずホーム画面にフォーカスした上でエントリが見えるところへスクロールするシンプルな実装**を先行する。

#### ステップ1: `app/_layout.tsx` を修正

```ts
function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as Record<string, string> | undefined;
  if (!data) return;
  if (data.kind === 'sharedEntry') {
    // ホームに遷移。パラメータでエントリIDを渡す（ホーム側でハイライト）
    router.push({
      pathname: '/(app)/',
      params: { highlightEntryId: data.entryId ?? '', highlightAuthorUid: data.authorUid ?? '' },
    });
  } else if (data.kind === 'dailyReminder') {
    router.push('/(app)/post');
  }
}
```

#### ステップ2: `app/(app)/index.tsx` でパラメータを受け取る

`useLocalSearchParams` でパラメータを受け取り、対象エントリをハイライト表示する。ハイライトは「パートナーの今日の投稿カード」が画面に表示されているときに枠色を変えるか、ScrollViewを下方向にスクロールして目立たせる実装で十分。

```ts
// index.tsx の先頭付近に追加
import { useLocalSearchParams } from 'expo-router';

// HomeScreen 関数内
const { highlightEntryId, highlightAuthorUid } = useLocalSearchParams<{
  highlightEntryId?: string;
  highlightAuthorUid?: string;
}>();
```

パートナーのエントリカードに `highlighted` propを渡し、スタイルでボーダーを強調表示する（`.design/system.md` のカラートークンを使うこと）。ハイライトは3秒後に `useEffect` + `setTimeout` で自動解除する。

**注意**: `useLocalSearchParams` のパラメータはタブ再フォーカス時に残り続ける場合がある。`router.replace` ではなく `router.push` で遷移すること（ダブルタップ時に戻れるように）。

---

## F3: ログイン画面にプライバシーポリシー導線がない

### 問題

App Store審査担当者はログイン前にプライバシーポリシーを確認できることを要求する。現在の `app/login.tsx` にはプライバシーポリシー・利用規約へのリンクが一切ない。

### 修正箇所

`app/login.tsx` の最下部（送信ボタンの下）に以下を追加する。

#### 追加するUI（login.tsx）

```tsx
import { Linking } from 'react-native';

// ボタン群の下（ScrollView または KeyboardAvoidingView の末尾）に追加
<Text style={styles.legalNote}>
  ご利用をもって{' '}
  <Text
    style={styles.legalLink}
    onPress={() => Linking.openURL('https://futakoto.web.app/terms.html')}
  >
    利用規約
  </Text>
  {' '}および{' '}
  <Text
    style={styles.legalLink}
    onPress={() => Linking.openURL('https://futakoto.web.app/privacy.html')}
  >
    プライバシーポリシー
  </Text>
  {' '}に同意したものとみなします
</Text>
```

#### 追加するスタイル

```ts
legalNote: {
  fontSize: 11,
  color: COLORS.textMuted,
  textAlign: 'center',
  lineHeight: 17,
  marginTop: 16,
  paddingHorizontal: 24,
},
legalLink: {
  color: COLORS.primary,
  textDecorationLine: 'underline',
},
```

---

## F4: BILLING_ISSUE 発生時のアプリ内通知UIがない

### 問題

RevenueCat Webhook経由で課金失敗（`BILLING_ISSUE`）を受信すると、Firestoreの `users/{uid}.premiumState` が `'grace'` または `'billing_issue'` に更新される。しかしアプリ側でこれを読み取ってユーザーに知らせるUIがない。課金失敗したユーザーが気づかずサイレントチャーンする。

### 修正方針

アプリ起動時（またはフォアグラウンド復帰時）に `premiumState` を確認し、`'billing_issue'` の場合はバナーまたはAlertで支払い情報の更新を促す。

#### ステップ1: `lib/db.ts` に型を追加

既存の `UserProfile` 型に `premiumState` フィールドを追加する（すでにあれば不要）:

```ts
premiumState?: 'active' | 'cancelled' | 'grace' | 'billing_issue' | 'paused' | 'expired';
```

#### ステップ2: 通知バナーコンポーネントを作成

`components/BillingIssueBanner.tsx` を新規作成する。

```tsx
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { COLORS } from '../lib/theme';

type Props = { onDismiss: () => void };

export function BillingIssueBanner({ onDismiss }: Props) {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        決済に問題が発生しています。端末の「設定 → Apple ID → サブスクリプション」から支払い情報を更新してください。
      </Text>
      <TouchableOpacity onPress={onDismiss} style={styles.dismiss}>
        <Text style={styles.dismissText}>閉じる</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warningBorder,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  text: {
    fontSize: 12,
    color: COLORS.warningText,
    lineHeight: 18,
  },
  dismiss: { alignSelf: 'flex-end' },
  dismissText: { fontSize: 12, color: COLORS.warningText, fontWeight: '600' },
});
```

`COLORS.warningBg / warningBorder / warningText` が未定義の場合は `.design/system.md` を確認し、定義してから使う。定義がなければ以下を `.design/system.md` および `lib/theme.ts` に追記する:

```ts
warningBg: '#FFF8E1',
warningBorder: '#FFE082',
warningText: '#B8860B',
```

#### ステップ3: `app/(app)/_layout.tsx` でバナーを表示

タブナビゲーションのルートレイアウトで `premiumState` を監視し、`'billing_issue'` のときバナーを表示する。

```tsx
import { useAuth } from '../../lib/auth';
import { BillingIssueBanner } from '../../components/BillingIssueBanner';
import { useState } from 'react';

export default function AppLayout() {
  const { profile } = useAuth();
  const [billingDismissed, setBillingDismissed] = useState(false);
  const showBillingBanner =
    !billingDismissed && profile?.premiumState === 'billing_issue';

  return (
    <View style={{ flex: 1 }}>
      {showBillingBanner && (
        <BillingIssueBanner onDismiss={() => setBillingDismissed(true)} />
      )}
      <Tabs ... />
    </View>
  );
}
```

`app/(app)/_layout.tsx` の現在の構成を崩さないよう注意すること。

---

## F5: 評価依頼（レビューで応援）が未実装

### 問題

`app/(app)/settings/index.tsx` の「レビューで応援」行が `Alert.alert('正式リリース後にお願いします', ...)` というプレースホルダーになっている。App Store公開後に `expo-store-review` で実際の評価ダイアログを呼ぶべき。

### 修正箇所

#### `app/(app)/settings/index.tsx` を修正

```tsx
import * as StoreReview from 'expo-store-review';

// handleReview 関数を追加
async function handleReview() {
  const isAvailable = await StoreReview.isAvailableAsync();
  if (isAvailable) {
    await StoreReview.requestReview();
  } else {
    Alert.alert('レビューのお願い', 'App Storeで「ふたこと」を検索してレビューを書いていただけると嬉しいです。');
  }
}

// SettingRow の onPress を差し替え
<SettingRow
  icon={<Heart size={20} color={iconColor} weight="regular" />}
  label="レビューで応援"
  onPress={handleReview}
/>
```

#### パッケージインストール

```bash
cd ~/futakoto && npx expo install expo-store-review
```

**注意**: `StoreReview.requestReview()` はAppleの仕様上、年に3回しかダイアログが実際に出ない。設定画面からのタップは手動トリガーとして問題ない。

---

## F6: Apple/Google ユーザーのアカウント削除前に再認証を促す

### 問題

`app/(app)/settings/account.tsx` の `handleDeleteAccount()` では、メール/パスワードユーザーのみ再認証（`reauthenticateWithCredential`）している。Google/Appleユーザーはそのまま削除APIを呼んでいる。セッションが古い場合（1時間以上経過）、Firebase Auth側で `auth/requires-recent-login` エラーが発生し、ユーザーへのフィードバックなく失敗する可能性がある。

### 修正箇所

`app/(app)/settings/account.tsx` の `handleDeleteAccount` を修正する。

```tsx
async function handleDeleteAccount() {
  if (!user || loadingDelete) return;
  if (providerId === 'password' && !deleteModal.password.trim()) {
    Alert.alert('パスワードを入力してください');
    return;
  }
  setLoadingDelete(true);
  try {
    if (providerId === 'password') {
      const credential = EmailAuthProvider.credential(user.email!, deleteModal.password);
      await reauthenticateWithCredential(user, credential);
    } else if (providerId === 'google.com') {
      // Google ユーザーは再ログインして再認証
      const ok = await linkGoogleToCurrentUser();  // 既存のGoogle再認証フローを流用
      if (!ok) {
        Alert.alert('認証に失敗しました', 'もう一度お試しください');
        setLoadingDelete(false);
        return;
      }
    } else if (providerId === 'apple.com') {
      const ok = await linkAppleToCurrentUser();  // 既存のApple再認証フローを流用
      if (!ok) {
        Alert.alert('認証に失敗しました', 'もう一度お試しください');
        setLoadingDelete(false);
        return;
      }
    }
    await deleteAccount();
    await signOut(auth).catch(() => {});
  } catch (e: any) {
    const isWrongPassword =
      e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential';
    const isRecentLogin = e?.code === 'auth/requires-recent-login';
    Alert.alert(
      isWrongPassword ? 'パスワードが違います'
        : isRecentLogin ? '再ログインが必要です'
        : '削除に失敗しました',
      isWrongPassword ? 'もう一度確認してください'
        : isRecentLogin ? 'セキュリティのため、一度ログアウトして再度ログインしてから削除してください'
        : e.message
    );
    setLoadingDelete(false);
    setDeleteModal(d => ({ ...d, password: '' }));
  }
}
```

**注意**: `linkGoogleToCurrentUser` / `linkAppleToCurrentUser` は本来「連携」用の関数だが、再認証として流用できる。もしこれが意図しない副作用を起こす場合（例: すでに連携済みでエラー）は、Firebase の `reauthenticateWithPopup` / `reauthenticateWithRedirect` を使うか、単純に `auth/requires-recent-login` エラーを適切なメッセージで案内するだけでも可。

---

## F7: カレンダーの月送りUIが「今月」と被る + スワイプ月替え未対応

### 問題

`app/(app)/calendar.tsx` のカレンダー上部で、翌月遷移ボタンと「今月」表示が重なって見える。実機で月替えの操作性が悪いため、左右スワイプでも月を切り替えられるようにする。

### 修正方針

- 月ヘッダーは「前月」「年月ラベル/今月ボタン」「翌月」が必ず横幅内に収まるレイアウトへ整理する。
- 「今月」はボタンとして置く場合でも、翌月ボタンと同じ行で衝突しない固定幅または折り返し設計にする。
- `react-native-calendars` の `onMonthChange` / `current` の扱いを確認し、左右スワイプで月が変わる設定にする。
- 無料ユーザーの過去月ロック仕様がある場合、月自体は移動できるが記録内容はロックされる既存方針を維持する。

### 完了条件

- iPhone幅で翌月ボタンと「今月」が被らない。
- 左右スワイプで前月/翌月へ移動できる。
- ボタン操作とスワイプ操作で、選択月・AI要約キャッシュ・表示中の投稿リストがずれない。

---

## F8: AI壁打ちで本文が空の返答カードが表示される

### 問題

AI壁打ちで処理後のカード表示は出るが、本文が空になる。ユーザーには「返事が帰ってこない」状態に見えるため、リリース前に必ず直す。

### 確認ポイント

- `functions/src/ai-functions.ts` の `aiConsult` が `reflection` / `messageDraft` を空文字で返していないか。
- Gemini の JSON 解析失敗時や想定外キー返却時に、空文字へフォールバックしていないか。
- `lib/ai.ts` の callable ラッパーで戻り値のキー名が UI の期待と一致しているか。
- `app/(app)/consult.tsx` が `conversationHistory` 付き呼び出し後、最新ターンの `reflection` / `messageDraft` を正しくセットしているか。

### 修正方針

- AIから空レスポンスが返った場合は、空カードを表示せず Alert またはインラインエラーで「もう一度試してください」を出す。
- 関数側で空文字を正常扱いしない。JSON解析失敗や必須キー欠落は明示的にエラーにする。
- UI側でも `reflection.trim()` と `messageDraft.trim()` の両方が空なら成功扱いにしない。
- 相談タブはチャットUIに寄せず、既存の入力欄・AI整理カード・投稿転記ボタン構成を維持する。

### 完了条件

- AI壁打ち実行後、`reflection` と `messageDraft` の本文が表示される。
- 関数が空または不正なJSONを返した場合、空カードではなくエラー表示になる。
- 2ターン目以降でも会話履歴を渡しつつ本文が消えない。

---

## F9: 課金ステータスチップを課金ユーザーにも出してしまう

### 問題

無料ユーザー状態ではチップに「無課金」と表示され、タップすると「プレミアムを始める」の画面が出る。これは無料ユーザー向け導線としてはよいが、課金ユーザーにはこの表示やCTAは不要。

### 修正方針

- 無料ユーザー: AI残回数/無料状態のチップを表示し、タップで Paywall を開いてよい。
- 課金ユーザー: 不要な「無課金」チップや「プレミアムを始める」導線を表示しない。必要なら非タップの小さな Premium 表示に留める。
- `premiumExpiresAt` を含めた有効判定を使い、期限切れPremiumを課金ユーザー扱いにしない。

### 完了条件

- 無料ユーザーでは Paywall 導線が残る。
- 課金ユーザーでは不要なステータスチップ/Paywall CTA が出ない。
- 期限切れPremiumは無料ユーザーとして扱われる。

---

## 実装後の確認事項

| # | 確認内容 | 方法 |
|---|---------|------|
| F1 | アカウント削除時に `aiSummaries` が消えること | Firestore Consoleで削除後にサブコレクションがないことを確認 |
| F2 | パートナー投稿通知タップ→該当エントリがハイライトされること | Expo Goまたは実機でテスト |
| F3 | ログイン画面でリンクをタップしてブラウザが開くこと | 実機確認 |
| F4 | Firestoreで `premiumState: 'billing_issue'` にすると次回起動でバナーが出ること | Firestore Consoleから手動でフィールドを書き換えてテスト |
| F5 | 「レビューで応援」タップでダイアログが出るか、または適切なフォールバックが出ること | 実機確認（シミュレーターでは出ない場合あり） |
| F6 | Google/Appleユーザーが削除ダイアログから削除できること。古いセッションの場合に適切なエラーが出ること | テスト用Googleアカウントで確認 |
| F7 | カレンダーの月送りUIが被らず、左右スワイプでも月替えできること | iPhone幅の実機または Simulator で確認 |
| F8 | AI壁打ちの返答本文が表示され、空レスポンス時はエラーになること | 実機で1ターン目/2ターン目を確認。必要に応じて Functions ログ確認 |
| F9 | 無料ユーザーはPaywall導線あり、課金ユーザーは不要なチップ/CTAなし | Sandbox購入前後で確認 |

---

## Codexが実装しないこと（手動対応が必要な項目）

以下はコードではなく外部サービスの設定が必要なため、開発者（岡部さん）が対応する。

| # | 内容 | 対応先 |
|---|------|-------|
| M1 | **AI機能の開示申告（2025年新ルール）** | App Store Connect → アプリ情報 → AI機能の使用 |
| M2 | **デモアカウントの準備** | App Store Connect → App Review Information → Demo Account。ペアリング済みのメール+パスワードアカウントを2つ用意し記載 |
| M3 | **RevenueCat iOSキーをEASシークレットに設定** | `eas secret:create --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value <key>` |
| M4 | **Sentry DSNをEASシークレットに設定** | `eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value <dsn>` |
| M5 | **Firebase Analytics の measurementId を設定** | Firebase Console → Analytics → 測定IDを確認し `eas secret:create --name EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID --value <id>` |
| M6 | **App Storeのサブタイトルにキーワードを入れる** | App Store Connect → アプリ名の下の「サブタイトル」欄に「夫婦の気持ち共有」等を入力 |
| M7 | **App Storeの年齢制限を17+に設定** | App Store Connect → アプリ情報 → 年齢制限 |
| M8 | **Firestoreの定期バックアップ設定** | Firebase Console → Firestore → バックアップ → スケジュール設定（週次を推奨） |
| M9 | **プライバシーポリシーにSentry・RevenueCatの記載を確認** | `futakoto.web.app/privacy.html` を開いて、使用SDKの一覧とデータ送信先を確認・追記 |
| M10 | **Sandbox課金フルフロー検証** | M3完了後、RevenueCat Sandboxで 購入→更新→BILLING_ISSUE→EXPIRATION→Restore の流れを確認 |

---

## デプロイコマンド（実装完了後）

```bash
# Functions のみデプロイ（F1）
cd ~/futakoto && firebase deploy --only functions:deleteAccount

# フロントのビルドとTestFlight提出（F2〜F6実装後）
cd ~/futakoto && eas build --platform ios --profile preview

# 本番ビルド
cd ~/futakoto && eas build --platform ios --profile production
```
