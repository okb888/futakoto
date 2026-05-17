# TestFlight 実機フィードバック 2026-05-16

実機テスト（TestFlight）で確認された違和感・バグ・改善要望の整理と具体的な修正案。  
スクショ: `docs/INBOX/5.16_実機テストの違和感/`

---

## A-1. ホーム入力フォームの機能欠落

**問題**  
ホーム画面の入力フォーム（HomeMoodInput）が劣化している。
- `placeholder="ひとことメモ（任意）"` → 不可。「パートナーに伝えたいこと（任意）」に変更
- 気分選択後に展開されるフォームに日付・AIで整える・共有範囲が出てこない

**対象ファイル**  
- `components/HomeMoodInput.tsx`
- `app/(app)/post.tsx`（mood パラメータ追加）

**修正案**  
ホームでの気分選択 → `post.tsx` へ mood を渡してナビゲートする方式に変更する。  
`HomeMoodInput` はシンプルな気分選択UIのみ残し、選択後に `post.tsx?mood=X` へ遷移。  
`post.tsx` 側で `mood` URLパラメータを受け取って初期選択状態にする。

```diff
// app/(app)/post.tsx
- const params = useLocalSearchParams<{ memo?: string; entryId?: string; sourceConsultationSessionId?: string }>();
+ const params = useLocalSearchParams<{ memo?: string; entryId?: string; sourceConsultationSessionId?: string; mood?: string }>();

// useEffect で mood パラメータを初期値に反映
+ useEffect(() => {
+   if (!isEditing && params.mood) {
+     setMood(Number(params.mood));
+   }
+ }, [isEditing, params.mood]);
```

```diff
// components/HomeMoodInput.tsx
- // mood選択後にインラインフォーム展開
+ // mood選択後に post.tsx へ遷移
+ import { useRouter } from 'expo-router';
+ const router = useRouter();

  function handleSelectMood(score: number) {
-   animateNext();
-   setSelectedMood(score);
+   router.push(`/(app)/post?mood=${score}`);
  }
```

> ヒント: インライン展開を残したい場合は visibility トグルと「詳しく記録する→」リンクだけ HomeMoodInput に追加する中間案もある。

---

## A-2. 整理メモが空白のまま出力されない

**問題**  
相談タブの壁打ち後、「整理メモ」カードが空欄になる。  
AIの返答（`turn.reflection`）が空文字列または undefined になっている。

**原因推定**  
`functions/src/ai-functions.ts:315` で Gemini のレスポンスを `JSON.parse` する際、  
モデルが JSON の前後にマークダウンのコードフェンス（` ```json ... ``` `）を付けた場合にパースが失敗し、  
catch ブロックで HttpsError を throw → クライアントがエラーを受け取らず `reply: undefined` になる経路がある可能性。  
または `json.reply` が空文字列で返るケース。

**対象ファイル**  
- `functions/src/ai-functions.ts:313-319`（aiConsult の try ブロック）
- `app/(app)/consult.tsx:157-159`（整理メモ表示）

**修正案**

```diff
// functions/src/ai-functions.ts
    try {
      const result = await getModel('consult').generateContent(prompt);
-     const json = JSON.parse(result.response.text());
-     return { reply: json.reply };
+     const raw = result.response.text().trim();
+     // コードフェンスを除去してからパース
+     const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
+     const json = JSON.parse(cleaned);
+     if (!json.reply) throw new Error('reply フィールドが空です');
+     return { reply: json.reply as string };
    } catch (e: any) {
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
    }
```

**副次的な文言変更**  
`app/(app)/consult.tsx:500`  
「AIがまとめた内容を確認・編集」→「会話をAIが要約しました（編集できます）」

```diff
// app/(app)/consult.tsx:500
- {draftSummary ? 'AIがまとめた内容を確認・編集' : '伝えたいことを自由に指定'}
+ {draftSummary ? '会話をAIが要約しました（編集できます）' : '伝えたいことを自由に指定'}
```

---

## A-3. キーボード表示で入力欄・コンテンツが隠れる（複数箇所）

### A-3a. 設定 > AIアシスタント画面

**問題**  
`settings/ai.tsx` の TextInput にフォーカスすると、キーボードが出てペルソナ選択肢が隠れる。

**対象ファイル**: `app/(app)/settings/ai.tsx:54-55`

```diff
- return (
-   <ScrollView style={styles.container} contentContainerStyle={styles.content}>
+ return (
+   <KeyboardAvoidingView
+     style={{ flex: 1 }}
+     behavior={Platform.OS === 'ios' ? 'padding' : undefined}
+   >
+   <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    {/* ... */}
+   </ScrollView>
+   </KeyboardAvoidingView>
  );
```

import 追加: `KeyboardAvoidingView, Platform` を `react-native` からインポート

### A-3b. 相談タブの「伝え方を選ぶ」モーダル

**問題**  
`consult.tsx` の Modal 内 TextInput にフォーカスするとキーボードがモーダルを隠す。

**対象ファイル**: `app/(app)/consult.tsx:465`（optionsSheet の View）

```diff
- <View style={styles.optionsSheet}>
+ <KeyboardAvoidingView
+   behavior={Platform.OS === 'ios' ? 'padding' : undefined}
+   style={styles.optionsSheet}
+ >
  {/* ... */}
- </View>
+ </KeyboardAvoidingView>
```

または `optionsSheet` 内の下部コンテンツを `ScrollView` でラップして、キーボード表示時にスクロールできるようにする。

---

## B-1. 日本語入力の変換候補アンダーライン（IME underline）が表示されない

**問題**  
TextInput でかな入力の変換候補時に通常 iOS で見えるアンダーラインが表示されない。

**原因推定**  
React Native の controlled TextInput（`value` + `onChangeText`）と iOS IME の相性問題。  
フォントや `textAlignVertical: 'top'`（Android 向けプロパティ）の混在が干渉している可能性。

**対象ファイル**  
- `components/HomeMoodInput.tsx:89-97`
- `app/(app)/post.tsx:360-371`
- `app/(app)/consult.tsx:307-320`

**修正案（試行的）**

```diff
// 各 TextInput に以下を追加
  <TextInput
+   autoCorrect={false}
+   spellCheck={false}
    value={memo}
    onChangeText={setMemo}
    multiline
    // ...
  />
```

> 注意: React Native の multiline TextInput と iOS IME のアンダーラインは完全な再現が難しい既知の問題。上記で改善しなければ `react-native-keyboard-controller` 等のライブラリ導入を検討。

---

## C-1. パートナーの呼び方設定

**要望**  
設定でパートナーの呼び方（例: 妻・夫・◯◯・ちゃん付け 等）を登録し、  
AIリライトや壁打ちの生成文に反映させる。「君のことが」→「◯◯のことが」

**対象ファイル**  
- `lib/db.ts`（UserProfile 型 + 更新関数）
- `app/(app)/settings/partner.tsx`（入力UI追加）
- `app/(app)/post.tsx:129-133`（partnerCallName 優先使用）
- `hooks/useConsultSession.ts:122-126`（同上）

**修正案**

```diff
// lib/db.ts - UserProfile 型に追加
  export type UserProfile = {
    // ...
+   partnerCallName?: string;
  };

// lib/db.ts - 更新関数追加
+ export async function updatePartnerCallName(uid: string, name: string) {
+   await db.collection('users').doc(uid).update({ partnerCallName: name });
+ }
```

```diff
// app/(app)/settings/partner.tsx（呼び方入力欄を追加）
// 既存の設定項目に "パートナーの呼び方" テキスト入力を追加（8文字以内推奨）
```

```diff
// app/(app)/post.tsx:129-133
  if (p?.partnerUid) {
    const pp = await getUserProfile(p.partnerUid);
-   if (pp) setPartnerName(getPartnerDisplayName(pp));
+   if (pp) setPartnerName(p.partnerCallName || getPartnerDisplayName(pp));
  }
```

```diff
// hooks/useConsultSession.ts:122-126
  if (profile.partnerUid) {
    const partner = await getUserProfile(profile.partnerUid);
-   if (partner) setPartnerName(getPartnerDisplayName(partner));
+   if (partner) setPartnerName(profile.partnerCallName || getPartnerDisplayName(partner));
  }
```

> AIプロンプト内の `partner` 変数がすでに `partnerName` を使っているため、上記の変更だけで AI 生成文にも自動反映される。

---

## C-3. ログイン画面の整理（Google/Apple ファーストに変更）

**要望**  
- Google・Apple を主ログイン手段にする
- メールアドレス+パスワードは廃止検討（セキュリティリスク）
- ボタン文言を「〜ではじめる」にする

**対象ファイル**: `app/login.tsx`

**修正案**

```diff
// Google ボタンの文言変更（login.tsx:175付近）
- <Text style={styles.googleButtonText}>Googleでログイン</Text>
+ <Text style={styles.googleButtonText}>Googleではじめる</Text>
```

Apple ボタンの buttonType を `CONTINUE` に変更（"Continue with Apple" 表示になる）:
```diff
- buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
+ buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
```

**メール+PW廃止について**  
既存のメール+PWユーザーがいる場合は削除不可。  
対応案：
1. UI上から EmailInput/PasswordInput を非表示にする（内部的には残す）
2. 「別の方法でログイン」折りたたみセクションに移動する
3. 完全廃止（新規ユーザーのみの段階なら問題なし）

---

## 対応優先順位

| 優先度 | 番号 | 内容 | 難度 |
|--------|------|------|------|
| 即対応 | A-1 | ホームフォーム機能復元 + 文言 | 中 |
| 即対応 | A-2 | 整理メモ空白バグ + 文言 | 小 |
| 即対応 | A-3a | 設定画面キーボード | 小 |
| 即対応 | A-3b | モーダルキーボード | 小 |
| 対応推奨 | B-1 | IME変換アンダーライン | 中〜大（既知問題） |
| 対応推奨 | C-1 | パートナーの呼び方設定 | 中 |
| 時期検討 | C-3 | ログイン方法整理 | 小〜中 |
