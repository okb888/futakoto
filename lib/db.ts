import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export type Visibility = 'private' | 'shared';

export interface Entry {
  id?: string;
  uid: string;
  mood: number;
  memo: string;
  visibility: Visibility;
  createdAt: any;
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

export interface FavoriteEntry {
  id?: string;
  entryUid: string;
  entryId: string;
  createdAt: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  inviteCode?: string;
  partnerUid?: string;
  createdAt: any;
  // 将来用（任意）
  isPremium?: boolean;
  aiCreditsUsed?: number;
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
  createdAt?: Date
): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'entries'), {
    uid,
    mood,
    memo,
    visibility,
    createdAt: createdAt ? Timestamp.fromDate(createdAt) : serverTimestamp(),
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
    orderBy('createdAt', 'desc'),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Entry))
    .filter((e) => e.visibility === 'shared');
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

// ---- Favorites ----

export async function getFavoriteEntryIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, 'users', uid, 'favorites'));
  return new Set(snap.docs.map((d) => d.id));
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
