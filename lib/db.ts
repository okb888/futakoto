import {
  collection,
  addDoc,
  query,
  orderBy,
  where,
  limit,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from './firebase';

export type Visibility = 'private' | 'shared';

export interface Entry {
  id?: string;
  uid: string;
  mood: number;
  memo: string;
  visibility: Visibility;
  sourceConsultationSessionId?: string;
  createdAt: any;
  updatedAt?: any;
  // 将来のAI統合用（任意）
  aiSummary?: string;
  aiTags?: string[];
}

export interface Consultation {
  id?: string;
  uid: string;
  input: string;
  reflection: string;
  messageDraft: string;
  createdAt: any;
}

export interface ConsultationSessionTurn {
  input: string;
  reflection: string;
  messageDraft: string;
}

export interface ConsultationSession {
  id?: string;
  uid: string;
  turns: ConsultationSessionTurn[];
  favored: boolean;
  createdAt: any;
}

export interface FavoriteEntry {
  id?: string;
  entryUid: string;
  entryId: string;
  createdAt: any;
}

export interface FavoriteEntryWithEntry extends FavoriteEntry {
  entry: Entry | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  inviteCode?: string;
  partnerUid?: string;
  notificationSettings?: NotificationSettings;
  communicationStyle?: string;
  aiCreditsMonth?: string;
  createdAt: any;
  // 将来用（任意）
  isPremium?: boolean;
  aiCreditsUsed?: number;
  aiCreditsLimit?: number;
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

// ---- 招待コード生成 ----

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

async function ensureUniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const snap = await getDoc(doc(db, 'inviteCodes', code));
    if (!snap.exists()) return code;
  }
  throw new Error('招待コードを生成できませんでした');
}

// ---- User Profile ----

export async function createUserProfile(uid: string, email: string): Promise<UserProfile> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() as UserProfile;
    // 既存ユーザーで inviteCode がない場合は追加
    if (!data.inviteCode) {
      const code = await ensureUniqueCode();
      await setDoc(doc(db, 'inviteCodes', code), { uid });
      await updateDoc(ref, { inviteCode: code });
      data.inviteCode = code;
    }
    return data;
  }

  // 新規作成
  const code = await ensureUniqueCode();
  await setDoc(doc(db, 'inviteCodes', code), { uid });
  const newProfile: UserProfile = {
    uid,
    email,
    displayName: email.split('@')[0],
    inviteCode: code,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, newProfile);
  return newProfile;
}

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

export async function pairWithCode(myUid: string, code: string): Promise<void> {
  const partnerUid = await findUidByCode(code);
  if (!partnerUid) throw new Error('招待コードが見つかりません');
  if (partnerUid === myUid) throw new Error('自分のコードは使えません');

  const partnerSnap = await getDoc(doc(db, 'users', partnerUid));
  if (!partnerSnap.exists()) throw new Error('相手のアカウントが見つかりません');
  const partnerData = partnerSnap.data() as UserProfile;
  if (partnerData.partnerUid && partnerData.partnerUid !== myUid) {
    throw new Error('相手はすでに別のパートナーと繋がっています');
  }

  const mySnap = await getDoc(doc(db, 'users', myUid));
  const myData = mySnap.data() as UserProfile;
  if (myData.partnerUid && myData.partnerUid !== partnerUid) {
    throw new Error('既にペアリング済みです。先に解除してください');
  }

  await updateDoc(doc(db, 'users', myUid), { partnerUid });
  await updateDoc(doc(db, 'users', partnerUid), { partnerUid: myUid });
}

export async function unpairPartner(myUid: string, partnerUid: string): Promise<void> {
  await updateDoc(doc(db, 'users', myUid), { partnerUid: null });
  await updateDoc(doc(db, 'users', partnerUid), { partnerUid: null });
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
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry));
}

export async function getPartnerSharedEntries(partnerUid: string, count = 50): Promise<Entry[]> {
  const q = query(
    collection(db, 'users', partnerUid, 'entries'),
    where('visibility', '==', 'shared'),
    orderBy('createdAt', 'desc'),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry));
}

// ---- Consultations ----

export async function addConsultation(
  uid: string,
  input: string,
  reflection: string,
  messageDraft: string
): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'consultations'), {
    uid,
    input,
    reflection,
    messageDraft,
    createdAt: serverTimestamp(),
  });
}

export async function getRecentConsultations(uid: string, count = 20): Promise<Consultation[]> {
  const q = query(
    collection(db, 'users', uid, 'consultations'),
    orderBy('createdAt', 'desc'),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Consultation));
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
    limit(count)
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
    limit(100)
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

export async function getAllInterpretationCaches(uid: string): Promise<Record<string, string[]>> {
  const snap = await getDocs(collection(db, 'users', uid, 'interpretationCache'));
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
    limit(500)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry));
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
    getDocs(query(collection(db, 'users', uid, 'entries'), orderBy('createdAt', 'desc'), limit(1000))),
    getDocs(query(collection(db, 'users', uid, 'consultationSessions'), orderBy('createdAt', 'desc'), limit(200))),
    getDocs(query(collection(db, 'users', uid, 'favorites'), orderBy('createdAt', 'desc'), limit(500))),
  ]);

  return {
    profile,
    entries: entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry)),
    consultationSessions: sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ConsultationSession)),
    favorites: favoritesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FavoriteEntry)),
  };
}
