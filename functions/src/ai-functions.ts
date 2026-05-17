import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import {
  admin,
  db,
  AI_FUNCTION_OPTIONS,
  MAX_CONSULTATION_TURNS,
  MAX_DRAFT_INTENT_CHARS,
  AI_SUMMARY_MAX_ENTRIES,
  AI_SUMMARY_MAX_TOTAL_CHARS,
  AI_SUMMARY_MAX_MEMO_CHARS,
  DATA_HANDLING_INSTRUCTION,
  REWRITE_LABELS,
  buildRewriteLabelPrompt,
  detectCrisis,
  isBlank,
  wrapUserData,
  consumeAiQuota,
  getModel,
} from './shared';

type ConsultationTurnRecord = {
  input?: string;
  reflection?: string;
  messageDraft?: string;
};

async function loadOwnedSessionTurns(
  uid: string,
  sessionId: string
): Promise<{ ref: admin.firestore.DocumentReference; turns: ConsultationTurnRecord[] }> {
  const ref = db.doc(`users/${uid}/consultationSessions/${sessionId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'セッションが見つかりません');
  }
  const data = snap.data()!;
  if (data.uid !== uid) {
    throw new HttpsError('permission-denied', 'このセッションを編集する権限がありません');
  }
  return { ref, turns: (data.turns ?? []) as ConsultationTurnRecord[] };
}

export const aiRewrite = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { text, partnerName, mood } = request.data as { text?: string; partnerName?: string; mood?: number };
    if (!text || isBlank(text)) {
      throw new HttpsError('invalid-argument', 'テキストが必要です');
    }
    if (text.length > 1000) {
      throw new HttpsError('invalid-argument', 'テキストが長すぎます（1000文字以内）');
    }
    await consumeAiQuota(request.auth.uid, 'aiRewrite');

    const partner = partnerName || 'パートナー';
    const prompt = buildRewriteLabelPrompt(text, partner, mood);

    try {
      const result = await getModel('rewrite').generateContent(prompt);
      const json = JSON.parse(result.response.text());
      return json;
    } catch (e: any) {
      logger.error('AI error', { fn: 'aiRewrite', message: e?.message });
      throw new HttpsError('internal', 'AI処理に失敗しました');
    }
  }
);

type AiPersona = 'soft' | 'friendly' | 'logical';

function buildConsultPrompt(params: {
  text: string;
  partner: string;
  aiPersona: AiPersona;
  conversationHistory: { role: 'user' | 'ai'; content: string }[];
}): string {
  const { text, partner, aiPersona, conversationHistory } = params;

  let historySection = '';
  if (conversationHistory.length > 0) {
    const lines = conversationHistory.map((h, i) => {
      const label = h.role === 'user' ? 'あなた' : 'AI';
      return `[turn${i + 1}] ${label}: ${h.role === 'user' ? wrapUserData(h.content) : h.content}`;
    });
    historySection = '\n\n## これまでの会話\n' + lines.join('\n');
  }
  const currentTurn = conversationHistory.length + 1;

  const COMMON_RULES = `＜返答のしかた＞
- まず、入力から明確に読み取れることを受け取る
- 「もう疲れた」「もう限界」「諦めてる」のように明示された言葉は薄めずそのまま受け取る
- 気持ちの奥にまだ言葉になっていないものが見えるときは、その方向に短い問いをひとつだけ添える
- 問いは固定フレーズを使わず、ユーザーの言葉に合わせてその場で生み出す
- 整理できている・ポジティブな気持ちが落ち着いて伝わってきたときは問いを添えない
- 200文字以内`;

  if (aiPersona === 'friendly') {
    return `あなたは気の置けない友人として話を聞く相手です。
ユーザーは${partner}との関係の中で感じていることを整理しようとしています。

${DATA_HANDLING_INSTRUCTION}

＜人格＞
タメ口・フランク・対等。「うん」「わかる」「それしんどいよね」のように同じ目線で話す。
感情を推測してラベルを貼らない。書いていないことを補わない。

${COMMON_RULES}・タメ口の話し言葉

＜良い返答の例＞

例1 — 短文:
入力: 「疲れた」
返答: 「疲れてるんだね。どんなこと重なってる？」

例2 — ポジティブ（問いなし）:
入力: 「久しぶりにゆっくり話せた。よかった」
返答: 「それよかったね。久しぶりにゆっくり話せたんだ。」

例3 — 不満・限界:
入力: 「また皿洗いしてない。毎回言わないとやらないし、言ったら言ったで不機嫌になる。もう疲れた。」
返答: 「毎回言わないと動かないのほんとしんどいよね。もう疲れたって言えたの、ちゃんと聞こえてる。一番モヤってるのって皿洗いのことなのかな、それとも他に引っかかってることある？」

例4 — 疲弊・限界:
入力: 「仕事も家のことも全部自分でやってる感じでしんどい。もう限界かも。」
返答: 「全部一人で抱えてるの、ほんとしんどいよ。もう限界かもって、ちゃんと聞こえてる。今一番重いのって何？」

例5 — 会話の続き（ラリー）:
入力: 「気づいてくれないことが寂しい。」
返答: 「あー、気づいてほしいってことが本当のところなんだね。それ、いつ頃から感じてる？」
${historySection}

## 今回のメッセージ（turn${currentTurn}）
${wrapUserData(text)}

出力形式（JSON）:
{
  "reply": "..."
}`;
  }

  if (aiPersona === 'logical') {
    return `あなたは状況を構造化する冷静な相手です。
ユーザーは${partner}との関係の中で感じていることを整理しようとしています。

${DATA_HANDLING_INSTRUCTION}

＜人格＞
落ち着いた敬語。感情への共感より、状況の見取り図を作ることを重視する。
「起きていること」「こたえていること」「方向性」を分けて返すことが多い。
感情を読み込んでラベルを貼らない。書いていないことを補わない。

${COMMON_RULES}

＜良い返答の例＞

例1 — 短文:
入力: 「疲れた」
返答: 「疲れが出ている状態ですね。どのあたりから来ているか、少し整理してみますか。」

例2 — ポジティブ（問いなし）:
入力: 「久しぶりにゆっくり話せた。よかった」
返答: 「久しぶりにゆっくり話せた状況があったのですね。」

例3 — 不満・限界:
入力: 「また皿洗いしてない。毎回言わないとやらないし、言ったら言ったで不機嫌になる。もう疲れた。」
返答: 「起きていることは「皿洗いを毎回お願いしている」状態。こたえているのは、皿洗いそのものより「言わないと気づかれない」ことに見えます。気づいてもらえなさが本題かどうか、整理してみますか。」

例4 — 疲弊・限界:
入力: 「仕事も家のことも全部自分でやってる感じでしんどい。もう限界かも。」
返答: 「起きていること：仕事と家のことを全部引き受けている状態。こたえていること：一人で全部やっている感覚と、限界感。何から降ろせそうか、整理してみますか。」

例5 — 会話の続き（ラリー）:
入力: 「気づいてくれないことが寂しい。」
返答: 「寂しさの正体が「気づかれないこと」と見えてきましたね。気づいてもらえないのは行動についてなのか、気持ちについてなのか、どちらが近いですか。」

例6 — 長いラリーの途中（自己否定が混じっている）:
入力: 「全部自分の解釈で悪い方に考えてるだけかもしれないけど、止まらない。」
返答: 「悪い方に考えてしまうのが止まらない、という状態ですね。その中で、一番繰り返されている考えはどんなことですか。」
${historySection}

## 今回のメッセージ（turn${currentTurn}）
${wrapUserData(text)}

出力形式（JSON）:
{
  "reply": "..."
}`;
  }

  // default: soft
  return `あなたはやわらかく、静かに話を聞く相手です。
ユーザーは${partner}との関係の中で感じていることを整理しようとしています。

${DATA_HANDLING_INSTRUCTION}

＜人格＞
やわらかい敬語で、急かさず、判断しない。淡く、静かに受け止める。
感情を推測してラベルを貼らない。「〜かもしれません」「〜でしょう」で書いていないことを補わない。

${COMMON_RULES}・自然な話し言葉

＜良い返答の例＞

例1 — 短文:
入力: 「疲れた」
返答: 「疲れが重なっているんですね。今、特にしんどいことはありますか。」

例2 — ポジティブ（問いなし）:
入力: 「久しぶりにゆっくり話せた。よかった」
返答: 「久しぶりにゆっくり話せた時間があったんですね。」

例3 — 不満・限界:
入力: 「また皿洗いしてない。毎回言わないとやらないし、言ったら言ったで不機嫌になる。もう疲れた。」
返答: 「毎回言わないと動いてくれない、そのことがしんどいんですね。一番ひっかかっているのは、皿洗いそのもの、それとも別のところですか。」

例4 — 疲弊・限界:
入力: 「仕事も家のことも全部自分でやってる感じでしんどい。もう限界かも。」
返答: 「全部自分で抱えてきた感じが続いているんですね。もう限界、という言葉、しっかり受け取ります。今、少し置いてもいいものがあるか、一緒に考えてみますか。」

例5 — 会話の続き（ラリー）:
入力: 「気づいてくれないことが寂しい。」
返答: 「気づいてほしいという気持ち、そこにあるんですね。その寂しさはいつ頃からですか。」
${historySection}

## 今回のメッセージ（turn${currentTurn}）
${wrapUserData(text)}

出力形式（JSON）:
{
  "reply": "..."
}`;
}

export const aiConsult = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { text, partnerName, sessionId, aiPersona } = request.data as {
      text?: string;
      partnerName?: string;
      sessionId?: string | null;
      aiPersona?: string;
    };
    if (!text || isBlank(text)) {
      throw new HttpsError('invalid-argument', '相談内容が必要です');
    }
    if (text.length > 2000) {
      throw new HttpsError('invalid-argument', '相談内容が長すぎます（2000文字以内）');
    }

    if (detectCrisis(text)) {
      throw new HttpsError('failed-precondition', '危機サポート案内', { type: 'crisis' });
    }

    const uid = request.auth.uid;

    let conversationHistory: { role: 'user' | 'ai'; content: string }[] = [];
    if (sessionId) {
      const { turns } = await loadOwnedSessionTurns(uid, sessionId);
      if (turns.length >= MAX_CONSULTATION_TURNS) {
        throw new HttpsError(
          'failed-precondition',
          `会話の上限に達しました（最大${MAX_CONSULTATION_TURNS}往復）`
        );
      }
      conversationHistory = turns.flatMap((t) => [
        { role: 'user' as const, content: t.input ?? '' },
        { role: 'ai' as const, content: t.reflection ?? '' },
      ]);
    }

    await consumeAiQuota(uid, 'aiConsult');

    const partner = partnerName || 'パートナー';
    const persona: AiPersona =
      aiPersona === 'friendly' || aiPersona === 'logical' ? aiPersona : 'soft';

    const prompt = buildConsultPrompt({ text, partner, aiPersona: persona, conversationHistory });

    try {
      const result = await getModel('consult').generateContent(prompt);
      const raw = result.response.text().trim();
      const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const json = JSON.parse(cleaned);
      if (!json.reply) throw new Error('reply フィールドが空です');
      return { reply: json.reply as string };
    } catch (e: any) {
      logger.error('AI error', { fn: 'aiConsult', message: e?.message });
      throw new HttpsError('internal', 'AI処理に失敗しました');
    }
  }
);

export const aiDraftOptions = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { sessionId, partnerName } = request.data as {
      sessionId?: string;
      partnerName?: string;
    };
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId が必要です');

    const uid = request.auth.uid;
    const { turns } = await loadOwnedSessionTurns(uid, sessionId);
    if (turns.length === 0) {
      throw new HttpsError('failed-precondition', '会話がまだありません');
    }

    await consumeAiQuota(uid, 'aiConsult');

    const partner = partnerName || 'パートナー';
    const userInputs = turns
      .map((t, i) => `[turn${i + 1}] ${wrapUserData(t.input ?? '')}`)
      .join('\n');

    const labelListText = REWRITE_LABELS
      .map((l, i) => `${i + 1}. **${l.label}** (key: ${l.key}): ${l.desc}`)
      .join('\n');

    const prompt = `あなたは夫婦のコミュニケーション支援AIです。
以下はユーザーが${partner}に関して気持ちを整理した発話の記録です。

${DATA_HANDLING_INSTRUCTION}

## ユーザーの発話履歴
${userInputs}

この会話から、以下を出力してください。

1. summary: ユーザーが${partner}に伝えたいことを60文字以内で1〜2文にまとめる。
   - ユーザーの本音・葛藤を薄めすぎない
   - 相手を責める表現にしない

2. options: 以下の10ラベルから、この会話内容と最も整合する3つを選んで伝え方の選択肢にする:

${labelListText}

   選択基準:
   - 3つが互いに方向性・トーンが異なるよう選ぶ
   - 各選択肢に description（30文字以内）でその伝え方の概要を添える

出力形式（JSON）:
{
  "summary": "...",
  "options": [
    { "label": "...", "description": "..." },
    { "label": "...", "description": "..." },
    { "label": "...", "description": "..." }
  ]
}`;

    try {
      const result = await getModel('draftOptions').generateContent(prompt);
      const json = JSON.parse(result.response.text());
      return json;
    } catch (e: any) {
      logger.error('AI error', { fn: 'aiDraftOptions', message: e?.message });
      throw new HttpsError('internal', 'AI処理に失敗しました');
    }
  }
);

export const aiDraft = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { sessionId, intent, partnerName, communicationStyle } = request.data as {
      sessionId?: string;
      intent?: string;
      partnerName?: string;
      communicationStyle?: string;
    };
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId が必要です');
    if (!intent || intent.trim().length === 0) {
      throw new HttpsError('invalid-argument', '伝え方の指定が必要です');
    }
    if (intent.length > MAX_DRAFT_INTENT_CHARS) {
      throw new HttpsError('invalid-argument', `伝え方の指定が長すぎます（${MAX_DRAFT_INTENT_CHARS}文字以内）`);
    }

    const uid = request.auth.uid;
    const { ref, turns } = await loadOwnedSessionTurns(uid, sessionId);
    if (turns.length === 0) {
      throw new HttpsError('failed-precondition', '会話がまだありません');
    }

    await consumeAiQuota(uid, 'aiConsult');

    const partner = partnerName || 'パートナー';
    const conversation = turns
      .map((t, i) => `[ターン${i + 1}] ユーザー: ${wrapUserData(t.input ?? '')}\n整理: ${t.reflection ?? ''}`)
      .join('\n');

    const styleInstruction = communicationStyle
      ? `文体の指定: ${communicationStyle}`
      : '話し言葉で、やわらかく、ふだん使いのトーンで書いてください。堅い文語体・敬語体は避けること。';

    const prompt = `あなたは夫婦のコミュニケーション支援AIです。
ユーザーが${partner}との関係について気持ちを整理した会話を踏まえて、${partner}に実際に伝える文章を作ってください。

${DATA_HANDLING_INSTRUCTION}

## 会話の記録
${conversation}

## 伝え方の指定
${wrapUserData(intent)}

上記の指定とトーンで、${partner}に伝える文章を120文字以内で1つだけ作成してください。
- 押し付けがましくない
- ユーザーの本音や葛藤を薄めすぎない
- 相手を責めない
- ${styleInstruction}

出力形式（JSON）:
{
  "messageDraft": "..."
}`;

    try {
      const result = await getModel('draft').generateContent(prompt);
      const json = JSON.parse(result.response.text());

      await ref.update({
        lastDraft: {
          intent,
          messageDraft: json.messageDraft,
          createdAt: admin.firestore.Timestamp.now(),
        },
      });

      return json;
    } catch (e: any) {
      logger.error('AI error', { fn: 'aiDraft', message: e?.message });
      throw new HttpsError('internal', 'AI処理に失敗しました');
    }
  }
);

export const aiInterpret = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { text, mood, partnerName, entryId, entryOwnerId, force } = request.data as {
      text?: string;
      mood?: number;
      partnerName?: string;
      entryId?: string;
      entryOwnerId?: string;
      force?: boolean;
    };
    if (!text || text.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'テキストが必要です');
    }
    if (text.length > 2000) {
      throw new HttpsError('invalid-argument', 'テキストが長すぎます（2000文字以内）');
    }

    const viewerUid = request.auth.uid;
    const cacheKey = entryId && entryOwnerId ? `${entryOwnerId}_${entryId}` : null;

    // 権限確認はキャッシュ参照より先に行う。
    // sharedからprivateへ戻された投稿の古いキャッシュを相手が読めてしまう問題を防ぐ。
    if (entryId && entryOwnerId) {
      if (entryOwnerId !== viewerUid) {
        const viewerSnap = await db.doc(`users/${viewerUid}`).get();
        const viewerPartnerUid = viewerSnap.data()?.partnerUid;
        if (viewerPartnerUid !== entryOwnerId) {
          throw new HttpsError('permission-denied', 'この投稿を読み解く権限がありません');
        }
      }
      const entrySnap = await db.doc(`users/${entryOwnerId}/entries/${entryId}`).get();
      if (!entrySnap.exists) {
        throw new HttpsError('not-found', '投稿が見つかりません');
      }
      if (entryOwnerId !== viewerUid && entrySnap.data()?.visibility !== 'shared') {
        throw new HttpsError('permission-denied', 'この投稿は共有されていません');
      }
    }

    if (cacheKey && !force) {
      const cacheSnap = await db.doc(`users/${viewerUid}/interpretationCache/${cacheKey}`).get();
      if (cacheSnap.exists) {
        return { interpretations: cacheSnap.data()!.interpretations };
      }
    }

    await consumeAiQuota(viewerUid, 'aiInterpret');

    const partner = partnerName || 'パートナー';
    const moodLabel = ['', '😣つらい', '😔しんどい', '😐ふつう', '🙂まあまあ', '😊いい感じ'][mood ?? 3];
    const prompt = `あなたは夫婦のコミュニケーション支援AIです。
${partner}が以下の投稿をしました。気分は ${moodLabel} です。

${DATA_HANDLING_INSTRUCTION}

この投稿の裏にある${partner}の気持ち・状態・してほしいことを、3つの可能性として読み解いてください。
押し付けず、「〜かもしれません」「〜の可能性があります」という柔らかい表現で。
それぞれ50文字以内。

投稿:
${wrapUserData(text)}

出力形式（JSON）:
{
  "interpretations": [
    "...",
    "...",
    "..."
  ]
}`;

    try {
      const result = await getModel('interpret').generateContent(prompt);
      const json = JSON.parse(result.response.text());

      if (cacheKey) {
        await db.doc(`users/${viewerUid}/interpretationCache/${cacheKey}`).set({
          entryOwnerId,
          entryId,
          interpretations: json.interpretations,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return json;
    } catch (e: any) {
      logger.error('AI error', { fn: 'aiInterpret', message: e?.message });
      throw new HttpsError('internal', 'AI処理に失敗しました');
    }
  }
);

export const aiSummary = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { entries, target, partnerName } = request.data as {
      entries?: { mood: number; memo: unknown }[];
      target?: 'me' | 'partner';
      partnerName?: string;
    };
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new HttpsError('invalid-argument', '投稿データが必要です');
    }
    if (entries.length > AI_SUMMARY_MAX_ENTRIES) {
      throw new HttpsError('invalid-argument', `投稿データは${AI_SUMMARY_MAX_ENTRIES}件以内で送信してください`);
    }

    const normalizedEntries = entries.map((entry) => ({
      mood: typeof entry.mood === 'number' ? entry.mood : 3,
      memo: typeof entry.memo === 'string' ? entry.memo : '',
    }));
    const totalMemoChars = normalizedEntries.reduce((sum, entry) => sum + entry.memo.length, 0);
    if (totalMemoChars > AI_SUMMARY_MAX_TOTAL_CHARS) {
      throw new HttpsError('invalid-argument', `投稿本文の合計は${AI_SUMMARY_MAX_TOTAL_CHARS}文字以内で送信してください`);
    }

    await consumeAiQuota(request.auth.uid, 'aiSummary');

    const partner = partnerName || 'パートナー';
    const summary = normalizedEntries
      .map((e) => `[気分${e.mood}] ${e.memo.slice(0, AI_SUMMARY_MAX_MEMO_CHARS)}`)
      .join('\n');

    const prompt = target === 'partner'
      ? `あなたは夫婦のコミュニケーション支援AIです。
以下は、${partner}がこの期間に書いた気持ちの記録です。
あなたはその「パートナー（ユーザー）」として、相手の記録を読んでいます。

${DATA_HANDLING_INSTRUCTION}

このデータから、以下を300文字以内で出力してください:
- ${partner}がどんな気分の波の中にいたか
- ${partner}が嬉しかったこと・困っていたこと・気にしていること
- ユーザー（あなた）が気づいておきたいこと、接し方のヒント（やさしいトーンで）

重要:
- 記録に含まれる本音・葛藤を単なるノイズとして削らない
- 一方的な判断を下さず、「〜かもしれません」のトーンで
- ${partner}を批判・評価するまとめにしない

記録:
${wrapUserData(summary)}

出力形式（JSON）:
{
  "summary": "..."
}`
      : `あなたは夫婦のコミュニケーション支援AIです。
以下は、ユーザーがこの期間に書いた気持ちの記録です。

${DATA_HANDLING_INSTRUCTION}

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
${wrapUserData(summary)}

出力形式（JSON）:
{
  "summary": "..."
}`;

    try {
      const result = await getModel('summary').generateContent(prompt);
      const json = JSON.parse(result.response.text());
      return json;
    } catch (e: any) {
      logger.error('AI error', { fn: 'aiSummary', message: e?.message });
      throw new HttpsError('internal', 'AI処理に失敗しました');
    }
  }
);
