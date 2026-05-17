import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Heart } from 'phosphor-react-native';
import { addEntry, getRecentEntries, getPartnerSharedEntries, getUserProfile, Entry, UserProfile } from '../../lib/db';
import { EntryCard } from '../../components/EntryCard';
import { PaywallModal } from '../../components/PaywallModal';
import { AiConsentModal } from '../../components/AiConsentModal';
import { useAuth } from '../../lib/auth';
import OnboardingModal from '../../components/OnboardingModal';
import { dateKey, todayKey, sortMillis } from '../../lib/format';
import { getPartnerDisplayName } from '../../lib/profile';
import { MOODS } from '../../lib/mood';
import { COLORS } from '../../lib/theme';

export default function HomeScreen() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [myTodayEntries, setMyTodayEntries] = useState<Entry[]>([]);
  const [partnerTodayEntries, setPartnerTodayEntries] = useState<Entry[]>([]);
  const [showAllMy, setShowAllMy] = useState(false);
  const [showAllPartner, setShowAllPartner] = useState(false);
  const [streak, setStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // 顔文字モーダル
  const [moodModalOpen, setMoodModalOpen] = useState(false);
  const [moodModalMood, setMoodModalMood] = useState<number | null>(null);
  const [moodModalMemo, setMoodModalMemo] = useState('');
  const [moodModalSubmitting, setMoodModalSubmitting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('hasSeenOnboarding').then((val) => {
      if (val === null) setShowOnboarding(true);
    });
  }, []);

  async function handleOnboardingDone() {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    setShowOnboarding(false);
  }

  async function load(isCancelled: () => boolean = () => false) {
    if (!user) return;
    try {
      const p = authProfile ?? await refreshProfile();
      if (isCancelled() || !p) return;
      setProfile(p);

      const myEntries = await getRecentEntries(user.uid, 60);
      if (isCancelled()) return;

      const today = todayKey();
      const todayMy = myEntries.filter((e) => dateKey(e.createdAt) === today);
      setMyTodayEntries(todayMy);

      const consecutiveDays = calcStreak(myEntries);
      setStreak(consecutiveDays);

      if (p?.partnerUid) {
        const pp = await getUserProfile(p.partnerUid);
        if (isCancelled()) return;
        setPartnerProfile(pp);
        const partnerEntries = await getPartnerSharedEntries(p.partnerUid, 60);
        if (isCancelled()) return;
        const todayPartner = partnerEntries.filter((e) => dateKey(e.createdAt) === today);
        setPartnerTodayEntries(todayPartner);
      } else {
        setPartnerProfile(null);
        setPartnerTodayEntries([]);
      }
    } catch (e: any) {
      console.error('[Home] load error:', e?.code, e?.message);
    }
  }

  function calcStreak(entries: Entry[]): number {
    const days = new Set(entries.map((e) => dateKey(e.createdAt)).filter(Boolean));
    let count = 0;
    const d = new Date();
    while (true) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!days.has(key)) break;
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [user, authProfile]));

  useEffect(() => {
    navigation.setOptions({
      title: 'ふたこと',
      headerRight: () =>
        streak > 0 ? (
          <Text style={styles.streakLabel}>{streak}日連続</Text>
        ) : null,
    });
  }, [navigation, streak]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleSubmit() {
    if (!user || selectedMood === null) return;
    setSubmitting(true);
    try {
      await addEntry(user.uid, selectedMood, memo.trim(), 'shared');
      setSelectedMood(null);
      setMemo('');
      await load();
    } catch (e: any) {
      Alert.alert('エラー', '記録できませんでした');
    } finally {
      setSubmitting(false);
    }
  }

  const isPaired = !!profile?.partnerUid;
  const partnerName = getPartnerDisplayName(partnerProfile);

  // 表示する自分の記録（折りたたみ制御）
  const myDisplayEntries = showAllMy ? myTodayEntries : myTodayEntries.slice(0, 3);
  const myHiddenCount = myTodayEntries.length - 3;

  // 表示するパートナーの記録（折りたたみ制御）
  const partnerDisplayEntries = showAllPartner ? partnerTodayEntries : partnerTodayEntries.slice(0, 3);
  const partnerHiddenCount = partnerTodayEntries.length - 3;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {isPaired ? (
          <View style={styles.connectionPill}>
            <Heart size={14} color={COLORS.partner} weight="fill" />
            <Text style={styles.connectionText}>{partnerName} と繋がっています</Text>
          </View>
        ) : (
          <View style={styles.connectionPillMuted}>
            <Text style={styles.connectionMutedText}>設定タブからパートナーと繋がろう</Text>
          </View>
        )}

        <View style={styles.inputCard}>
          <View style={styles.moodRow}>
            {MOODS.map((m) => (
              <TouchableOpacity
                key={m.score}
                style={[
                  styles.moodButton,
                  selectedMood === m.score && { backgroundColor: m.color, borderColor: m.color },
                ]}
                onPress={() => setMoodModalOpen(true)}
              >
                <Text style={styles.moodEmoji}>{m.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.memoInput}
            placeholder={`いまの気持ちや${partnerName}に伝えたいこと`}
            placeholderTextColor={COLORS.textWeak}
            value={memo}
            onChangeText={setMemo}
            multiline
          />

          <TouchableOpacity
            style={[styles.submitButton, selectedMood === null && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={selectedMood === null || submitting}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.surface} size="small" />
            ) : (
              <Text style={styles.submitButtonText}>伝える</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>今日の記録</Text>

        {myTodayEntries.length > 0 ? (
          <>
            {myDisplayEntries.map((entry) => (
              <View key={entry.id} style={styles.myEntryWrapper}>
                <EntryCard
                  entry={entry}
                  authorName="自分"
                  isOwn
                  isFavorite={false}
                  timeLabel="今日"
                  onPressActions={() => router.push({ pathname: '/(app)/post', params: { entryId: entry.id } })}
                  onToggleFavorite={() => {}}
                />
              </View>
            ))}
            {!showAllMy && myHiddenCount > 0 && (
              <TouchableOpacity style={styles.showMoreButton} onPress={() => setShowAllMy(true)}>
                <Text style={styles.showMoreText}>他 {myHiddenCount}件を見る</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <Text style={styles.emptyText}>まだ今日の記録がありません</Text>
        )}

        {isPaired && (
          partnerTodayEntries.length > 0 ? (
            <>
              {partnerDisplayEntries.map((entry) => (
                <View key={entry.id} style={styles.partnerEntryWrapper}>
                  <EntryCard
                    entry={entry}
                    authorName={partnerName}
                    isOwn={false}
                    isFavorite={false}
                    timeLabel="今日"
                    onToggleFavorite={() => {}}
                  />
                </View>
              ))}
              {!showAllPartner && partnerHiddenCount > 0 && (
                <TouchableOpacity style={styles.showMoreButton} onPress={() => setShowAllPartner(true)}>
                  <Text style={styles.showMoreText}>他 {partnerHiddenCount}件を見る</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.emptyText}>{partnerName} はまだ今日の記録がありません</Text>
          )
        )}

        {/* 顔文字タップで開くフルサイズ入力モーダル */}
        <Modal visible={moodModalOpen} animationType="slide" transparent onRequestClose={() => setMoodModalOpen(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMoodModalOpen(false)} />
            <View style={styles.moodModalSheet}>
              <View style={styles.moodModalHeader}>
                <Text style={styles.moodModalTitle}>いまの気持ちを記録する</Text>
                <TouchableOpacity onPress={() => setMoodModalOpen(false)}><Text style={styles.moodModalClose}>✕</Text></TouchableOpacity>
              </View>
              <Text style={styles.moodModalLabel}>そのときの気分は？</Text>
              <View style={styles.moodRow}>
                {MOODS.map((m) => (
                  <TouchableOpacity key={m.score}
                    style={[styles.moodButton, moodModalMood === m.score && { backgroundColor: m.color, borderColor: m.color }]}
                    onPress={() => setMoodModalMood(moodModalMood === m.score ? null : m.score)}>
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.moodModalLabel}>いまの気持ちや{partnerName}に伝えたいこと</Text>
              <TextInput
                style={styles.moodModalInput}
                placeholder={`いまの気持ちや${partnerName}に伝えたいこと`}
                placeholderTextColor={COLORS.textWeak}
                value={moodModalMemo}
                onChangeText={setMoodModalMemo}
                multiline
                autoFocus
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.submitButton, moodModalMood === null && styles.submitButtonDisabled]}
                onPress={async () => {
                  if (!user || moodModalMood === null) return;
                  setMoodModalSubmitting(true);
                  try {
                    await addEntry(user.uid, moodModalMood, moodModalMemo.trim(), 'shared');
                    setMoodModalOpen(false);
                    setMoodModalMood(null);
                    setMoodModalMemo('');
                    await load();
                  } catch { Alert.alert('エラー', '記録できませんでした'); }
                  finally { setMoodModalSubmitting(false); }
                }}
                disabled={moodModalMood === null || moodModalSubmitting}
              >
                {moodModalSubmitting ? <ActivityIndicator color={COLORS.surface} size="small" /> : <Text style={styles.submitButtonText}>伝える</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <PaywallModal
          visible={paywallOpen}
          onClose={() => setPaywallOpen(false)}
          onPurchased={() => { setPaywallOpen(false); refreshProfile(); }}
        />
        <AiConsentModal
          visible={consentOpen}
          onAgree={() => setConsentOpen(false)}
          onCancel={() => setConsentOpen(false)}
        />
        <OnboardingModal visible={showOnboarding} onDone={handleOnboardingDone} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  streakLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '700', marginRight: 12 },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.partnerBorder,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 16,
  },
  connectionText: { fontSize: 12, color: COLORS.partnerText, fontWeight: '700' },
  connectionPillMuted: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 16,
  },
  connectionMutedText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  inputCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  moodButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginHorizontal: 2,
  },
  moodEmoji: { fontSize: 26 },
  memoInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 64,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.4 },
  submitButtonText: { color: COLORS.surface, fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 13, color: COLORS.textMuted, fontWeight: '700', marginBottom: 10 },
  emptyText: { fontSize: 13, color: COLORS.textWeak, marginBottom: 12, paddingLeft: 4 },
  myEntryWrapper: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    borderRadius: 12,
    marginBottom: 10,
  },
  partnerEntryWrapper: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.partner,
    borderRadius: 12,
    marginBottom: 10,
  },
  showMoreButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 10,
  },
  showMoreText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  moodModalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  moodModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  moodModalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  moodModalClose: { fontSize: 18, color: COLORS.textMuted },
  moodModalLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 6 },
  moodModalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
