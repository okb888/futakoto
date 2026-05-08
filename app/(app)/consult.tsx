import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, Sparkle, Star } from 'phosphor-react-native';
import { useAuth } from '../../lib/auth';
import { aiConsult, ConsultResult } from '../../lib/ai';
import {
  createConsultationSession,
  addTurnToSession,
  toggleSessionFavorite,
  getConsultationSession,
  getRecentConsultationSessions,
  ConsultationSession,
  getUserProfile,
} from '../../lib/db';
import { firebaseErrorMessage } from '../../lib/errors';
import { COLORS } from '../../lib/theme';

const MAX_TURNS = 10;

type ConversationTurn = {
  id: string;
  input: string;
  result: ConsultResult;
  collapsed: boolean;
};

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ConsultScreen() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const focusSessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
  const [text, setText] = useState('');
  const [partnerName, setPartnerName] = useState('パートナー');
  const [communicationStyle, setCommunicationStyle] = useState<string | undefined>(undefined);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentSessions, setRecentSessions] = useState<ConsultationSession[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  const tooShort = text.trim().length > 0 && text.trim().length < 50;

  async function load(isCancelled: () => boolean = () => false) {
    if (!user) return;
    const profile = authProfile ?? await refreshProfile();
    if (isCancelled() || !profile) return;
    setCommunicationStyle(profile.communicationStyle ?? undefined);
    if (profile.partnerUid) {
      const partner = await getUserProfile(profile.partnerUid);
      if (isCancelled()) return;
      if (partner) setPartnerName(partner.displayName ?? partner.email?.split('@')[0] ?? 'パートナー');
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
    return () => {
      cancelled = true;
    };
  }, [user, authProfile, focusSessionId]));

  async function handleConsult() {
    if (!user || !text.trim() || conversation.length >= MAX_TURNS) return;

    const currentInput = text.trim();
    setLoading(true);

    try {
      const history = conversation.flatMap((t) => [
        { role: 'user' as const, content: t.input },
        { role: 'ai' as const, content: `${t.result.reflection}（文案: 「${t.result.messageDraft}」）` },
      ]);

      const nextResult = await aiConsult(currentInput, partnerName, history, communicationStyle);
      const sessionTurn = { input: currentInput, reflection: nextResult.reflection, messageDraft: nextResult.messageDraft };

      if (!sessionId) {
        const newId = await createConsultationSession(user.uid, sessionTurn);
        setSessionId(newId);
      } else {
        await addTurnToSession(user.uid, sessionId, sessionTurn);
      }

      setConversation((prev) => [
        ...prev.map((t) => ({ ...t, collapsed: true })),
        { id: Date.now().toString(), input: currentInput, result: nextResult, collapsed: false },
      ]);
      setText('');
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleCollapse(id: string) {
    setConversation((prev) => prev.map((t) => t.id === id ? { ...t, collapsed: !t.collapsed } : t));
  }

  function handleStartNewConversation() {
    setConversation([]);
    setSessionId(null);
    setIsFavorited(false);
    setText('');
  }

  function handleResumeSession(session: ConsultationSession) {
    const doResume = () => {
      const restored: ConversationTurn[] = session.turns.map((turn, i) => ({
        id: `${session.id}-${i}`,
        input: turn.input,
        result: { reflection: turn.reflection, messageDraft: turn.messageDraft },
        collapsed: true,
      }));
      setConversation(restored);
      setSessionId(session.id ?? null);
      setIsFavorited(session.favored);
      setText('');
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
      setRecentSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, favored: !s.favored } : s));
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    }
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>壁打ち</Text>

        {/* 今の会話: 過去ターン（折りたたみ）*/}
        {conversation.length > 0 && (
          <View style={styles.conversationArea}>
            {conversation.map((turn, i) => (
              <View key={turn.id} style={styles.turnCard}>
                <TouchableOpacity
                  style={styles.turnHeader}
                  onPress={() => toggleCollapse(turn.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.turnBadge}>
                    <Text style={styles.turnBadgeText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.turnPreview} numberOfLines={turn.collapsed ? 1 : undefined}>
                    {turn.input}
                  </Text>
                  <Text style={styles.collapseToggle}>{turn.collapsed ? '▼' : '▲'}</Text>
                </TouchableOpacity>

                {!turn.collapsed && (
                  <View style={styles.turnBody}>
                    <View style={styles.aiCard}>
                      <Text style={styles.aiCardLabel}>整理メモ</Text>
                      <Text style={styles.cardText}>{turn.result.reflection}</Text>
                    </View>
                    <View style={styles.partnerDraftCard}>
                      <Text style={styles.partnerDraftLabel}>{partnerName}に伝える文</Text>
                      <Text style={styles.cardText}>{turn.result.messageDraft}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.usePostButton}
                      onPress={() => useAsPost(turn.result.messageDraft, sessionId ?? undefined)}
                    >
                      <ArrowRight size={13} color="#7B9E87" weight="bold" />
                      <Text style={styles.usePostButtonText}>投稿に使う</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}

            {/* お気に入りボタン（セッション全体） */}
            <View style={styles.sessionFavoriteRow}>
              <Text style={styles.sessionFavoriteHint}>この会話を保存</Text>
              <TouchableOpacity
                onPress={handleToggleFavorite}
                disabled={togglingFavorite || !sessionId}
                hitSlop={8}
              >
                <Star
                  size={22}
                  color={isFavorited ? COLORS.primary : COLORS.textWeak}
                  weight={isFavorited ? 'fill' : 'regular'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.newConversationButton}
                onPress={handleStartNewConversation}
                activeOpacity={0.7}
              >
                <Text style={styles.newConversationButtonText}>新しく始める</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 入力エリアまたは上限メッセージ */}
        {conversation.length >= MAX_TURNS ? (
          <View style={styles.limitCard}>
            <Sparkle size={16} color="#7C5BB7" weight="fill" />
            <Text style={styles.limitText}>
              十分に話し合えました。会話をお気に入りに保存して、気持ちをふたりの記録に残しましょう。
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.lead}>
              {conversation.length === 0 ? '今、頭の中にあること' : '続けて話す'}
            </Text>
            <TextInput
              style={[styles.input, conversation.length > 0 && styles.inputCompact]}
              placeholder={
                conversation.length === 0
                  ? '相手のこと、自分のこと、まだ言葉になっていない気持ちをそのまま書いてください'
                  : '続きを話してください'
              }
              placeholderTextColor="#BBB"
              value={text}
              onChangeText={setText}
              multiline
              numberOfLines={conversation.length === 0 ? 6 : 4}
              textAlignVertical="top"
            />
            {tooShort ? (
              <Text style={styles.shortHint}>もう少し詳しく書くと、AIがより深く整理できます（目安50文字〜）</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.aiButton, (!text.trim() || loading) && styles.aiButtonDisabled]}
              onPress={handleConsult}
              disabled={!text.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator color="#7C5BB7" />
              ) : (
                <>
                  <Sparkle size={16} color="#7C5BB7" weight="fill" />
                  <Text style={styles.aiButtonText}>
                    {conversation.length === 0 ? 'AIと壁打ちする' : 'さらに深める'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {loading && (
              <View style={styles.loadingCard}>
                <ActivityIndicator color="#7B9E87" />
                <Text style={styles.loadingText}>気持ちを整理しています...</Text>
              </View>
            )}
          </>
        )}

        {/* 過去の記録 */}
        <Text style={styles.lead}>過去の記録</Text>

        {recentSessions.length === 0 ? (
          <Text style={styles.empty}>まだ記録がありません</Text>
        ) : (
          <View style={styles.sessionList}>
            {recentSessions.map((session) => {
              const isExpanded = expandedSessionId === session.id;
              const firstInput = session.turns[0]?.input ?? '';
              return (
                <View key={session.id} style={styles.sessionCard}>
                  <TouchableOpacity
                    style={styles.sessionHeader}
                    onPress={() => setExpandedSessionId(isExpanded ? null : (session.id ?? null))}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sessionHeaderLeft}>
                      <Text style={styles.sessionDate}>{formatDate(session.createdAt)}</Text>
                      <Text style={styles.sessionPreview} numberOfLines={1}>{firstInput}</Text>
                    </View>
                    <View style={styles.sessionHeaderRight}>
                      <Text style={styles.sessionTurnsLabel}>{session.turns.length}往復</Text>
                      <TouchableOpacity
                        style={styles.resumeButton}
                        onPress={() => handleResumeSession(session)}
                        hitSlop={6}
                      >
                        <Text style={styles.resumeButtonText}>続きから話す</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleToggleSessionFavorite(session)}
                        hitSlop={8}
                      >
                        <Star
                          size={16}
                          color={session.favored ? COLORS.primary : COLORS.disabled}
                          weight={session.favored ? 'fill' : 'regular'}
                        />
                      </TouchableOpacity>
                      <Text style={styles.collapseToggle}>{isExpanded ? '▲' : '▼'}</Text>
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.sessionBody}>
                      {session.turns.map((turn, i) => (
                        <View key={i} style={styles.sessionTurnItem}>
                          <View style={styles.sessionTurnHeader}>
                            <View style={styles.turnBadge}>
                              <Text style={styles.turnBadgeText}>{i + 1}</Text>
                            </View>
                            <Text style={styles.sessionTurnInput}>{turn.input}</Text>
                          </View>
                          <View style={styles.aiCard}>
                            <Text style={styles.aiCardLabel}>整理メモ</Text>
                            <Text style={styles.cardText}>{turn.reflection}</Text>
                          </View>
                          <View style={styles.partnerDraftCard}>
                            <Text style={styles.partnerDraftLabel}>{partnerName}に伝える文</Text>
                            <Text style={styles.cardText}>{turn.messageDraft}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.usePostButton}
                            onPress={() => useAsPost(turn.messageDraft, session.id)}
                          >
                            <ArrowRight size={13} color="#7B9E87" weight="bold" />
                            <Text style={styles.usePostButtonText}>投稿に使う</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24, paddingBottom: 64 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  lead: { fontSize: 14, fontWeight: '600', color: COLORS.textSubtle, marginTop: 20, marginBottom: 12 },

  // 今の会話
  conversationArea: { gap: 8, marginBottom: 4 },
  turnCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.ai,
    overflow: 'hidden',
  },
  turnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  turnBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.aiBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  turnBadgeText: { fontSize: 11, color: COLORS.ai, fontWeight: '700' },
  turnPreview: { flex: 1, fontSize: 13, color: COLORS.textSubtle, lineHeight: 19 },
  collapseToggle: { fontSize: 10, color: COLORS.textMuted },
  turnBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: COLORS.aiDivider },
  sessionFavoriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingVertical: 4,
  },
  sessionFavoriteHint: { fontSize: 12, color: COLORS.textWeak },
  newConversationButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fff',
  },
  newConversationButtonText: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },

  // 入力エリア
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    minHeight: 150,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
  },
  inputCompact: { minHeight: 100 },
  shortHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 8, lineHeight: 18 },
  aiButton: {
    marginTop: 14,
    backgroundColor: COLORS.aiBg,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  aiButtonDisabled: { opacity: 0.5 },
  aiButtonText: { color: COLORS.ai, fontSize: 14, fontWeight: '700' },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.aiDivider,
  },
  loadingText: { fontSize: 13, color: COLORS.textMuted },
  limitCard: {
    backgroundColor: COLORS.aiBg,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
  },
  limitText: { flex: 1, fontSize: 13, color: COLORS.ai, lineHeight: 20 },

  // AIカード（紫: AIとの対話）
  aiCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.aiBorder,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.ai,
    padding: 14,
    marginTop: 10,
  },
  aiCardLabel: { fontSize: 11, color: COLORS.ai, fontWeight: '700', marginBottom: 6 },

  // パートナーへの文カード（セージ: パートナーとの対話）
  partnerDraftCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    padding: 14,
    marginTop: 10,
  },
  partnerDraftLabel: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginBottom: 6 },

  cardText: { fontSize: 14, color: COLORS.text, lineHeight: 21 },
  usePostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 4,
  },
  usePostButtonText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },

  // 過去の記録
  empty: { textAlign: 'center', color: COLORS.placeholder, fontSize: 13, paddingVertical: 20 },
  sessionList: { gap: 10 },
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.ai,
    overflow: 'hidden',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  sessionHeaderLeft: { flex: 1, gap: 3 },
  sessionDate: { fontSize: 11, color: COLORS.textMuted },
  sessionPreview: { fontSize: 13, color: COLORS.textBody, lineHeight: 19 },
  sessionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionTurnsLabel: { fontSize: 11, color: COLORS.ai, fontWeight: '700' },
  resumeButton: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resumeButtonText: { fontSize: 11, color: COLORS.primaryDeep, fontWeight: '700' },
  sessionBody: { borderTopWidth: 1, borderTopColor: COLORS.aiDivider, paddingHorizontal: 14, paddingBottom: 14 },
  sessionTurnItem: { marginTop: 14 },
  sessionTurnHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  sessionTurnInput: { flex: 1, fontSize: 13, color: COLORS.textSubtle, lineHeight: 19 },
});
