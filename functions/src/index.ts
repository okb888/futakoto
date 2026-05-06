import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

admin.initializeApp();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODEL = 'gemini-2.5-flash';
const REGION = 'asia-northeast1';
const AI_FUNCTION_OPTIONS = {
  secrets: [GEMINI_API_KEY],
  region: REGION,
  invoker: 'public',
};
const db = admin.firestore();

function getModel() {
  const apiKey = GEMINI_API_KEY.value()
    .trim()
    .replace(/^GEMINI_API_KEY\s*=\s*/, '')
    .replace(/^["']|["']$/g, '');
  const ai = new GoogleGenerativeAI(apiKey);
  return ai.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: 'application/json' },
  });
}

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound?: 'default' | null;
  data?: Record<string, string>;
};

async function sendExpoPush(messages: ExpoPushMessage[]) {
  if (messages.length === 0) return;
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    throw new Error(`Expo Push API error: ${response.status}`);
  }
}

export const notifyPartnerOnSharedEntry = onDocumentCreated(
  {
    region: REGION,
    document: 'users/{authorUid}/entries/{entryId}',
  },
  async (event) => {
    const entry = event.data?.data();
    const authorUid = event.params.authorUid;
    const entryId = event.params.entryId;
    if (!entry || entry.visibility !== 'shared') return;

    const authorSnap = await db.doc(`users/${authorUid}`).get();
    const author = authorSnap.data();
    const partnerUid = author?.partnerUid;
    if (!partnerUid) return;

    const partnerRef = db.doc(`users/${partnerUid}`);
    const partnerSnap = await partnerRef.get();
    const partner = partnerSnap.data();
    if (!partner?.notificationSettings?.sharedPostNotificationsEnabled) return;

    const lastNotifiedAt = partner.notificationMeta?.lastSharedPostNotificationAt;
    if (lastNotifiedAt?.toMillis && Date.now() - lastNotifiedAt.toMillis() < 60 * 60 * 1000) {
      return;
    }

    const tokenSnap = await partnerRef.collection('pushTokens').get();
    const tokens = tokenSnap.docs
      .map((doc) => doc.data().token)
      .filter((token): token is string => (
        typeof token === 'string' &&
        (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken'))
      ));

    await sendExpoPush(tokens.map((token) => ({
      to: token,
      title: 'ふたこと',
      body: 'ふたりの記録に新しい投稿があります',
      sound: null,
      data: { kind: 'sharedEntry', entryId, authorUid },
    })));

    await partnerRef.set({
      notificationMeta: {
        lastSharedPostNotificationAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }, { merge: true });
  }
);

// ---- AI リライト: 気持ち → 伝わる文章 ----
export const aiRewrite = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { text, partnerName } = request.data as { text?: string; partnerName?: string };
    if (!text || text.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'テキストが必要です');
    }
    if (text.length > 1000) {
      throw new HttpsError('invalid-argument', 'テキストが長すぎます（1000文字以内）');
    }

    const partner = partnerName || 'パートナー';
    const prompt = `あなたは夫婦のコミュニケーション支援AIです。
以下のテキストは、ユーザーが${partner}に伝えたい気持ち・状況・お願いです。
単なる要約や言い換えではなく、まず言葉の裏にある意図・葛藤・自分なりの反省・相手に伝えたい目的を読み取ってください。
そのうえで、相手が受け取りやすく、でも本音や大事なニュアンスが薄まりすぎない文章に整えてください。

特に重要:
- 「本当はよくないと分かっている」「自分にも原因がある」「申し訳なさがある」「でもしんどい」のような自己認識・葛藤は削らない
- 事実、気持ち、自己認識、相手へのお願いを混ぜすぎず、自然な順番で伝える
- 相手を責める表現にはしないが、ユーザーの困りごとも消さない
- 元の文章にない謝罪・反省・お願いを勝手に強く足さない

このテキストを、以下の3パターンに書き直してください:
1. **気持ちを残す**: 元の葛藤や自己認識を残しながら、相手に伝わりやすくする
2. **具体的に**: 何があってどう感じたか、何を分かっているかが伝わる表現
3. **お願いにする**: 自己認識を残したうえで、「こうしてくれると助かる」に着地する表現

各案は120文字以内、自然な日本語で。説教・断定・過剰な謝罪にしないこと。

元のテキスト:
${text}

出力形式（JSON）:
{
  "understanding": {
    "coreFeeling": "ユーザーの中心にある気持ちを40文字以内で",
    "importantNuance": "削ってはいけない自己認識・葛藤・背景を60文字以内で",
    "messageGoal": "相手に伝える目的を40文字以内で"
  },
  "rewrites": [
    { "label": "気持ちを残す", "text": "..." },
    { "label": "具体的に", "text": "..." },
    { "label": "お願いにする", "text": "..." }
  ]
}`;

    try {
      const result = await getModel().generateContent(prompt);
      const json = JSON.parse(result.response.text());
      return json;
    } catch (e: any) {
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
    }
  }
);

// ---- AI 相談: 気持ちの整理 → 伝える文の下書き ----
export const aiConsult = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { text, partnerName, conversationHistory } = request.data as {
      text?: string;
      partnerName?: string;
      conversationHistory?: { role: 'user' | 'ai'; content: string }[];
    };
    if (!text || text.trim().length === 0) {
      throw new HttpsError('invalid-argument', '相談内容が必要です');
    }
    if (text.length > 2000) {
      throw new HttpsError('invalid-argument', '相談内容が長すぎます（2000文字以内）');
    }

    const partner = partnerName || 'パートナー';

    let historySection = '';
    if (conversationHistory && conversationHistory.length > 0) {
      historySection = '\n\n## これまでの会話\n' + conversationHistory
        .map((h) => `${h.role === 'user' ? 'ユーザー' : 'AI'}: ${h.content}`)
        .join('\n');
    }

    const prompt = `あなたは夫婦のコミュニケーション支援AIです。
ユーザーは、${partner}との関係の中で今困っていること・思っていること・伝えたいことを整理しようとしています。
決めつけず、ユーザーの本音を薄めすぎず、相手を責める表現にも寄せすぎないでください。${historySection}

## 今回のメッセージ
${text}

上記をもとに、次の2つを出力してください。${historySection ? '前の会話の流れを踏まえて深掘りしてください。' : ''}
1. reflection: ユーザーが自分の気持ちを整理できる短いメモ。200文字以内で、箇条書きではなく自然な文章で。
2. messageDraft: ${partner}に伝えるなら使えそうな文章。120文字以内。自然で、押し付けがましくない表現。

出力形式（JSON）:
{
  "reflection": "...",
  "messageDraft": "..."
}`;

    try {
      const result = await getModel().generateContent(prompt);
      const json = JSON.parse(result.response.text());
      return json;
    } catch (e: any) {
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
    }
  }
);

// ---- AI 意図の汲み取り: 相手の投稿の読み解き ----
export const aiInterpret = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { text, mood, partnerName } = request.data as {
      text?: string;
      mood?: number;
      partnerName?: string;
    };
    if (!text || text.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'テキストが必要です');
    }

    const partner = partnerName || 'パートナー';
    const moodLabel = ['', '😣つらい', '😔しんどい', '😐ふつう', '🙂まあまあ', '😊いい感じ'][mood ?? 3];
    const prompt = `あなたは夫婦のコミュニケーション支援AIです。
${partner}が以下の投稿をしました。気分は ${moodLabel} です。

この投稿の裏にある${partner}の気持ち・状態・してほしいことを、3つの可能性として読み解いてください。
押し付けず、「〜かもしれません」「〜の可能性があります」という柔らかい表現で。
それぞれ50文字以内。

投稿:
${text}

出力形式（JSON）:
{
  "interpretations": [
    "...",
    "...",
    "..."
  ]
}`;

    try {
      const result = await getModel().generateContent(prompt);
      const json = JSON.parse(result.response.text());
      return json;
    } catch (e: any) {
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
    }
  }
);

// ---- AI 月次要約 ----
export const aiSummary = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { entries, target, partnerName } = request.data as {
      entries?: { mood: number; memo: string }[];
      target?: 'me' | 'partner';
      partnerName?: string;
    };
    if (!entries || entries.length === 0) {
      throw new HttpsError('invalid-argument', '投稿データが必要です');
    }

    const partner = partnerName || 'パートナー';
    const summary = entries.map((e) => `[気分${e.mood}] ${e.memo}`).join('\n');

    const prompt = target === 'partner'
      ? `あなたは夫婦のコミュニケーション支援AIです。
以下は、${partner}がこの期間に書いた気持ちの記録です。
あなたはその「パートナー（ユーザー）」として、相手の記録を読んでいます。

このデータから、以下を300文字以内で出力してください:
- ${partner}がどんな気分の波の中にいたか
- ${partner}が嬉しかったこと・困っていたこと・気にしていること
- ユーザー（あなた）が気づいておきたいこと、接し方のヒント（やさしいトーンで）

重要:
- 記録に含まれる本音・葛藤を単なるノイズとして削らない
- 一方的な判断を下さず、「〜かもしれません」のトーンで
- ${partner}を批判・評価するまとめにしない

記録:
${summary}

出力形式（JSON）:
{
  "summary": "..."
}`
      : `あなたは夫婦のコミュニケーション支援AIです。
以下は、ユーザーがこの期間に書いた気持ちの記録です。

このデータから、以下を300文字以内で出力してください:
- どんな気分の波があったか
- 共通するテーマや状況
- ユーザー自身が分かっていること・葛藤していること・反省していること
- 次に意識するといいこと（やさしいトーンで）

重要:
- 投稿に含まれる自己認識や葛藤を、単なるノイズとして削らない
- 「本人も分かっているけど難しい」というニュアンスを尊重する
- 相手やユーザーのどちらかを一方的に責めるまとめにしない

記録:
${summary}

出力形式（JSON）:
{
  "summary": "..."
}`;

    try {
      const result = await getModel().generateContent(prompt);
      const json = JSON.parse(result.response.text());
      return json;
    } catch (e: any) {
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
    }
  }
);
