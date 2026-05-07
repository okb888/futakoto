import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';

export interface RewriteResult {
  understanding?: {
    coreFeeling: string;
    importantNuance: string;
    messageGoal: string;
  };
  rewrites: { label: string; text: string }[];
}

export interface InterpretResult {
  interpretations: string[];
}

export interface SummaryResult {
  summary: string;
}

export interface ConsultResult {
  reflection: string;
  messageDraft: string;
}

async function call<T>(name: string, data: any): Promise<T> {
  // 認証状態が確実に読み込まれるまで待つ
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('ログインが必要です');
  // トークンを強制リフレッシュ
  await auth.currentUser.getIdToken(true);

  const fn = httpsCallable<any, T>(functions, name);
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

export async function aiRewrite(text: string, partnerName?: string): Promise<RewriteResult> {
  return call<RewriteResult>('aiRewrite', { text, partnerName });
}

export async function aiConsult(
  text: string,
  partnerName?: string,
  conversationHistory?: { role: 'user' | 'ai'; content: string }[],
  communicationStyle?: string
): Promise<ConsultResult> {
  return call<ConsultResult>('aiConsult', { text, partnerName, conversationHistory, communicationStyle });
}

export async function aiInterpret(
  text: string,
  mood: number,
  partnerName?: string,
  entryId?: string,
  entryOwnerId?: string,
): Promise<InterpretResult> {
  return call<InterpretResult>('aiInterpret', { text, mood, partnerName, entryId, entryOwnerId });
}

export async function aiSummary(
  entries: { mood: number; memo: string }[],
  target?: 'me' | 'partner',
  partnerName?: string
): Promise<SummaryResult> {
  return call<SummaryResult>('aiSummary', { entries, target, partnerName });
}
