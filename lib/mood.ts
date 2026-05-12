export const MOODS = [
  { score: 1, emoji: '😣', label: 'つらい', color: '#D4A0A0' },
  { score: 2, emoji: '😔', label: 'しんどい', color: '#C8BFA8' },
  { score: 3, emoji: '😐', label: 'ふつう', color: '#B8C4B0' },
  { score: 4, emoji: '🙂', label: 'まあまあ', color: '#8EAF98' },
  { score: 5, emoji: '😊', label: 'いい感じ', color: '#6B9678' },
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
