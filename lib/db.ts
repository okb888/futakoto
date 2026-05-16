import {
  collection,
  addDoc,
  query,
  orderBy,
  where,
  limit as queryLimit,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  FieldValue,
  arrayUnion,
} from 'firebase/firestore';
import { db } from './firebase';

export type Visibility = 'private' | 'shared';

/**
 * 無料プランの月次AI利用上限。
 * functions/src/shared.ts の AI_FREE_MONTHLY_LIMIT と揃える必要がある。
 */
export const AI_FREE_MONTHLY_LIMIT = 5;

/**
 * Firestore Timestamp はクライアントで serverTimestamp() が解決されるまで
 * 一時的に null になる可能性がある。読み取り後は Timestamp として扱う。
 */
export type FirestoreTimestampLike = Timestamp | { seconds: number; nanoseconds: number };

export interface Entry {
  id?: string;
  uid: string;
  mood: number;
  memo: string;
  visibility: Visibility;
  sourceConsultationSessionId?: string;
  createdAt: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
}

export interface Consultation {
  id?: string;
  uid: string;
  input: string;
  reflection: string;
  messageDraft: string;
  createdAt: FirestoreTimestampLike;
}

export interface ConsultationSessionTurn {
  input: string;
  reflection: string;
  /** 旧スキーマ。新規ターンには保存しない（aiDraft で session.lastDraft に集約） */
  messageDraft?: string;
}

export interface ConsultationSessionDraft {
  intent: string;
  messageDraft: string;
  createdAt: FirestoreTimestampLike;
}

export interface ConsultationSession {
  id?: string;
  uid: string;
  turns: ConsultationSessionTurn[];
  favored: boolean;
  createdAt: FirestoreTimestampLike;
  lastDraft?: ConsultationSessionDraft;
}

export interface FavoriteEntry {
  id?: string;
  entryUid: string;
  entryId: string;
  createdAt: FirestoreTimestampLike;
}

export interface FavoriteEntryWithEntry extends FavoriteEntry {
  entry: Entry | null;
}

export type AiSummaryRecord = {
  id?: string;
  uid: string;
  month: string;
  target: 'me' | 'partner';
  text: string;
  entryCountAtGeneration: number;
  createdAt: Timestamp | FieldValue;
};

export type AiPersona = 'soft' | 'friendly' | 'logical';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  inviteCode?: string;
  partnerUid?: string;
  notificationSettings?: NotificationSettings;
  communicationStyle?: string;
  aiPersona?: AiPersona;
  premium?: boolean;
  premiumExpiresAt?: Timestamp;
  aiCreditsMonth?: string;
  createdAt: Timestamp;
  aiCreditsUsed?: number;
  aiCreditsLimit?: number;
  aiQuotaResetAt?: Timestamp;
  aiFirstUsedAt?: Timestamp;
  aiConsentAcknowledged?: boolean;
  aiConsentAcknowledgedAt?: Timestamp;
  lastVisibility?: Visibility;
}

export interface NotificationSettings {
  dailyReminderEnabled?: boolean;
  dailyReminderHour?: number;
  dailyReminderMinute?: number;
  sharedPostNotificationsEnabled?: boolean;
}

export function favoriteKey(entryUid: string, entryId: string): string {
  return `${entryUid}_${entryId}`;
}

// ---- User Profile ----

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function updateDisplayName(uid: string, displayName: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { displayName });
}

export async function updateCommunicationStyle(uid: string, style: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { communicationStyle: style });
}

export async function updateAiPersona(uid: string, persona: AiPersona): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { aiPersona: persona });
}

export async function updateLastVisibility(uid: string, visibility: Visibility): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { lastVisibility: visibility });
}

export async function setAiConsentAcknowledged(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    aiConsentAcknowledged: true,
    aiConsentAcknowledgedAt: serverTimestamp(),
  });
}

export async function updateNotificationSettings(
  uid: string,
  settings: NotificationSettings
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    notificationSettings: settings,
  });
}

export async function savePushToken(
  uid: string,
  token: string,
  platform: string
): Promise<void> {
  const tokenId = token.replace(/[^\w-]/g, '_');
  await setDoc(doc(db, 'users', uid, 'pushTokens', tokenId), {
    token,
    platform,
    updatedAt: serverTimestamp(),
  });
}

export async function findUidByCode(code: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'inviteCodes', code.toUpperCase()));
  return snap.exists() ? (snap.data().uid as string) : null;
}

// ---- Entries ----

export async function addEntry(
  uid: string,
  mood: number,
  memo: string,
  visibility: Visibility,
  createdAt?: Date,
  sourceConsultationSessionId?: string
): Promise<void> {
  const payload: Record<string, any> = {
    uid,
    mood,
    memo,
    visibility,
    createdAt: createdAt ? Timestamp.fromDate(createdAt) : serverTimestamp(),
  };
  if (sourceConsultationSessionId) {
    payload.sourceConsultationSessionId = sourceConsultationSessionId;
  }
  await addDoc(collection(db, 'users', uid, 'entries'), payload);
}

export async function getEntry(uid: string, entryId: string): Promise<Entry | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'entries', entryId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Entry) : null;
}

export async function updateEntry(
  uid: string,
  entryId: string,
  mood: number,
  memo: string,
  visibility: Visibility,
  createdAt: Date
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'entries', entryId), {
    mood,
    memo,
    visibility,
    createdAt: Timestamp.fromDate(createdAt),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEntry(uid: string, entryId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'entries', entryId));
}

export async function updateEntryVisibility(
  uid: string,
  entryId: string,
  visibility: Visibility
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'entries', entryId), { visibility });
}

export async function getRecentEntries(uid: string, count = 50): Promise<Entry[]> {
  const q = query(
    collection(db, 'users', uid, 'entries'),
    orderBy('createdAt', 'desc'),
    queryLimit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry));
}

export async function getPartnerSharedEntries(partnerUid: string, count = 50): Promise<Entry[]> {
  const q = query(
    collection(db, 'users', partnerUid, 'entries'),
    where('visibility', '==', 'shared'),
    orderBy('createdAt', 'desc'),
    queryLimit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry));
}

/**
 * 取得済みの自分のエントリ一覧から、今日または昨日を起点にした連続記録日数を返す。
 * 同じ日の複数投稿は1日として数える。
 */
export function getConsecutiveDays(myEntries: Entry[]): number {
  if (myEntries.length === 0) return 0;

  function toDate(ts: any): Date | null {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (typeof ts === 'number' || typeof ts === 'string' || ts instanceof Date) return new Date(ts);
    if (typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1000000));
    }
    return null;
  }

  function dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function daysBetween(newer: string, older: string): number {
    const [newerYear, newerMonth, newerDay] = newer.split('-').map(Number);
    const [olderYear, olderMonth, olderDay] = older.split('-').map(Number);
    const newerMs = Date.UTC(newerYear, newerMonth - 1, newerDay);
    const olderMs = Date.UTC(olderYear, olderMonth - 1, olderDay);
    return Math.round((newerMs - olderMs) / 86400000);
  }

  const todayDate = new Date();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(todayDate.getDate() - 1);
  const today = dateKey(todayDate);
  const yesterday = dateKey(yesterdayDate);

  const uniqueDates = [...new Set(
    myEntries
      .map((entry) => toDate(entry.createdAt))
      .filter((date): date is Date => date !== null)
      .map(dateKey)
  )].sort().reverse();

  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

  let count = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    if (daysBetween(uniqueDates[i - 1], uniqueDates[i]) !== 1) break;
    count++;
  }
  return count;
}

// ---- Consultation Sessions ----

export async function createConsultationSession(
  uid: string,
  firstTurn: ConsultationSessionTurn
): Promise<string> {
  const ref = await addDoc(collection(db, 'users', uid, 'consultationSessions'), {
    uid,
    turns: [firstTurn],
    favored: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function addTurnToSession(
  uid: string,
  sessionId: string,
  turn: ConsultationSessionTurn
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'consultationSessions', sessionId), {
    turns: arrayUnion(turn),
  });
}

export async function deleteConsultationSession(uid: string, sessionId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'consultationSessions', sessionId));
}

export async function toggleSessionFavorite(
  uid: string,
  sessionId: string,
  favored: boolean
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'consultationSessions', sessionId), { favored });
}

export async function getRecentConsultationSessions(
  uid: string,
  count = 10
): Promise<ConsultationSession[]> {
  const q = query(
    collection(db, 'users', uid, 'consultationSessions'),
    orderBy('createdAt', 'desc'),
    queryLimit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConsultationSession));
}

export async function getConsultationSession(
  uid: string,
  sessionId: string
): Promise<ConsultationSession | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'consultationSessions', sessionId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ConsultationSession) : null;
}

// ---- Favorites ----

export async function getFavoriteEntryIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, 'users', uid, 'favorites'));
  return new Set(snap.docs.map((d) => d.id));
}

export async function getFavoriteEntries(uid: string): Promise<FavoriteEntryWithEntry[]> {
  const q = query(
    collection(db, 'users', uid, 'favorites'),
    orderBy('createdAt', 'desc'),
    queryLimit(100)
  );
  const snap = await getDocs(q);
  const favorites = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FavoriteEntry));
  return Promise.all(favorites.map(async (favorite) => {
    try {
      const entry = await getEntry(favorite.entryUid, favorite.entryId);
      return { ...favorite, entry };
    } catch (e) {
      return { ...favorite, entry: null };
    }
  }));
}

export async function toggleFavoriteEntry(
  uid: string,
  entryUid: string,
  entryId: string,
  isFavorite: boolean
): Promise<void> {
  const key = favoriteKey(entryUid, entryId);
  const ref = doc(db, 'users', uid, 'favorites', key);
  if (isFavorite) {
    await deleteDoc(ref);
    return;
  }

  await setDoc(ref, {
    entryUid,
    entryId,
    createdAt: serverTimestamp(),
  });
}

// ---- 解釈キャッシュ (P0-4) ----

export async function getAllInterpretationCaches(uid: string, limit = 200): Promise<Record<string, string[]>> {
  const snap = await getDocs(query(
    collection(db, 'users', uid, 'interpretationCache'),
    queryLimit(limit)
  ));
  const result: Record<string, string[]> = {};
  snap.docs.forEach((d) => {
    result[d.id] = (d.data().interpretations ?? []) as string[];
  });
  return result;
}

// ---- 月単位エントリ取得 (P0-5) ----

export async function getEntriesInRange(uid: string, start: Date, end: Date): Promise<Entry[]> {
  const q = query(
    collection(db, 'users', uid, 'entries'),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<', Timestamp.fromDate(end)),
    orderBy('createdAt', 'desc'),
    queryLimit(500)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry));
}

// ---- AI要約履歴 ----

export async function saveAiSummary(
  uid: string,
  month: string,
  target: 'me' | 'partner',
  text: string,
  entryCount: number
): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'aiSummaries'), {
    month,
    target,
    text,
    entryCountAtGeneration: entryCount,
    createdAt: serverTimestamp(),
  });
}

export async function getLatestAiSummary(
  uid: string,
  month: string,
  target: 'me' | 'partner'
): Promise<AiSummaryRecord | null> {
  const q = query(
    collection(db, 'users', uid, 'aiSummaries'),
    where('month', '==', month),
    where('target', '==', target),
    orderBy('createdAt', 'desc'),
    queryLimit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, uid, ...(d.data() as Omit<AiSummaryRecord, 'id' | 'uid'>) };
}

// ---- Data Export ----

export async function getUserExportData(uid: string): Promise<{
  profile: UserProfile | null;
  entries: Entry[];
  consultationSessions: ConsultationSession[];
  favorites: FavoriteEntry[];
}> {
  const [profile, entriesSnap, sessionsSnap, favoritesSnap] = await Promise.all([
    getUserProfile(uid),
    getDocs(query(collection(db, 'users', uid, 'entries'), orderBy('createdAt', 'desc'), queryLimit(1000))),
    getDocs(query(collection(db, 'users', uid, 'consultationSessions'), orderBy('createdAt', 'desc'), queryLimit(200))),
    getDocs(query(collection(db, 'users', uid, 'favorites'), orderBy('createdAt', 'desc'), queryLimit(500))),
  ]);

  return {
    profile,
    entries: entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry)),
    consultationSessions: sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ConsultationSession)),
    favorites: favoritesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FavoriteEntry)),
  };
}
