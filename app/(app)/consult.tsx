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
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowRight, BookmarkSimple, Sparkle } from 'phosphor-react-native';
import { useAuth } from '../../lib/auth';
import { aiConsult, ConsultResult } from '../../lib/ai';
import {
  addConsultation,
  Consultation,
  createUserProfile,
  getRecentConsultations,
  getUserProfile,
} from '../../lib/db';

const MAX_TURNS = 10;

type ConversationTurn = {
  id: string;
  input: string;
  result: ConsultResult;
  collapsed: boolean;
  saved: boolean;
};

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ConsultScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [text, setText] = useState('');
  const [partnerName, setPartnerName] = useState('パートナー');
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [recent, setRecent] = useState<Consultation[]>([]);

  const tooShort = text.trim().length > 0 && text.trim().length < 50;

  async function load() {
    if (!user) return;
    const profile = await createUserProfile(user.uid, user.email ?? '');
    if (profile.partnerUid) {
      const partner = await getUserProfile(profile.partnerUid);
      if (partner) setPartnerName(partner.displayName ?? partner.email?.split('@')[0] ?? 'パートナー');
    }
    const consultations = await getRecentConsultations(user.uid, 5);
    setRecent(consultations);
  }

  useFocusEffect(useCallback(() => {
    load();
    setConversation([]);
    setText('');
  }, [user]));

  async function handleConsult() {
    if (!text.trim() || conversation.length >= MAX_TURNS) return;

    const currentInput = text.trim();
    setLoading(true);

    try {
      const history = conversation.flatMap((t) => [
        { role: 'user' as const, content: t.input },
        { role: 'ai' as const, content: t.result.reflection },
      ]);

      const nextResult = await aiConsult(currentInput, partnerName, history);

      setConversation((prev) => [
        ...prev.map((t) => ({ ...t, collapsed: true })),
        { id: Date.now().toString(), input: currentInput, result: nextResult, collapsed: false, saved: false },
      ]);
      setText('');
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleCollapse(id: string) {
    setConversation((prev) => prev.map((t) => t.id === id ? { ...t, collapsed: !t.collapsed } : t));
  }

  async function saveTurn(turn: ConversationTurn) {
    if (!user) return;
    setSavingId(turn.id);
    try {
      await addConsultation(user.uid, turn.input, turn.result.reflection, turn.result.messageDraft);
      setConversation((prev) => prev.map((t) => t.id === turn.id ? { ...t, saved: true } : t));
      await load();
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setSavingId(null);
    }
  }

  function useAsPost(messageDraft: string) {
    router.push({ pathname: '/(app)/post', params: { memo: messageDraft } });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>壁打ち</Text>

        {/* 過去のターン（折りたたみ） */}
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
                      <Text style={styles.cardLabel}>整理メモ</Text>
                      <Text style={styles.cardText}>{turn.result.reflection}</Text>
                    </View>
                    <View style={styles.aiCard}>
                      <Text style={styles.cardLabel}>{partnerName}に伝える文</Text>
                      <Text style={styles.cardText}>{turn.result.messageDraft}</Text>
                    </View>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => useAsPost(turn.result.messageDraft)}
                      >
                        <ArrowRight size={15} color="#fff" weight="bold" />
                        <Text style={styles.primaryButtonText}>投稿に使う</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.secondaryButton, turn.saved && styles.secondaryButtonDisabled]}
                        onPress={() => saveTurn(turn)}
                        disabled={savingId === turn.id || turn.saved}
                      >
                        {savingId === turn.id ? (
                          <ActivityIndicator color="#7B9E87" size="small" />
                        ) : (
                          <>
                            <BookmarkSimple size={15} color="#7B9E87" weight={turn.saved ? 'fill' : 'regular'} />
                            <Text style={styles.secondaryButtonText}>{turn.saved ? '保存済み' : '保存する'}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* 入力エリアまたは上限メッセージ */}
        {conversation.length >= MAX_TURNS ? (
          <View style={styles.limitCard}>
            <Sparkle size={16} color="#7C5BB7" weight="fill" />
            <Text style={styles.limitText}>
              十分に話し合えました。整理メモを保存して、気持ちをふたりの記録に残しましょう。
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

        {/* 最近の記録 */}
        <View style={styles.historyHeader}>
          <Text style={styles.lead}>最近の記録</Text>
        </View>

        {recent.length === 0 ? (
          <Text style={styles.empty}>保存した記録はまだありません</Text>
        ) : (
          <View style={styles.historyList}>
            {recent.map((item) => (
              <View key={item.id} style={styles.historyCard}>
                <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
                <Text style={styles.historyText} numberOfLines={2}>{item.reflection}</Text>
                <TouchableOpacity
                  style={styles.historyAction}
                  onPress={() => useAsPost(item.messageDraft)}
                >
                  <Text style={styles.historyActionText}>投稿に使う</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { padding: 24, paddingBottom: 64 },
  title: { fontSize: 18, fontWeight: '700', color: '#2D2D2D', marginBottom: 8 },
  lead: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 20, marginBottom: 12 },
  conversationArea: { gap: 8, marginBottom: 4 },
  turnCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#7C5BB7',
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
    backgroundColor: '#F3EDFA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  turnBadgeText: { fontSize: 11, color: '#7C5BB7', fontWeight: '700' },
  turnPreview: { flex: 1, fontSize: 13, color: '#555', lineHeight: 19 },
  collapseToggle: { fontSize: 10, color: '#7C5BB7' },
  turnBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#F0EAF8' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    minHeight: 150,
    fontSize: 15,
    lineHeight: 22,
    color: '#2D2D2D',
  },
  inputCompact: { minHeight: 100 },
  shortHint: { fontSize: 12, color: '#888', marginTop: 8, lineHeight: 18 },
  aiButton: {
    marginTop: 14,
    backgroundColor: '#F3EDFA',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  aiButtonDisabled: { opacity: 0.5 },
  aiButtonText: { color: '#7C5BB7', fontSize: 14, fontWeight: '700' },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F0EAF8',
  },
  loadingText: { fontSize: 13, color: '#888' },
  aiCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E0F2',
    borderLeftWidth: 3,
    borderLeftColor: '#7C5BB7',
    padding: 14,
    marginTop: 10,
  },
  cardLabel: { fontSize: 11, color: '#7C5BB7', fontWeight: '700', marginBottom: 6 },
  cardText: { fontSize: 14, color: '#2D2D2D', lineHeight: 21 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  primaryButton: {
    flex: 1,
    backgroundColor: '#7B9E87',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7B9E87',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  secondaryButtonDisabled: { opacity: 0.6 },
  secondaryButtonText: { color: '#7B9E87', fontSize: 13, fontWeight: '700' },
  limitCard: {
    backgroundColor: '#F3EDFA',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
  },
  limitText: { flex: 1, fontSize: 13, color: '#7C5BB7', lineHeight: 20 },
  historyHeader: { marginTop: 12 },
  empty: { textAlign: 'center', color: '#BBB', fontSize: 13, paddingVertical: 20 },
  historyList: { gap: 10 },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#7C5BB7',
    padding: 16,
  },
  historyDate: { fontSize: 11, color: '#888', marginBottom: 6 },
  historyText: { fontSize: 14, color: '#444', lineHeight: 20 },
  historyAction: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  historyActionText: { fontSize: 12, color: '#7B9E87', fontWeight: '700' },
});
