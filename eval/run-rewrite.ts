import 'dotenv/config';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { writeFileSync, mkdirSync } from 'fs';
import { rewriteCases } from './rewrite-cases.ts';
import { buildRewriteLabelPrompt, REWRITE_LABELS } from './rewrite-label-prompt.ts';

const caseFilter = process.argv[2]; // case-r01 など（省略時は全件）

// ----------------------------------------------------------------
// Gemini レスポンススキーマ
// ----------------------------------------------------------------
const REWRITE_SCHEMA = {
  type: SchemaType.OBJECT,
  required: ['understanding', 'selectedLabels', 'rewrites'],
  properties: {
    understanding: {
      type: SchemaType.OBJECT,
      required: ['coreFeeling', 'importantNuance', 'messageGoal'],
      properties: {
        coreFeeling:      { type: SchemaType.STRING },
        importantNuance:  { type: SchemaType.STRING },
        messageGoal:      { type: SchemaType.STRING },
      },
    },
    selectedLabels: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    rewrites: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        required: ['labelKey', 'label', 'text'],
        properties: {
          labelKey: { type: SchemaType.STRING },
          label:    { type: SchemaType.STRING },
          text:     { type: SchemaType.STRING },
        },
      },
    },
  },
};

// ----------------------------------------------------------------
// ヘルパー
// ----------------------------------------------------------------
const LABEL_MAP = Object.fromEntries(REWRITE_LABELS.map((l) => [l.key, l.label]));

function renderResult(
  sampleId: string,
  caseLabel: string,
  input: { text: string; mood?: number },
  json: any,
  expectedLabels?: string[],
) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`▶ [${sampleId}] ${caseLabel}`);
  const moodLabels = ['', '😣', '😔', '😐', '🙂', '😊'];
  const moodStr = input.mood != null ? ` ${moodLabels[input.mood] ?? ''}気分${input.mood}` : '';
  console.log(`入力${moodStr}: "${input.text}"`);

  console.log('\n📌 AIの読み取り:');
  console.log(`  気持ち   : ${json.understanding.coreFeeling}`);
  console.log(`  残すこと : ${json.understanding.importantNuance}`);
  console.log(`  目的     : ${json.understanding.messageGoal}`);

  const selectedNames = (json.selectedLabels as string[])
    .map((k) => LABEL_MAP[k] ?? k)
    .join(' / ');
  console.log(`\n🏷️  選ばれたラベル: ${selectedNames}`);

  if (expectedLabels && expectedLabels.length > 0) {
    const expectedNames = expectedLabels.map((k) => LABEL_MAP[k] ?? k).join(' / ');
    const matched = expectedLabels.filter((k) => (json.selectedLabels as string[]).includes(k));
    const matchStr = matched.length === expectedLabels.length
      ? '✓ 完全一致'
      : `⚠ ${matched.length}/${expectedLabels.length}一致`;
    console.log(`   期待ラベル     : ${expectedNames}  ${matchStr}`);
  }

  console.log('\n✏️  リライト案:');
  for (const r of json.rewrites) {
    console.log(`\n  [${r.label}]`);
    console.log(`  ${r.text}`);
    console.log(`  （${(r.text as string).length}文字）`);
  }
}

// ----------------------------------------------------------------
// サンプル1件実行
// ----------------------------------------------------------------
async function runSample(
  caseId: string,
  caseLabel: string,
  sampleId: string,
  input: { text: string; partnerName?: string; mood?: number },
  expectedLabels?: string[],
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: REWRITE_SCHEMA,
    },
  });

  const prompt = buildRewriteLabelPrompt(
    input.text,
    input.partnerName ?? 'パートナー',
    input.mood,
  );

  const result = await model.generateContent(prompt);
  const json = JSON.parse(result.response.text());

  renderResult(sampleId, caseLabel, input, json, expectedLabels);

  const selectedLabels = json.selectedLabels as string[];
  const labelMatch = expectedLabels && expectedLabels.length > 0
    ? expectedLabels.filter((k) => selectedLabels.includes(k)).length
    : null;

  return {
    caseId,
    caseLabel,
    sampleId,
    input: input.text,
    mood: input.mood ?? null,
    understanding: json.understanding,
    selectedLabels,
    expectedLabels: expectedLabels ?? [],
    labelMatchCount: labelMatch,       // null = 期待なし、n = n/expected.length 一致
    rewrites: json.rewrites,
    timestamp: new Date().toISOString(),
  };
}

// ----------------------------------------------------------------
// メイン
// ----------------------------------------------------------------
async function main() {
  const targets = caseFilter
    ? rewriteCases.filter((c) => c.id === caseFilter)
    : rewriteCases;

  if (targets.length === 0) {
    console.error(`ケースが見つかりません: ${caseFilter}`);
    console.error(`利用可能: ${rewriteCases.map((c) => c.id).join(', ')}`);
    process.exit(1);
  }

  mkdirSync('./results', { recursive: true });
  const results = [];

  for (const c of targets) {
    for (const s of c.samples) {
      const r = await runSample(c.id, c.label, s.id, s.input, s.expectedLabels);
      results.push(r);
    }
  }

  // ── サマリー ──────────────────────────────────────
  console.log(`\n${'═'.repeat(64)}`);
  console.log('📊 サマリー');
  console.log(`  実行サンプル数 : ${results.length}`);

  const withExpected = results.filter((r) => r.labelMatchCount !== null);
  if (withExpected.length > 0) {
    const totalExpected = withExpected.reduce((s, r) => s + r.expectedLabels.length, 0);
    const totalMatched  = withExpected.reduce((s, r) => s + (r.labelMatchCount ?? 0), 0);
    const pct = Math.round((totalMatched / totalExpected) * 100);
    console.log(`  ラベル一致率   : ${totalMatched}/${totalExpected} (${pct}%)`);

    const perfect = withExpected.filter((r) => r.labelMatchCount === r.expectedLabels.length);
    console.log(`  完全一致サンプル: ${perfect.length}/${withExpected.length}`);
  }

  // ラベル選択頻度
  const freq: Record<string, number> = {};
  for (const r of results) {
    for (const k of r.selectedLabels) {
      freq[k] = (freq[k] ?? 0) + 1;
    }
  }
  console.log('\n  ラベル選択頻度:');
  Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .forEach(([k, n]) => {
      const label = (LABEL_MAP[k] ?? k).padEnd(18);
      const bar = '█'.repeat(n);
      console.log(`    ${label} ${bar} (${n})`);
    });

  // 不一致があったサンプルを列挙
  const mismatches = withExpected.filter(
    (r) => r.labelMatchCount !== null && r.labelMatchCount! < r.expectedLabels.length,
  );
  if (mismatches.length > 0) {
    console.log('\n  ⚠ 期待と差異のあったサンプル:');
    for (const r of mismatches) {
      const got  = r.selectedLabels.map((k: string) => LABEL_MAP[k] ?? k).join(', ');
      const want = r.expectedLabels.map((k: string) => LABEL_MAP[k] ?? k).join(', ');
      console.log(`    [${r.sampleId}] 選択=${got} / 期待=${want}`);
    }
  }

  // JSON 保存
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const tag = caseFilter ?? 'all';
  const outPath = `./results/rewrite_${tag}_${date}.json`;
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n✓ JSON保存: ${outPath}`);
}

main().catch(console.error);
