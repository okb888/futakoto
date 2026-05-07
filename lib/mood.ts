export const MOODS = [
  { score: 1, emoji: '😣', label: 'つらい', color: '#E57373' },
  { score: 2, emoji: '😔', label: 'しんどい', color: '#FFB74D' },
  { score: 3, emoji: '😐', label: 'ふつう', color: '#FFF176' },
  { score: 4, emoji: '🙂', label: 'まあまあ', color: '#AED581' },
  { score: 5, emoji: '😊', label: 'いい感じ', color: '#81D4FA' },
] as const;

export const MOOD_EMOJI = ['', ...MOODS.map((mood) => mood.emoji)] as const;
export const MOOD_COLORS = ['', ...MOODS.map((mood) => mood.color)] as const;

export function getMoodEmoji(score?: number): string {
  if (!score || score < 1 || score > 5) return '';
  return MOOD_EMOJI[score] ?? '';
}

export function getMoodColor(score?: number): string {
  if (!score || score < 1 || score > 5) return '';
  return MOOD_COLORS[score] ?? '';
}
