import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { ArrowRight, Sparkle, Star, Trash, X } from 'phosphor-react-native';
import { useConsultSession } from '../../hooks/useConsultSession';
import { formatShortDate } from '../../lib/format';
import { COLORS } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { setAiConsentAcknowledged } from '../../lib/db';
import { AiQuotaChip } from '../../components/AiQuotaChip';
import { PaywallModal } from '../../components/PaywallModal';
import { AiConsentModal } from '../../components/AiConsentModal';

export default function ConsultScreen() {
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const focusSessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
  const navigation = useNavigation();
  const { user, profile, refreshProfile } = useAuth();

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);

  const {
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
  } = useConsultSession(focusSessionId, {
    onQuotaExceeded: (message) => {
      setPaywallReason(message);
      setPaywallOpen(true);
    },
  });

  const isBlank = (s: string) => /^[\s　 ]*$/.test(s);
  const contentLength = text.replace(/[\s　 ]+/g, ' ').trim().length;
  const tooShort = contentLength > 0 && contentLength < 50;

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ marginRight: 12 }}>
          <AiQuotaChip
            profile={profile}
            onPress={() => {
              setPaywallReason(undefined);
              setPaywallOpen(true);
            }}
          />
        </View>
      ),
    });
  }, [navigation, profile]);

  // AI同意がまだなら確認モーダルを挟む
  async function ensureConsentAndConsult() {
    if (profile && profile.aiConsentAcknowledged !== true) {
      setPendingSend(true);
      setConsentOpen(true);
      return;
    }
    await handleConsult();
  }

  async function handleAgreeConsent() {
    if (!user) return;
    try {
      await setAiConsentAcknowledged(user.uid);
      await refreshProfile();
    } finally {
      setConsentOpen(false);
      if (pendingSend) {
        setPendingSend(false);
        await handleConsult();
      }
    }
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
                      <ArrowRight size={13} color={COLORS.surface} weight="bold" />
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
                  <TouchableOpacity
                    style={styles.makeDraftButton}
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
              ここまでしっかり話し合えました。続けて{partnerName}に伝える文を作るか、会話を保存して終えるか、新しく始められます。
            </Text>
            <View style={styles.limitActions}>
              {!generatedDraft ? (
                <TouchableOpacity
                  style={styles.limitPrimary}
                  onPress={openDraftOptions}
                  disabled={draftOptionsLoading || draftLoading}
                  activeOpacity={0.85}
                >
                  <Sparkle size={14} color={COLORS.surface} weight="fill" />
                  <Text style={styles.limitPrimaryText}>伝える文を作る</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.limitSecondary}
                onPress={handleToggleFavorite}
                disabled={togglingFavorite || !sessionId}
                activeOpacity={0.85}
              >
                <Star
                  size={14}
                  color={isFavorited ? COLORS.primary : COLORS.textSubtle}
                  weight={isFavorited ? 'fill' : 'regular'}
                />
                <Text style={styles.limitSecondaryText}>
                  {isFavorited ? '保存済み' : '保存して終わる'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.limitSecondary}
                onPress={handleStartNewConversation}
                activeOpacity={0.85}
              >
                <Text style={styles.limitSecondaryText}>新しく始める</Text>
              </TouchableOpacity>
            </View>
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
              placeholderTextColor="#999"
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
              style={[styles.aiButton, (isBlank(text) || loading) && styles.aiButtonDisabled]}
              onPress={ensureConsentAndConsult}
              disabled={isBlank(text) || loading}
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
                      <TouchableOpacity
                        onPress={() => handleDeleteSession(session)}
                        hitSlop={8}
                      >
                        <Trash size={15} color={COLORS.textMuted} />
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
                  <Text style={styles.customIntentLabel}>
                    {draftSummary ? 'AIがまとめた内容を確認・編集' : '伝えたいことを自由に指定'}
                  </Text>
                  <TextInput
                    style={styles.customIntentInput}
                    placeholder="例: 仕事で疲れていることを伝えたい"
                    placeholderTextColor="#999"
                    value={customIntent}
                    onChangeText={setCustomIntent}
                    maxLength={MAX_CUSTOM_INTENT}
                    multiline
                  />
                  <TouchableOpacity
                    style={[
                      styles.customIntentButton,
                      isBlank(customIntent) && styles.customIntentButtonDisabled,
                    ]}
                    onPress={handleSubmitCustomIntent}
                    disabled={isBlank(customIntent)}
                  >
                    <Text style={styles.customIntentButtonText}>この内容で文を作る</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <PaywallModal
        visible={paywallOpen}
        reason={paywallReason}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => refreshProfile()}
      />

      <AiConsentModal
        visible={consentOpen}
        onAgree={handleAgreeConsent}
        onCancel={() => {
          setConsentOpen(false);
          setPendingSend(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24, paddingBottom: 64 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  lead: { fontSize: 14, fontWeight: '600', color: COLORS.textSubtle, marginTop: 20, marginBottom: 12 },

  conversationArea: { gap: 8, marginBottom: 4 },
  turnCard: {
    backgroundColor: COLORS.surface,
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

  draftSection: { gap: 10, marginTop: 4 },
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
  primaryActionText: { color: COLORS.surface, fontSize: 12, fontWeight: '700' },
  secondaryActionButton: {
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
  },
  newConversationButtonText: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },

  input: {
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.aiDivider,
  },
  inlineLoading: {
    backgroundColor: COLORS.surface,
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
    gap: 12,
    marginTop: 8,
  },
  limitText: { fontSize: 13, color: COLORS.ai, lineHeight: 20 },
  limitActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  limitPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.ai,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  limitPrimaryText: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  limitSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  limitSecondaryText: {
    color: COLORS.textSubtle,
    fontSize: 13,
    fontWeight: '600',
  },

  aiCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.aiBorder,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.ai,
    padding: 14,
    marginTop: 10,
  },
  aiCardLabel: { fontSize: 11, color: COLORS.ai, fontWeight: '700', marginBottom: 6 },

  partnerDraftCard: {
    backgroundColor: COLORS.surface,
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

  empty: { textAlign: 'center', color: COLORS.placeholder, fontSize: 13, paddingVertical: 20 },
  sessionList: { gap: 10 },
  sessionCard: {
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
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
  customIntentButtonText: { color: COLORS.surface, fontSize: 13, fontWeight: '700' },
});
