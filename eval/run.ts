import 'dotenv/config';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { cases } from './cases.ts';
import { buildConsultPromptA } from './prompt-a.ts';
import { buildConsultPromptB } from './prompt-b.ts';
import { buildConsultPromptC } from './prompt-c.ts';
import { buildConsultPromptD } from './prompt-d.ts';
import { buildConsultPromptESoft } from './prompt-e-soft.ts';
import { buildConsultPromptEFriendly } from './prompt-e-friendly.ts';
import { buildConsultPromptELogical } from './prompt-e-logical.ts';

const variant = process.argv[2] ?? 'A';
const caseFilter = process.argv[3];

const CONSULT_SCHEMA_ABC = {
  type: SchemaType.OBJECT,
  required: ['reflection', 'messageDraft'],
  properties: {
    reflection: { type: SchemaType.STRING },
    messageDraft: { type: SchemaType.STRING },
  },
};

const CONSULT_SCHEMA_D = {
  type: SchemaType.OBJECT,
  required: ['reflection', 'readyForDraft'],
  properties: {
    reflection: { type: SchemaType.STRING },
    readyForDraft: { type: SchemaType.BOOLEAN },
  },
};

const CONSULT_SCHEMA_E = {
  type: SchemaType.OBJECT,
  required: ['reply'],
  properties: {
    reply: { type: SchemaType.STRING },
  },
};

const E_VARIANTS = ['E-soft', 'E-friendly', 'E-logical'];

function getSchema() {
  if (variant === 'D') return CONSULT_SCHEMA_D;
  if (E_VARIANTS.includes(variant)) return CONSULT_SCHEMA_E;
  return CONSULT_SCHEMA_ABC;
}

const CONSULT_SCHEMA = getSchema();

function buildPrompt(v: string, input: typeof cases[number]['samples'][number]['input']) {
  if (v === 'B') return buildConsultPromptB(input);
  if (v === 'C') return buildConsultPromptC(input);
  if (v === 'D') return buildConsultPromptD(input);
  if (v === 'E-soft') return buildConsultPromptESoft(input);
  if (v === 'E-friendly') return buildConsultPromptEFriendly(input);
  if (v === 'E-logical') return buildConsultPromptELogical(input);
  return buildConsultPromptA(input);
}

function escapeCsv(val: string): string {
  return `"${val.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
}

function appendCsv(row: Record<string, string | number>) {
  const csvPath = './results/all_results.csv';
  const header = 'variant,caseId,sampleId,caseLabel,input,reflection,reflectionLength,timestamp';
  const line = [
    row.variant, row.caseId, row.sampleId, row.caseLabel,
    row.input, row.reflection, row.reflectionLength, row.timestamp,
  ].map(String).map(escapeCsv).join(',');

  if (!existsSync(csvPath)) {
    writeFileSync(csvPath, header + '\n', 'utf-8');
  }
  writeFileSync(csvPath, readFileSync(csvPath, 'utf-8') + line + '\n', 'utf-8');
}

async function runSample(
  caseId: string,
  caseLabel: string,
  sampleId: string,
  input: typeof cases[number]['samples'][number]['input'],
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CONSULT_SCHEMA,
    },
  });

  const prompt = buildPrompt(variant, input);

  console.log(`\n▶ [${variant}案] ${sampleId} (${caseLabel})`);
  console.log(`入力: "${input.text}"`);

  const result = await model.generateContent(prompt);
  const json = JSON.parse(result.response.text());

  // E案は reply フィールド、それ以外は reflection フィールドを使う
  const outputText: string = json.reply ?? json.reflection;

  console.log('reply:');
  console.log(outputText);
  console.log(`（${outputText.length}文字）`);

  const timestamp = new Date().toISOString();

  appendCsv({
    variant,
    caseId,
    sampleId,
    caseLabel,
    input: input.text,
    reflection: outputText,
    reflectionLength: outputText.length,
    timestamp,
  });

  return {
    variant,
    caseId,
    sampleId,
    caseLabel,
    input: input.text,
    reflection: outputText,
    meta: { reflectionLength: outputText.length, timestamp },
  };
}

async function main() {
  const targets = caseFilter ? cases.filter((c) => c.id === caseFilter) : cases;
  if (targets.length === 0) {
    console.error(`ケースが見つかりません: ${caseFilter}`);
    process.exit(1);
  }

  mkdirSync('./results', { recursive: true });
  const results = [];

  for (const c of targets) {
    for (const s of c.samples) {
      const result = await runSample(c.id, c.label, s.id, s.input);
      results.push(result);
    }
  }

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const caseTag = caseFilter ?? 'all';
  const outPath = `./results/${variant}_${caseTag}_${date}.json`;
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n✓ JSON保存: ${outPath}`);
  console.log(`✓ CSV追記: ./results/all_results.csv`);
}

main().catch(console.error);
