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
  const [result, setResult] = useState<ConsultResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recent, setRecent] = useState<Consultation[]>([]);

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

  useFocusEffect(useCallback(() => { load(); }, [user]));

  async function handleConsult() {
    if (!text.trim()) {
      Alert.alert('相談内容を書いてください', 'まだ言葉になっていない状態でも大丈夫です');
      return;
    }
    setLoading(true);
    setSaved(false);
    try {
      const nextResult = await aiConsult(text, partnerName);
      setResult(nextResult);
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrent() {
    if (!user || !result) return;
    setSaving(true);
    try {
      await addConsultation(user.uid, text, result.reflection, result.messageDraft);
      setSaved(true);
      await load();
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setSaving(false);
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
        <Text style={styles.title}>相談</Text>
        <Text style={styles.lead}>今、整理したいこと</Text>

        <TextInput
          style={styles.input}
          placeholder="いま困っていること、思っていること、まだ言葉になっていない気持ちをそのまま書いてください"
          placeholderTextColor="#BBB"
          value={text}
          onChangeText={(v) => {
            setText(v);
            setSaved(false);
          }}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

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
              <Text style={styles.aiButtonText}>AIと整理する</Text>
            </>
          )}
        </TouchableOpacity>

        {(loading || result) ? (
          <View style={styles.resultSection}>
            <View style={styles.sectionHeader}>
              <Sparkle size={16} color="#7C5BB7" weight="fill" />
              <Text style={styles.sectionTitle}>AIの整理</Text>
            </View>

            {loading ? (
              <View style={styles.loadingCard}>
                <ActivityIndicator color="#7B9E87" />
                <Text style={styles.loadingText}>気持ちを整理しています...</Text>
              </View>
            ) : result ? (
              <>
                <View style={styles.aiCard}>
                  <Text style={styles.cardLabel}>整理メモ</Text>
                  <Text style={styles.cardText}>{result.reflection}</Text>
                </View>

                <View style={styles.aiCard}>
                  <Text style={styles.cardLabel}>{partnerName}に伝える文</Text>
                  <Text style={styles.cardText}>{result.messageDraft}</Text>
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.primaryButton} onPress={() => useAsPost(result.messageDraft)}>
                    <ArrowRight size={15} color="#fff" weight="bold" />
                    <Text style={styles.primaryButtonText}>投稿に使う</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryButton, saved && styles.secondaryButtonDisabled]}
                    onPress={saveCurrent}
                    disabled={saving || saved}
                  >
                    {saving ? (
                      <ActivityIndicator color="#7B9E87" />
                    ) : (
                      <>
                        <BookmarkSimple size={15} color="#7B9E87" weight={saved ? 'fill' : 'regular'} />
                        <Text style={styles.secondaryButtonText}>{saved ? '保存済み' : '自分だけに保存'}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        <View style={styles.historyHeader}>
          <Text style={styles.lead}>最近の相談</Text>
        </View>

        {recent.length === 0 ? (
          <Text style={styles.empty}>保存した相談はまだありません</Text>
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
  resultSection: {
    marginTop: 24,
    backgroundColor: '#F3EDFA',
    borderRadius: 12,
    padding: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#2D2D2D' },
  loadingCard: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 24, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: '#888' },
  aiCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E0F2',
    borderLeftWidth: 4,
    borderLeftColor: '#7C5BB7',
    padding: 16,
    marginBottom: 10,
  },
  cardLabel: { fontSize: 11, color: '#7C5BB7', fontWeight: '700', marginBottom: 6 },
  cardText: { fontSize: 14, color: '#2D2D2D', lineHeight: 21 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
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
