import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { aiConsult, aiDraft, aiDraftOptions, DraftOption } from '../lib/ai';
import {
  createConsultationSession,
  addTurnToSession,
  deleteConsultationSession,
  toggleSessionFavorite,
  getConsultationSession,
  getRecentConsultationSessions,
  ConsultationSession,
  getUserProfile,
} from '../lib/db';
import { firebaseErrorMessage } from '../lib/errors';
import { getPartnerDisplayName } from '../lib/profile';

const MAX_TURNS = 10;
const MAX_CUSTOM_INTENT = 200;

export type ConversationTurn = {
  id: string;
  input: string;
  reflection: string;
  legacyMessageDraft?: string;
  collapsed: boolean;
};

export type UseConsultSessionReturn = {
  // 状態
  text: string;
  setText: (v: string) => void;
  partnerName: string;
  conversation: ConversationTurn[];
  sessionId: string | null;
  isFavorited: boolean;
  loading: boolean;
  recentSessions: ConsultationSession[];
  expandedSessionId: string | null;
  setExpandedSessionId: (id: string | null) => void;
  togglingFavorite: boolean;
  optionsModalOpen: boolean;
  setOptionsModalOpen: (v: boolean) => void;
  draftOptions: DraftOption[] | null;
  draftOptionsLoading: boolean;
  draftSummary: string | null;
  customIntent: string;
  setCustomIntent: (v: string) => void;
  draftLoading: boolean;
  draftIntent: string | null;
  generatedDraft: string | null;
  MAX_TURNS: number;
  MAX_CUSTOM_INTENT: number;
  // ハンドラ
  handleConsult: () => Promise<void>;
  toggleCollapse: (id: string) => void;
  handleStartNewConversation: () => void;
  handleResumeSession: (session: ConsultationSession) => void;
  handleToggleFavorite: () => Promise<void>;
  handleToggleSessionFavorite: (session: ConsultationSession) => Promise<void>;
  handleDeleteSession: (session: ConsultationSession) => void;
  useAsPost: (messageDraft: string, sourceSessionId?: string) => void;
  openDraftOptions: () => Promise<void>;
  handleSelectOption: (option: DraftOption) => void;
  handleSubmitCustomIntent: () => void;
  handleRegenerateDraft: () => void;
};

export function useConsultSession(focusSessionId?: string): UseConsultSessionReturn {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();

  const [text, setText] = useState('');
  const [partnerName, setPartnerName] = useState('パートナー');
  const [aiPersona, setAiPersona] = useState<string | undefined>(undefined);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentSessions, setRecentSessions] = useState<ConsultationSession[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [draftOptions, setDraftOptions] = useState<DraftOption[] | null>(null);
  const [draftOptionsLoading, setDraftOptionsLoading] = useState(false);
  const [draftSummary, setDraftSummary] = useState<string | null>(null);
  const [customIntent, setCustomIntent] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftIntent, setDraftIntent] = useState<string | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);

  async function load(isCancelled: () => boolean = () => false) {
    if (!user) return;
    const profile = authProfile ?? await refreshProfile();
    if (isCancelled() || !profile) return;
    setAiPersona(profile.aiPersona ?? 'soft');
    if (profile.partnerUid) {
      const partner = await getUserProfile(profile.partnerUid);
      if (isCancelled()) return;
      if (partner) setPartnerName(getPartnerDisplayName(partner));
    }
    let sessions = await getRecentConsultationSessions(user.uid, 10);
    if (focusSessionId && !sessions.some((session) => session.id === focusSessionId)) {
      const focused = await getConsultationSession(user.uid, focusSessionId);
      if (focused) sessions = [focused, ...sessions];
    }
    if (isCancelled()) return;
    setRecentSessions(sessions);
    if (focusSessionId) setExpandedSessionId(focusSessionId);
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [user, authProfile, focusSessionId]));

  function resetDraftState() {
    setDraftOptions(null);
    setDraftOptionsLoading(false);
    setOptionsModalOpen(false);
    setDraftSummary(null);
    setCustomIntent('');
    setDraftLoading(false);
    setDraftIntent(null);
    setGeneratedDraft(null);
  }

  const isBlank = (s: string) => /^[\s　 ]*$/.test(s);

  async function handleConsult() {
    if (!user || isBlank(text) || conversation.length >= MAX_TURNS) return;

    const currentInput = text.trim();
    setLoading(true);

    try {
      const nextResult = await aiConsult(currentInput, partnerName, sessionId, aiPersona);
      const sessionTurn = { input: currentInput, reflection: nextResult.reply };

      let activeSessionId = sessionId;
      if (!activeSessionId) {
        activeSessionId = await createConsultationSession(user.uid, sessionTurn);
        setSessionId(activeSessionId);
      } else {
        await addTurnToSession(user.uid, activeSessionId, sessionTurn);
      }

      setConversation((prev) => [
        ...prev.map((t) => ({ ...t, collapsed: true })),
        {
          id: Date.now().toString(),
          input: currentInput,
          reflection: nextResult.reply,
          collapsed: false,
        },
      ]);
      setText('');
      setGeneratedDraft(null);
      setDraftIntent(null);
      setDraftOptions(null);
    } catch (e: any) {
      if ((e as any)?.details?.type === 'crisis') {
        Alert.alert(
          '話を聞いてもらえる場所があります',
          'いまとても辛い状況かもしれません。\n\nよりそいホットライン\n0120-279-338（24時間・無料）\n\nかかりつけの人や信頼できる人に話すことも一つの方法です。',
          [{ text: '閉じる' }]
        );
      } else {
        Alert.alert('エラー', firebaseErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleCollapse(id: string) {
    setConversation((prev) => prev.map((t) => t.id === id ? { ...t, collapsed: !t.collapsed } : t));
  }

  function handleStartNewConversation() {
    const reset = () => {
      setConversation([]);
      setSessionId(null);
      setIsFavorited(false);
      setText('');
      resetDraftState();
    };

    if (conversation.length > 0 && !isFavorited) {
      Alert.alert(
        '新しく始めますか？',
        'いまの会話はお気に入りに保存されていません。新しく始めると消えます',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '新しく始める', style: 'destructive', onPress: reset },
        ]
      );
    } else {
      reset();
    }
  }

  function handleResumeSession(session: ConsultationSession) {
    const doResume = () => {
      const restored: ConversationTurn[] = session.turns.map((turn, i) => ({
        id: `${session.id}-${i}`,
        input: turn.input,
        reflection: turn.reflection,
        legacyMessageDraft: turn.messageDraft,
        collapsed: true,
      }));
      setConversation(restored);
      setSessionId(session.id ?? null);
      setIsFavorited(session.favored);
      setText('');
      resetDraftState();
      if (session.lastDraft) {
        setDraftIntent(session.lastDraft.intent);
        setGeneratedDraft(session.lastDraft.messageDraft);
      }
    };

    if (conversation.length > 0) {
      Alert.alert(
        '進行中の会話があります',
        '現在の会話を破棄して、このセッションを再開しますか？',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '再開する', style: 'destructive', onPress: doResume },
        ]
      );
    } else {
      doResume();
    }
  }

  async function handleToggleFavorite() {
    if (!user || !sessionId) return;
    setTogglingFavorite(true);
    try {
      await toggleSessionFavorite(user.uid, sessionId, !isFavorited);
      setIsFavorited(!isFavorited);
      await load();
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setTogglingFavorite(false);
    }
  }

  async function handleToggleSessionFavorite(session: ConsultationSession) {
    if (!user || !session.id) return;
    try {
      await toggleSessionFavorite(user.uid, session.id, !session.favored);
      setRecentSessions((prev) =>
        prev.map((s) => s.id === session.id ? { ...s, favored: !s.favored } : s)
      );
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    }
  }

  function handleDeleteSession(session: ConsultationSession) {
    if (!user || !session.id) return;
    Alert.alert(
      'この記録を削除しますか？',
      '削除すると元に戻せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteConsultationSession(user.uid, session.id!);
              setRecentSessions((prev) => prev.filter((s) => s.id !== session.id));
            } catch (e: any) {
              Alert.alert('エラー', firebaseErrorMessage(e));
            }
          },
        },
      ]
    );
  }

  function useAsPost(messageDraft: string, sourceSessionId?: string) {
    router.push({
      pathname: '/(app)/post',
      params: {
        memo: messageDraft,
        ...(sourceSessionId ? { sourceConsultationSessionId: sourceSessionId } : {}),
      },
    });
  }

  async function openDraftOptions() {
    if (!sessionId || draftOptionsLoading || draftLoading) return;
    setOptionsModalOpen(true);
    if (draftOptions) return;

    setDraftOptionsLoading(true);
    try {
      const res = await aiDraftOptions(sessionId, partnerName);
      setDraftOptions(res.options);
      setDraftSummary(res.summary ?? null);
      if (!customIntent && res.summary) setCustomIntent(res.summary);
    } catch (e: any) {
      setOptionsModalOpen(false);
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setDraftOptionsLoading(false);
    }
  }

  async function generateDraft(intent: string) {
    if (!sessionId) return;
    const trimmed = intent.trim();
    if (!trimmed) return;
    setOptionsModalOpen(false);
    setDraftIntent(trimmed);
    setDraftLoading(true);
    try {
      const res = await aiDraft(sessionId, trimmed, partnerName);
      setGeneratedDraft(res.messageDraft);
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setDraftLoading(false);
    }
  }

  function handleSelectOption(option: DraftOption) {
    generateDraft(`${option.label}：${option.description}`);
  }

  function handleSubmitCustomIntent() {
    if (!customIntent.trim()) return;
    const intent = customIntent.trim();
    setCustomIntent('');
    generateDraft(intent);
  }

  function handleRegenerateDraft() {
    if (!draftIntent) return;
    generateDraft(draftIntent);
  }

  return {
    text, setText,
    partnerName,
    conversation,
    sessionId,
    isFavorited,
    loading,
    recentSessions,
    expandedSessionId, setExpandedSessionId,
    togglingFavorite,
    optionsModalOpen, setOptionsModalOpen,
    draftOptions,
    draftOptionsLoading,
    draftSummary,
    customIntent, setCustomIntent,
    draftLoading,
    draftIntent,
    generatedDraft,
    MAX_TURNS,
    MAX_CUSTOM_INTENT,
    handleConsult,
    toggleCollapse,
    handleStartNewConversation,
    handleResumeSession,
    handleToggleFavorite,
    handleToggleSessionFavorite,
    handleDeleteSession,
    useAsPost,
    openDraftOptions,
    handleSelectOption,
    handleSubmitCustomIntent,
    handleRegenerateDraft,
  };
}
