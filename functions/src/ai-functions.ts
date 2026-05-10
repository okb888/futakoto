import { onCall, HttpsError } from 'firebase-functions/v2/https';
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
    const { text, partnerName } = request.data as { text?: string; partnerName?: string };
    if (!text || isBlank(text)) {
      throw new HttpsError('invalid-argument', 'テキストが必要です');
    }
    if (text.length > 1000) {
      throw new HttpsError('invalid-argument', 'テキストが長すぎます（1000文字以内）');
    }
    await consumeAiQuota(request.auth.uid, 'aiRewrite');

    const partner = partnerName || 'パートナー';
    const prompt = `あなたは夫婦のコミュニケーション支援AIです。
以下のテキストは、ユーザーが${partner}に伝えたい気持ち・状況・お願いです。
単なる要約や言い換えではなく、まず言葉の裏にある意図・葛藤・自分なりの反省・相手に伝えたい目的を読み取ってください。
そのうえで、相手が受け取りやすく、でも本音や大事なニュアンスが薄まりすぎない文章に整えてください。

${DATA_HANDLING_INSTRUCTION}

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
${wrapUserData(text)}

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
      const result = await getModel('rewrite').generateContent(prompt);
      const json = JSON.parse(result.response.text());
      return json;
    } catch (e: any) {
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
    }
  }
);

export const aiConsult = onCall(
  AI_FUNCTION_OPTIONS,
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const { text, partnerName, sessionId, communicationStyle } = request.data as {
      text?: string;
      partnerName?: string;
      sessionId?: string | null;
      communicationStyle?: string;
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

    let conversationHistory: string[] = [];
    if (sessionId) {
      const { turns } = await loadOwnedSessionTurns(uid, sessionId);
      if (turns.length >= MAX_CONSULTATION_TURNS) {
        throw new HttpsError(
          'failed-precondition',
          `会話の上限に達しました（最大${MAX_CONSULTATION_TURNS}往復）`
        );
      }
      conversationHistory = turns.map((t) => t.input ?? '');
    }

    await consumeAiQuota(uid, 'aiConsult');

    const partner = partnerName || 'パートナー';

    let historySection = '';
    if (conversationHistory.length > 0) {
      historySection = '\n\n## これまでのあなたの発話\n' +
        conversationHistory.map((content, i) => `[turn${i + 1}] ${wrapUserData(content)}`).join('\n');
    }

    const styleInstruction = communicationStyle
      ? `文体の指定: ${communicationStyle}`
      : '話し言葉で、やわらかく、ふだん使いのトーンで書いてください。堅い文語体・敬語体は避けること。';

    const hasPastTurns = conversationHistory.length > 0;
    const currentTurn = conversationHistory.length + 1;

    const prompt = `あなたは夫婦のコミュニケーション支援AIです。
ユーザーは、${partner}との関係の中で今困っていること・思っていること・伝えたいことを整理しようとしています。
決めつけず、ユーザーの本音を薄めすぎず、相手を責める表現にも寄せすぎないでください。

${DATA_HANDLING_INSTRUCTION}

## 出力例（参考）

例1 ― 感情語なし・事実だけの入力:
入力: 「最近忙しい」
良い reflection: 「最近、忙しい時期が続いているんですね。何か手放せたらいいなと思うことはありますか？」
悪い reflection: 「忙しさの中で疲れや諦めを感じているのかもしれません。」← 入力にない感情を読み込んでいる

例2 ― 整理できている・ポジティブな入力:
入力: 「昨日、久しぶりにゆっくり話せた。よかった」
良い reflection: 「久しぶりにゆっくり話せた時間があったんですね。」（問いかけなし）
悪い reflection: 「つながりを感じられたのかもしれません。何か変化を感じましたか？」← 読み込み＋不要な問いかけ
${historySection}

## 今回のメッセージ（turn${currentTurn}）
${wrapUserData(text)}

上記をもとに、ユーザーが自分の気持ちを整理できる短いメモを出力してください。

reflection のルール:
- 200文字以内・自然な文章・${styleInstruction}
- まず入力から明確に読み取れる状態・出来事を1文で受け取る
- 感情語が入力にない場合、感情を推測せず事実・状態だけを受け取る（「〜のかもしれません」で補完しない）
- 疲弊・諦めが入力に明示されている場合は薄めず拾う
- 気持ちの奥にあるものを引き出す余地があれば、文末に問いかけを1つだけ添える
  問いかけの型（以下のいずれか）:「何がいちばんしんどかった？」「どんな気持ちが一番重くなってる？」「本当はどうしたい？」
- 整理できている・ポジティブな場面は問いかけ不要
${hasPastTurns ? '- 前のターンの流れを踏まえて、さらに深く掘り下げてください' : ''}

readyForDraft のルール:
- 何を${partner}に伝えたいかが十分に整理されている、または感情が言語化できている場合は true
- まだモヤがある・整理の途中・入力が短い・turn1 の場合は false

出力形式（JSON）:
{
  "reflection": "...",
  "readyForDraft": true | false
}`;

    try {
      const result = await getModel('consult').generateContent(prompt);
      const json = JSON.parse(result.response.text());
      return { reflection: json.reflection, readyForDraft: json.readyForDraft ?? false };
    } catch (e: any) {
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
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

    const prompt = `あなたは夫婦のコミュニケーション支援AIです。
以下はユーザーが${partner}に関して気持ちを整理した発話の記録です。

${DATA_HANDLING_INSTRUCTION}

## ユーザーの発話履歴
${userInputs}

この会話から、以下を出力してください。

1. summary: ユーザーが${partner}に伝えたいことを60文字以内で1〜2文にまとめる。
   - ユーザーの本音・葛藤を薄めすぎない
   - 相手を責める表現にしない
   - 「〜ということを伝えたい」という形に集約

2. options: 伝え方の選択肢を3つ。それぞれ:
   - label: 短いラベル（8文字以内）
   - description: その伝え方の概要（30文字以内）
   - 方向性が異なるよう重複させない（例: 気持ちを伝える・お願いを共有する・事実だけ共有）

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
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
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
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
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

    if (cacheKey && !force) {
      const cacheSnap = await db.doc(`users/${viewerUid}/interpretationCache/${cacheKey}`).get();
      if (cacheSnap.exists) {
        return { interpretations: cacheSnap.data()!.interpretations };
      }
    }

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
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
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
      throw new HttpsError('internal', `AI処理に失敗しました: ${e.message}`);
    }
  }
);
