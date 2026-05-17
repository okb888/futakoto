import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import type { UserProfile } from './db';

export interface RewriteResult {
  understanding?: {
    coreFeeling: string;
    importantNuance: string;
    messageGoal: string;
  };
  selectedLabels?: string[];
  rewrites: { labelKey?: string; label: string; text: string }[];
}

export interface InterpretResult {
  interpretations: string[];
}

export interface SummaryResult {
  summary: string;
}

export interface ConsultResult {
  reply: string;
}

export interface DraftOption {
  label: string;
  description: string;
}

export interface DraftOptionsResult {
  summary: string;
  options: DraftOption[];
}

export interface DraftResult {
  messageDraft: string;
}

export interface EnsureUserProfileResult {
  profile: UserProfile;
}

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  // 認証状態が確実に読み込まれるまで待つ
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('ログインが必要です');
  // トークンを強制リフレッシュ
  await auth.currentUser.getIdToken(true);

  const fn = httpsCallable<Record<string, unknown>, T>(functions, name);
  const res = await fn(data);
  return res.data;
}

export async function pairWithCode(code: string): Promise<void> {
  await call<void>('pairWithCode', { code });
}

export async function unpairPartner(): Promise<void> {
  await call<void>('unpairPartner', {});
}

export async function deleteAccount(): Promise<void> {
  await call<void>('deleteAccount', {});
}

export async function regenerateInviteCode(): Promise<{ inviteCode: string }> {
  return call<{ inviteCode: string }>('regenerateInviteCode', {});
}

export async function ensureUserProfile(): Promise<UserProfile> {
  const result = await call<EnsureUserProfileResult>('ensureUserProfile', {
    email: auth.currentUser?.email ?? '',
  });
  return result.profile;
}

export async function aiRewrite(text: string, partnerName?: string, mood?: number): Promise<RewriteResult> {
  return call<RewriteResult>('aiRewrite', { text, partnerName, mood });
}

export async function aiConsult(
  text: string,
  partnerName?: string,
  sessionId?: string | null,
  aiPersona?: string
): Promise<ConsultResult> {
  return call<ConsultResult>('aiConsult', { text, partnerName, sessionId, aiPersona });
}

export async function aiDraftOptions(
  sessionId: string,
  partnerName?: string
): Promise<DraftOptionsResult> {
  return call<DraftOptionsResult>('aiDraftOptions', { sessionId, partnerName });
}

export async function aiDraft(
  sessionId: string,
  intent: string,
  partnerName?: string,
  communicationStyle?: string
): Promise<DraftResult> {
  return call<DraftResult>('aiDraft', { sessionId, intent, partnerName, communicationStyle });
}

export async function aiInterpret(
  text: string,
  mood: number,
  partnerName?: string,
  entryId?: string,
  entryOwnerId?: string,
  force?: boolean,
): Promise<InterpretResult> {
  return call<InterpretResult>('aiInterpret', { text, mood, partnerName, entryId, entryOwnerId, force });
}

export async function aiSummary(
  entries: { mood: number; memo: string }[],
  target?: 'me' | 'partner',
  partnerName?: string
): Promise<SummaryResult> {
  return call<SummaryResult>('aiSummary', { entries, target, partnerName });
}
