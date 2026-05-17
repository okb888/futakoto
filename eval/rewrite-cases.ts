export interface RewriteSampleInput {
  text: string;
  partnerName?: string;
  mood?: number; // 1〜5
}

export interface RewriteSample {
  id: string;
  input: RewriteSampleInput;
  expectedLabels?: string[]; // 期待するlabelKey（一致率チェック用）
}

export interface RewriteCase {
  id: string;
  label: string;
  samples: RewriteSample[];
}

export const rewriteCases: RewriteCase[] = [
  // ----------------------------------------------------------------
  // case-r01: ポジティブ・感謝
  // ----------------------------------------------------------------
  {
    id: 'case-r01',
    label: 'ポジティブ・感謝',
    samples: [
      {
        id: 'r01-s01',
        input: { text: '今日ありがとうって言えてよかった', partnerName: '夫', mood: 5 },
        expectedLabels: ['positive', 'polish', 'forward'],
      },
      {
        id: 'r01-s02',
        input: { text: '久しぶりにゆっくり話せた。よかった', partnerName: '妻', mood: 4 },
        expectedLabels: ['positive', 'forward', 'polish'],
      },
      {
        id: 'r01-s03',
        input: { text: '先週の件、フォローしてくれてありがとう。本当に助かった', partnerName: '夫', mood: 4 },
        expectedLabels: ['positive', 'polish', 'forward'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // case-r02: 相手への不満（直接的）
  // ----------------------------------------------------------------
  {
    id: 'case-r02',
    label: '相手への不満（直接的）',
    samples: [
      {
        id: 'r02-s01',
        input: { text: 'また皿洗いしてない。毎回言わないとやらないし、言ったら言ったで不機嫌になる。もう疲れた。', partnerName: '夫', mood: 1 },
        expectedLabels: ['exhausted', 'situation', 'request'],
      },
      {
        id: 'r02-s02',
        input: { text: '仕事の愚痴は毎日聞くのに、私の話は「うん」だけで流される。', partnerName: '妻', mood: 2 },
        expectedLabels: ['feeling', 'situation', 'request'],
      },
      {
        id: 'r02-s03',
        input: { text: '急に友達と飲みに行くって言い出して、夕飯どうするとか一切連絡なし。', partnerName: '夫', mood: 2 },
        expectedLabels: ['feeling', 'polish', 'request'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // case-r03: 自己反省・葛藤
  // ----------------------------------------------------------------
  {
    id: 'case-r03',
    label: '自己反省・葛藤',
    samples: [
      {
        id: 'r03-s01',
        input: { text: '自分も言い方が悪かったと思う。でも傷ついた。どう言えばよかったか分からない', partnerName: '夫', mood: 2 },
        expectedLabels: ['conflict', 'apologize', 'feeling'],
      },
      {
        id: 'r03-s02',
        input: { text: '私が細かすぎるのかもしれない。でもやっぱり気になってしまう。', partnerName: '妻', mood: 3 },
        expectedLabels: ['conflict', 'feeling', 'polish'],
      },
      {
        id: 'r03-s03',
        input: { text: '自分が求めすぎなのかなとも思う。でも寂しいのは本当で、それを伝えてもいいのか分からない。', partnerName: '夫', mood: 2 },
        expectedLabels: ['conflict', 'feeling', 'polish'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // case-r04: 疲れ・限界
  // ----------------------------------------------------------------
  {
    id: 'case-r04',
    label: '疲れ・限界',
    samples: [
      {
        id: 'r04-s01',
        input: { text: '仕事も家のことも全部自分でやってる感じ。もう限界かも', partnerName: '夫', mood: 1 },
        expectedLabels: ['exhausted', 'request', 'together'],
      },
      {
        id: 'r04-s02',
        input: { text: 'もう頑張れない。毎日毎日同じことの繰り返しで、心が折れそう', partnerName: '妻', mood: 1 },
        expectedLabels: ['exhausted', 'feeling', 'request'],
      },
      {
        id: 'r04-s03',
        input: { text: '子どもの夜泣きで全然眠れてない。正直もう限界で、助けてほしい', partnerName: '夫', mood: 1 },
        expectedLabels: ['exhausted', 'request', 'feeling'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // case-r05: 日常・整えるだけ（言葉を整えたいだけ）
  // ----------------------------------------------------------------
  {
    id: 'case-r05',
    label: '日常・整えるだけ',
    samples: [
      {
        id: 'r05-s01',
        input: { text: '今日は早めに帰れそう', partnerName: '妻', mood: 3 },
        expectedLabels: ['polish', 'forward', 'positive'],
      },
      {
        id: 'r05-s02',
        input: { text: '週末どこか行きたいな', partnerName: '夫', mood: 4 },
        expectedLabels: ['polish', 'forward', 'request'],
      },
      {
        id: 'r05-s03',
        input: { text: '最近話せてないね', partnerName: '妻', mood: 3 },
        expectedLabels: ['polish', 'feeling', 'together'],
      },
    ],
  },

  // ----------------------------------------------------------------
  // case-r06: 長文・複雑な感情
  // ----------------------------------------------------------------
  {
    id: 'case-r06',
    label: '長文・複雑な感情',
    samples: [
      {
        id: 'r06-s01',
        input: {
          text: '子どものことで意見が合わなくて、自分の方が正しいとは思うけど、押し付けたくもないし、でも流されるのも違う気がして。どう話し合えばいいか分からない。',
          partnerName: '夫',
          mood: 2,
        },
        expectedLabels: ['conflict', 'together', 'feeling'],
      },
      {
        id: 'r06-s02',
        input: {
          text: '最近お互い忙しくて全然ゆっくり話せてない。寂しいというか、なんかすれ違ってる感じがする。あなたのこと嫌いとかじゃなくて、ただ一緒にいたい。',
          partnerName: '妻',
          mood: 2,
        },
        expectedLabels: ['feeling', 'together', 'forward'],
      },
    ],
  },
];
