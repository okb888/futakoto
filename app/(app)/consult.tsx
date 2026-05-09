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
  Modal,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, Sparkle, Star, X } from 'phosphor-react-native';
import { useAuth } from '../../lib/auth';
import { aiConsult, aiDraft, aiDraftOptions, DraftOption } from '../../lib/ai';
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
import { formatShortDate } from '../../lib/format';
import { getPartnerDisplayName } from '../../lib/profile';
import { COLORS } from '../../lib/theme';

const MAX_TURNS = 10;
const MAX_CUSTOM_INTENT = 200;

type ConversationTurn = {
  id: string;
  input: string;
  reflection: string;
  /** 旧スキーマの per-turn 文案。新規ターンには付かない */
  legacyMessageDraft?: string;
  collapsed: boolean;
};

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

  const [readyForDraft, setReadyForDraft] = useState(false);

  // 文案生成（新フロー）
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [draftOptions, setDraftOptions] = useState<DraftOption[] | null>(null);
  const [draftOptionsLoading, setDraftOptionsLoading] = useState(false);
  const [customIntent, setCustomIntent] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftIntent, setDraftIntent] = useState<string | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);

  const tooShort = text.trim().length > 0 && text.trim().length < 50;

  async function load(isCancelled: () => boolean = () => false) {
    if (!user) return;
    const profile = authProfile ?? await refreshProfile();
    if (isCancelled() || !profile) return;
    setCommunicationStyle(profile.communicationStyle ?? undefined);
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
    return () => {
      cancelled = true;
    };
  }, [user, authProfile, focusSessionId]));

  function resetDraftState() {
    setDraftOptions(null);
    setDraftOptionsLoading(false);
    setOptionsModalOpen(false);
    setCustomIntent('');
    setDraftLoading(false);
    setDraftIntent(null);
    setGeneratedDraft(null);
    setReadyForDraft(false);
  }

  async function handleConsult() {
    if (!user || !text.trim() || conversation.length >= MAX_TURNS) return;

    const currentInput = text.trim();
    setLoading(true);

    try {
      const nextResult = await aiConsult(currentInput, partnerName, sessionId, communicationStyle);
      const sessionTurn = {
        input: currentInput,
        reflection: nextResult.reflection,
      };

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
          reflection: nextResult.reflection,
          collapsed: false,
        },
      ]);
      setText('');
      // 会話に新しいターンが入ったので前回の文案はリセット
      setGeneratedDraft(null);
      setDraftIntent(null);
      setDraftOptions(null);
      if (nextResult.readyForDraft) setReadyForDraft(true);
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
      // セッションに保存された最後の文案があれば復元
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

  async function openDraftOptions() {
    if (!sessionId || draftOptionsLoading || draftLoading) return;
    setOptionsModalOpen(true);
    if (draftOptions) return; // 同じ会話のままなら使い回し

    setDraftOptionsLoading(true);
    try {
      const res = await aiDraftOptions(sessionId, partnerName);
      setDraftOptions(res.options);
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
      const res = await aiDraft(sessionId, trimmed, partnerName, communicationStyle);
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>壁打ち</Text>

        {/* 今の会話 */}
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
                      <Text style={styles.cardText}>{turn.reflection}</Text>
                    </View>
                    {turn.legacyMessageDraft ? (
                      <View style={styles.partnerDraftCard}>
                        <Text style={styles.partnerDraftLabel}>{partnerName}に伝える文（旧）</Text>
                        <Text style={styles.cardText}>{turn.legacyMessageDraft}</Text>
                        <TouchableOpacity
                          style={styles.usePostButton}
                          onPress={() => useAsPost(turn.legacyMessageDraft!, sessionId ?? undefined)}
                        >
                          <ArrowRight size={13} color={COLORS.primary} weight="bold" />
                          <Text style={styles.usePostButtonText}>投稿に使う</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            ))}

            {/* セッション全体に対する文案セクション */}
            <View style={styles.draftSection}>
              {generatedDraft ? (
                <>
                  <View style={styles.partnerDraftCard}>
                    {draftIntent ? (
                      <Text style={styles.partnerDraftLabel}>{draftIntent}</Text>
                    ) : null}
                    <Text style={styles.cardText}>{generatedDraft}</Text>
                  </View>
                  <View style={styles.draftActions}>
                    <TouchableOpacity
                      style={styles.secondaryActionButton}
                      onPress={openDraftOptions}
                      disabled={draftLoading}
                    >
                      <Text style={styles.secondaryActionText}>別の伝え方</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryActionButton}
                      onPress={handleRegenerateDraft}
                      disabled={draftLoading}
                    >
                      <Text style={styles.secondaryActionText}>もう一度作る</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.primaryActionButton}
                      onPress={() => useAsPost(generatedDraft, sessionId ?? undefined)}
                      disabled={draftLoading}
                    >
                      <ArrowRight size={13} color="#fff" weight="bold" />
                      <Text style={styles.primaryActionText}>投稿に使う</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : draftLoading ? (
                <View style={styles.inlineLoading}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.loadingText}>{partnerName}に伝える文を作っています...</Text>
                </View>
              ) : sessionId ? (
                <>
                  {readyForDraft && (
                    <Text style={styles.readyForDraftHint}>
                      気持ちが整理できてきました。メッセージにしてみませんか？
                    </Text>
                  )}
                  <TouchableOpacity
                    style={[styles.makeDraftButton, readyForDraft && styles.makeDraftButtonReady]}
                    onPress={openDraftOptions}
                    disabled={draftOptionsLoading}
                  >
                    <Sparkle size={14} color={COLORS.ai} weight="fill" />
                    <Text style={styles.makeDraftButtonText}>
                      この会話を{partnerName}に伝える文にする
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>

            {/* お気に入り＋新しく始める */}
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
            <Sparkle size={16} color={COLORS.ai} weight="fill" />
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
                <ActivityIndicator color={COLORS.ai} />
              ) : (
                <>
                  <Sparkle size={16} color={COLORS.ai} weight="fill" />
                  <Text style={styles.aiButtonText}>
                    {conversation.length === 0 ? 'AIと壁打ちする' : 'さらに深める'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {loading && (
              <View style={styles.loadingCard}>
                <ActivityIndicator color={COLORS.primary} />
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
                      <Text style={styles.sessionDate}>{formatShortDate(session.createdAt)}</Text>
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
                          {turn.messageDraft ? (
                            <View style={styles.partnerDraftCard}>
                              <Text style={styles.partnerDraftLabel}>{partnerName}に伝える文（旧）</Text>
                              <Text style={styles.cardText}>{turn.messageDraft}</Text>
                              <TouchableOpacity
                                style={styles.usePostButton}
                                onPress={() => useAsPost(turn.messageDraft!, session.id)}
                              >
                                <ArrowRight size={13} color={COLORS.primary} weight="bold" />
                                <Text style={styles.usePostButtonText}>投稿に使う</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                      ))}
                      {session.lastDraft ? (
                        <View style={styles.sessionLastDraft}>
                          <Text style={styles.partnerDraftLabel}>
                            最新の文案（{session.lastDraft.intent}）
                          </Text>
                          <Text style={styles.cardText}>{session.lastDraft.messageDraft}</Text>
                          <TouchableOpacity
                            style={styles.usePostButton}
                            onPress={() => useAsPost(session.lastDraft!.messageDraft, session.id)}
                          >
                            <ArrowRight size={13} color={COLORS.primary} weight="bold" />
                            <Text style={styles.usePostButtonText}>投稿に使う</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* 伝え方の選択モーダル */}
      <Modal
        visible={optionsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setOptionsModalOpen(false)}
          />
          <View style={styles.optionsSheet}>
            <View style={styles.optionsHeader}>
              <View style={styles.modalTitleRow}>
                <Sparkle size={16} color={COLORS.ai} weight="fill" />
                <Text style={styles.optionsTitle}>伝え方を選ぶ</Text>
              </View>
              <TouchableOpacity onPress={() => setOptionsModalOpen(false)} hitSlop={8}>
                <X size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.optionsSub}>
              会話を踏まえて、AIが3つの伝え方を提案します。自由記述もできます。
            </Text>

            {draftOptionsLoading ? (
              <View style={styles.optionsLoading}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>選択肢を考えています...</Text>
              </View>
            ) : (
              <>
                {draftOptions?.map((option, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.optionCard}
                    onPress={() => handleSelectOption(option)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    <Text style={styles.optionDescription}>{option.description}</Text>
                  </TouchableOpacity>
                ))}

                <View style={styles.customIntentArea}>
                  <Text style={styles.customIntentLabel}>または自由に指定</Text>
                  <TextInput
                    style={styles.customIntentInput}
                    placeholder="例: 仕事で疲れていることを伝えたい"
                    placeholderTextColor="#BBB"
                    value={customIntent}
                    onChangeText={setCustomIntent}
                    maxLength={MAX_CUSTOM_INTENT}
                    multiline
                  />
                  <TouchableOpacity
                    style={[
                      styles.customIntentButton,
                      !customIntent.trim() && styles.customIntentButtonDisabled,
                    ]}
                    onPress={handleSubmitCustomIntent}
                    disabled={!customIntent.trim()}
                  >
                    <Text style={styles.customIntentButtonText}>この内容で文を作る</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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

  // 文案セクション
  draftSection: { gap: 10, marginTop: 4 },
  readyForDraftHint: { fontSize: 12, color: COLORS.ai, lineHeight: 17, marginBottom: 2 },
  makeDraftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.aiBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  makeDraftButtonReady: {
    borderWidth: 1.5,
    borderColor: COLORS.ai,
  },
  makeDraftButtonText: { fontSize: 13, color: COLORS.ai, fontWeight: '700' },
  draftActions: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 'auto',
  },
  primaryActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  secondaryActionButton: {
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  secondaryActionText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },

  sessionFavoriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingVertical: 4,
    marginTop: 8,
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
  inlineLoading: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 10,
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
  sessionLastDraft: {
    marginTop: 14,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    padding: 14,
  },

  // 選択モーダル
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(45,45,45,0.24)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionsSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    gap: 12,
  },
  optionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionsTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  optionsSub: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  optionsLoading: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.aiBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  optionLabel: { fontSize: 13, color: COLORS.ai, fontWeight: '700' },
  optionDescription: { fontSize: 12, color: COLORS.textBody, lineHeight: 17 },
  customIntentArea: { marginTop: 8, gap: 8 },
  customIntentLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  customIntentInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 60,
  },
  customIntentButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  customIntentButtonDisabled: {
    backgroundColor: COLORS.primaryDim,
  },
  customIntentButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
