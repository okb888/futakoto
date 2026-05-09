// LLM-as-judge: eval/results/ の JSON を読み込み、各 reflection を自動評価する
// 使い方: npx ts-node eval/judge.ts eval/results/D_all_20260509.json
//
// 評価基準:
//   scoreReception (0-3): 入力にない感情を読み込んでいないか
//   scoreQuestion  (0-3): 問いかけが感情寄りか・不要な問いかけをしていないか
//   scoreNatural   (0-3): 全体の自然さ・温かさ・200文字以内か
//   total: 0-9

import 'dotenv/config';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { readFileSync, writeFileSync } from 'fs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('使い方: npx ts-node eval/judge.ts <results_json_path>');
  process.exit(1);
}

const JUDGE_SCHEMA = {
  type: SchemaType.OBJECT,
  required: ['scoreReception', 'scoreQuestion', 'scoreNatural', 'total', 'verdict', 'comment'],
  properties: {
    scoreReception: { type: SchemaType.INTEGER },
    scoreQuestion: { type: SchemaType.INTEGER },
    scoreNatural: { type: SchemaType.INTEGER },
    total: { type: SchemaType.INTEGER },
    verdict: { type: SchemaType.STRING },
    comment: { type: SchemaType.STRING },
  },
};

function buildJudgePrompt(input: string, reflection: string): string {
  return `あなたは夫婦向けAIコミュニケーション支援の品質評価者です。
以下のユーザー入力と、AIが返した reflection（気持ちの整理メモ）を3つの基準で評価してください。

## ユーザー入力
「${input}」

## AIの reflection
「${reflection}」

## 評価基準

### scoreReception（受容の精度）: 0〜3点
入力から明確に読み取れる内容だけを受け取っているか。入力にない感情や状態を読み込んでいないか。
- 0: 明らかな感情の読み込み・補完あり（「〜のかもしれません」「〜を感じているようです」等で未記述の感情を付与）
- 1: 小さな読み込みあり（「少し」「ちょっと」程度の強調）
- 2: ほぼ適切（軽微な誇張のみ）
- 3: 完全に適切（入力に書かれた事実・状態のみを受け取っている）

### scoreQuestion（問いかけの質）: 0〜3点
問いかけの方向性と必要性が適切か。
- 0: 状況確認・解決志向の問い（「どんな場面で？」「どうしたい？」「どんなサポートがあれば？」等）
- 1: 感情寄りと状況確認が混在
- 2: 感情寄りの問い（おおむね適切）
- 3: 感情の核心を問う問い（「何がいちばんしんどかった？」等）、または整理済みで問いかけ不要と正しく判断

### scoreNatural（自然さ・温かさ）: 0〜3点
文章として自然で、温かく受け取れるか。
- 0: 不自然（過度な敬語・断言・説教）または200文字超
- 1: 普通だがやや硬い
- 2: 自然で温かい
- 3: とても自然で、読んで安心できる

## 出力形式（JSON）
{
  "scoreReception": <0-3>,
  "scoreQuestion": <0-3>,
  "scoreNatural": <0-3>,
  "total": <scoreReception + scoreQuestion + scoreNatural>,
  "verdict": "good" | "ok" | "poor",
  "comment": "50文字以内の評価コメント（問題点か良い点を一言で）"
}

verdict は total 7-9 = "good", 4-6 = "ok", 0-3 = "poor" で判定してください。`;
}

async function judgeOne(
  genAI: GoogleGenerativeAI,
  input: string,
  reflection: string,
): Promise<{
  scoreReception: number;
  scoreQuestion: number;
  scoreNatural: number;
  total: number;
  verdict: string;
  comment: string;
}> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: JUDGE_SCHEMA,
    },
  });
  const result = await model.generateContent(buildJudgePrompt(input, reflection));
  return JSON.parse(result.response.text());
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

  const genAI = new GoogleGenerativeAI(apiKey);
  const raw = JSON.parse(readFileSync(inputPath, 'utf-8')) as Array<{
    variant: string;
    caseId: string;
    sampleId: string;
    caseLabel: string;
    input: string;
    reflection: string;
  }>;

  console.log(`▶ ${raw.length}件を評価します`);

  const judged = [];
  for (const item of raw) {
    process.stdout.write(`  ${item.sampleId} (${item.caseLabel})... `);
    const scores = await judgeOne(genAI, item.input, item.reflection);
    const judgedItem = { ...item, ...scores };
    judged.push(judgedItem);
    console.log(`[${scores.verdict}] ${scores.total}/9 — ${scores.comment}`);
  }

  // サマリー
  const total = judged.length;
  const avgTotal = judged.reduce((s, j) => s + j.total, 0) / total;
  const avgReception = judged.reduce((s, j) => s + j.scoreReception, 0) / total;
  const avgQuestion = judged.reduce((s, j) => s + j.scoreQuestion, 0) / total;
  const avgNatural = judged.reduce((s, j) => s + j.scoreNatural, 0) / total;
  const goodCount = judged.filter((j) => j.verdict === 'good').length;
  const poorCount = judged.filter((j) => j.verdict === 'poor').length;

  console.log('\n=== サマリー ===');
  console.log(`総合スコア: ${avgTotal.toFixed(2)}/9`);
  console.log(`受容の精度: ${avgReception.toFixed(2)}/3`);
  console.log(`問いかけ質: ${avgQuestion.toFixed(2)}/3`);
  console.log(`自然さ:     ${avgNatural.toFixed(2)}/3`);
  console.log(`good: ${goodCount}件 / ok: ${total - goodCount - poorCount}件 / poor: ${poorCount}件`);

  // 出力保存
  const outPath = inputPath.replace('.json', '_judged.json');
  writeFileSync(outPath, JSON.stringify({ summary: { avgTotal, avgReception, avgQuestion, avgNatural, goodCount, poorCount, total }, results: judged }, null, 2), 'utf-8');
  console.log(`\n✓ 評価結果保存: ${outPath}`);
}

main().catch(console.error);
