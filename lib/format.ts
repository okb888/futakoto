// 日時系の共通フォーマッタ。Firestore Timestamp / Date / undefined を安全に扱う。

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (typeof ts === 'number' || ts instanceof Date) return new Date(ts);
  return null;
}

/** 同分内のソート安定化のため、ミリ秒精度（Timestamp の nanoseconds 込み）で取り出す。 */
export function sortMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.seconds === 'number') {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1000000);
  }
  const d = toDate(ts);
  return d ? d.getTime() : 0;
}

/** 'YYYY-MM-DD' のローカル日付キー。カレンダー連携用。 */
export function dateKey(ts: any): string {
  const d = toDate(ts);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'HH:MM' のローカル時刻。 */
export function formatTime(ts: any): string {
  const d = toDate(ts);
  if (!d) return '';
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ホーム用：今日なら「今日 HH:MM」、それ以外は「M/D HH:MM」。 */
export function formatEntryDate(ts: any): string {
  const d = toDate(ts);
  if (!d) return '';
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return isToday ? `今日 ${time}` : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

/** 'M/D HH:MM' フォーマット。壁打ちセッション一覧などで使用。 */
export function formatShortDate(ts: any): string {
  const d = toDate(ts);
  if (!d) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
