import { useState, useEffect } from 'react';
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
import { Calendar } from 'react-native-calendars';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ArrowCounterClockwise, CalendarBlank, Clock, Users, Lock, Sparkle } from 'phosphor-react-native';
import { TimePickerSheet } from '../../components/TimePickerSheet';
import { useAuth } from '../../lib/auth';
import { addEntry, getEntry, getUserProfile, setAiConsentAcknowledged, updateEntry, updateLastVisibility, Visibility } from '../../lib/db';
import { getPartnerDisplayName } from '../../lib/profile';
import { aiRewrite, RewriteResult } from '../../lib/ai';
import { MOODS } from '../../lib/mood';
import { classifyError, firebaseErrorMessage } from '../../lib/errors';
import { COLORS } from '../../lib/theme';
import { PaywallModal } from '../../components/PaywallModal';
import { AiConsentModal } from '../../components/AiConsentModal';

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timestampToDate(ts: any): Date {
  if (!ts) return new Date();
  return ts.toDate ? ts.toDate() : new Date(ts);
}

type PickerMode = 'date' | 'time';

export default function PostScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ memo?: string; entryId?: string; sourceConsultationSessionId?: string }>();
  const entryId = typeof params.entryId === 'string' ? params.entryId : undefined;
  const sourceConsultationSessionId =
    typeof params.sourceConsultationSessionId === 'string' ? params.sourceConsultationSessionId : undefined;
  const isEditing = !!entryId;
  const [mood, setMood] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('shared');
  const [loading, setLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [partnerName, setPartnerName] = useState<string>('パートナー');
  const [recordDate, setRecordDate] = useState(() => new Date());
  const [activePicker, setActivePicker] = useState<PickerMode | null>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [pickerHour, setPickerHour] = useState(() => new Date().getHours());
  const [pickerMinute, setPickerMinute] = useState(() => new Date().getMinutes());

  const [memoFocused, setMemoFocused] = useState(false);

  // AI リライト
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<RewriteResult | null>(null);
  const [previousMemo, setPreviousMemo] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);
  const [consentOpen, setConsentOpen] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? '記録を編集' : '記録する' });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!isEditing && typeof params.memo === 'string') {
      setMemo(params.memo);
    }
  }, [isEditing, params.memo]);

  useEffect(() => {
    if (!user || !entryId) return;
    let cancelled = false;

    setEntryLoading(true);
    (async () => {
      try {
        const entry = await getEntry(user.uid, entryId);
        if (cancelled) return;
        if (!entry) {
          Alert.alert('投稿が見つかりません', '削除されたか、読み込めない投稿です');
          router.back();
          return;
        }
        setMood(entry.mood);
        setMemo(entry.memo ?? '');
        setVisibility(entry.visibility);
        setRecordDate(timestampToDate(entry.createdAt));
        setAiResult(null);
        setPreviousMemo(null);
      } catch (e: any) {
        if (!cancelled) Alert.alert('エラー', firebaseErrorMessage(e));
      } finally {
        if (!cancelled) setEntryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entryId, router, user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const p = await getUserProfile(user.uid);
      // 新規投稿時のみ、直前に選んだ共有範囲を初期値に反映
      if (!isEditing && p?.lastVisibility) {
        setVisibility(p.lastVisibility);
      }
      if (p?.partnerUid) {
        const pp = await getUserProfile(p.partnerUid);
        if (pp) setPartnerName(getPartnerDisplayName(pp));
      }
    })();
  }, [user, isEditing]);

  async function handleSave() {
    if (!user || mood === null) {
      Alert.alert('気分を選んでください');
      return;
    }
    if (recordDate.getTime() > Date.now()) {
      Alert.alert('未来の日時は選べません', '今日より前、または現在時刻までの日時を選んでください');
      return;
    }
    setLoading(true);
    try {
      if (isEditing && entryId) {
        await updateEntry(user.uid, entryId, mood, memo, visibility, recordDate);
      } else {
        await addEntry(user.uid, mood, memo, visibility, recordDate, sourceConsultationSessionId);
        // 新規投稿時のみ、選んだ共有範囲を「次回のデフォルト」として保存
        updateLastVisibility(user.uid, visibility).catch(() => {});
      }
      router.back();
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function runAiRewrite() {
    setAiLoading(true);
    try {
      const result = await aiRewrite(memo, partnerName);
      setAiResult(result);
    } catch (e: any) {
      const c = classifyError(e);
      if (c.kind === 'quota') {
        setPaywallReason(c.message);
        setPaywallOpen(true);
      } else {
        Alert.alert(c.title, c.message);
      }
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAiRewrite() {
    if (!memo.trim()) {
      Alert.alert('まずメモを書いてください', 'AIで書き直すには元の文章が必要です');
      return;
    }
    if (profile && profile.aiConsentAcknowledged !== true) {
      setConsentOpen(true);
      return;
    }
    await runAiRewrite();
  }

  async function handleAgreeConsent() {
    if (!user) return;
    try {
      await setAiConsentAcknowledged(user.uid);
      await refreshProfile();
    } finally {
      setConsentOpen(false);
      await runAiRewrite();
    }
  }

  function applyRewrite(text: string) {
    setPreviousMemo(memo);
    setMemo(text);
  }

  function restorePreviousMemo() {
    if (!previousMemo) return;
    setMemo(previousMemo);
    setPreviousMemo(null);
  }

  function applyRecordDate(next: Date) {
    setRecordDate(next.getTime() > Date.now() ? new Date() : next);
  }

  function setQuickDate(daysAgo: number) {
    const next = new Date(recordDate);
    const base = new Date();
    base.setDate(base.getDate() - daysAgo);
    next.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
    applyRecordDate(next);
  }

  function handleDaySelect(dateString: string) {
    const [year, month, day] = dateString.split('-').map(Number);
    const next = new Date(recordDate);
    next.setFullYear(year, month - 1, day);
    applyRecordDate(next);
  }

  function openTimePicker() {
    setActivePicker(null);
    setPickerHour(recordDate.getHours());
    setPickerMinute(recordDate.getMinutes());
    setTimePickerOpen(true);
  }

  function saveRecordTime() {
    const next = new Date(recordDate);
    next.setHours(pickerHour, pickerMinute, 0, 0);
    if (next.getTime() > Date.now()) {
      Alert.alert('未来の日時は選べません', '現在時刻までの時間を選んでください');
      return;
    }
    setRecordDate(next);
    setTimePickerOpen(false);
  }

  function setPickerToNow() {
    const now = new Date();
    setPickerHour(now.getHours());
    setPickerMinute(now.getMinutes());
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {entryLoading ? (
          <View style={styles.entryLoading}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.entryLoadingText}>投稿を読み込んでいます</Text>
          </View>
        ) : null}

        <Text style={styles.label}>そのときの気分は？</Text>
        <View style={styles.moodRow}>
          {MOODS.map((m) => (
            <TouchableOpacity
              key={m.score}
              style={[
                styles.moodButton,
                mood === m.score && { backgroundColor: m.color, borderColor: m.color },
              ]}
              onPress={() => setMood(m.score)}
              accessibilityLabel={`気分: ${m.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: mood === m.score }}
            >
              <Text style={styles.moodEmoji}>{m.emoji}</Text>
              <Text style={[styles.moodLabel, mood === m.score && styles.moodLabelSelected]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>記録日時</Text>
        <View style={styles.quickDateRow}>
          {[
            { label: '今日', daysAgo: 0 },
            { label: '昨日', daysAgo: 1 },
            { label: '一昨日', daysAgo: 2 },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.quickDateButton}
              onPress={() => setQuickDate(item.daysAgo)}
            >
              <Text style={styles.quickDateButtonText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.dateTimeRow}>
          <TouchableOpacity
            style={[styles.pickerButton, activePicker === 'date' && styles.pickerButtonActive]}
            onPress={() => setActivePicker((current) => current === 'date' ? null : 'date')}
          >
            <CalendarBlank size={16} color={activePicker === 'date' ? COLORS.primary : COLORS.textMuted} />
            <Text style={styles.pickerButtonText}>{formatDateInput(recordDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickerButton, styles.timePickerButton, timePickerOpen && styles.pickerButtonActive]}
            onPress={openTimePicker}
          >
            <Clock size={16} color={timePickerOpen ? COLORS.primary : COLORS.textMuted} />
            <Text style={styles.pickerButtonText}>{formatTimeInput(recordDate)}</Text>
          </TouchableOpacity>
        </View>
        {activePicker ? (
          <View style={styles.pickerPanel}>
            {activePicker === 'date' ? (
              <Calendar
                current={dateKey(recordDate)}
                maxDate={dateKey(new Date())}
                markedDates={{
                  [dateKey(recordDate)]: { selected: true, selectedColor: COLORS.primary },
                }}
                onDayPress={(day) => handleDaySelect(day.dateString)}
                theme={{
                  calendarBackground: COLORS.surface,
                  todayTextColor: COLORS.primary,
                  arrowColor: COLORS.primary,
                  monthTextColor: COLORS.text,
                  textDayFontSize: 14,
                  textMonthFontSize: 15,
                  textDayHeaderFontSize: 12,
                }}
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.messageHeader}>
          <Text style={[styles.label, styles.messageLabel]}>
            そのときの気持ち・{partnerName}に伝えたいこと
          </Text>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={handleAiRewrite}
            disabled={aiLoading}
          >
            <Sparkle size={14} color={COLORS.ai} weight="fill" />
            <Text style={styles.aiButtonText}>AIで整える</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.input, memoFocused && styles.inputFocused]}
          placeholder={`${partnerName}に伝えたいことを、そのまま書いてください`}
          placeholderTextColor="#999"
          value={memo}
          onChangeText={setMemo}
          onFocus={() => setMemoFocused(true)}
          onBlur={() => setMemoFocused(false)}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {previousMemo ? (
          <TouchableOpacity style={styles.undoButton} onPress={restorePreviousMemo}>
            <ArrowCounterClockwise size={14} color={COLORS.primary} />
            <Text style={styles.undoButtonText}>置き換える前の文章に戻す</Text>
          </TouchableOpacity>
        ) : null}

        {(aiLoading || aiResult) ? (
          <View style={styles.aiSuggestionSection}>
            <View style={styles.aiSuggestionHeader}>
              <View style={styles.modalTitleRow}>
                <Sparkle size={16} color={COLORS.ai} weight="fill" />
                <Text style={styles.aiSuggestionTitle}>AIの提案</Text>
              </View>
              <Text style={styles.aiSuggestionSub}>元の文章と見比べて選べます</Text>
            </View>

            {aiLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.modalLoadingText}>AIが言葉を整えています...</Text>
              </View>
            ) : aiResult ? (
              <View style={styles.rewriteList}>
                {aiResult.understanding ? (
                  <View style={styles.understandingCard}>
                    <Text style={styles.rewriteLabel}>AIの読み取り</Text>
                    <View style={styles.understandingItem}>
                      <Text style={styles.understandingKey}>気持ち</Text>
                      <Text style={styles.understandingText}>{aiResult.understanding.coreFeeling}</Text>
                    </View>
                    <View style={styles.understandingItem}>
                      <Text style={styles.understandingKey}>残すこと</Text>
                      <Text style={styles.understandingText}>{aiResult.understanding.importantNuance}</Text>
                    </View>
                    <View style={styles.understandingItem}>
                      <Text style={styles.understandingKey}>目的</Text>
                      <Text style={styles.understandingText}>{aiResult.understanding.messageGoal}</Text>
                    </View>
                  </View>
                ) : null}
                {aiResult.rewrites.map((r, i) => (
                  <View key={i} style={styles.rewriteCard}>
                    <Text style={styles.rewriteLabel}>{r.label}</Text>
                    <Text style={styles.rewriteText}>{r.text}</Text>
                    <TouchableOpacity
                      style={styles.applyRewriteButton}
                      onPress={() => applyRewrite(r.text)}
                    >
                      <Text style={styles.applyRewriteButtonText}>この文に置き換える</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.label}>共有範囲</Text>
        <View style={styles.visibilityRow}>
          <TouchableOpacity
            style={[styles.visBtn, visibility === 'shared' && styles.visBtnSharedActive]}
            onPress={() => setVisibility('shared')}
          >
            <Users size={16} color={visibility === 'shared' ? COLORS.primary : COLORS.textWeak} weight={visibility === 'shared' ? 'fill' : 'regular'} />
            <Text style={[styles.visBtnText, visibility === 'shared' && styles.visBtnSharedTextActive]}>
              ふたりへ
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.visBtn, visibility === 'private' && styles.visBtnPrivateActive]}
            onPress={() => setVisibility('private')}
          >
            <Lock size={16} color={visibility === 'private' ? COLORS.textSubtle : COLORS.textWeak} weight={visibility === 'private' ? 'fill' : 'regular'} />
            <Text style={[styles.visBtnText, visibility === 'private' && styles.visBtnPrivateTextActive]}>
              自分のみ
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, mood === null && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading || mood === null}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.saveButtonText}>{isEditing ? '変更を保存する' : '保存する'}</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      <TimePickerSheet
        visible={timePickerOpen}
        title="記録した時間"
        previewLabel="この時間で記録します"
        hour={pickerHour}
        minute={pickerMinute}
        onChangeHour={setPickerHour}
        onChangeMinute={setPickerMinute}
        onCancel={() => setTimePickerOpen(false)}
        onSave={saveRecordTime}
        quickAction={{ label: '今', onPress: setPickerToNow }}
      />

      <PaywallModal
        visible={paywallOpen}
        reason={paywallReason}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => refreshProfile()}
      />

      <AiConsentModal
        visible={consentOpen}
        onAgree={handleAgreeConsent}
        onCancel={() => setConsentOpen(false)}
      />

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 24, paddingBottom: 48 },
  entryLoading: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  entryLoadingText: { color: COLORS.textMuted, fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 10, marginTop: 22, letterSpacing: 0.2 },
  messageLabel: { flex: 1 },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  aiButton: {
    backgroundColor: COLORS.aiBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  aiButtonText: { fontSize: 12, color: COLORS.ai, fontWeight: '600' },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  moodButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  moodEmoji: { fontSize: 28 },
  moodLabel: { fontSize: 11, color: COLORS.textWeak, marginTop: 6 },
  moodLabelSelected: { color: COLORS.textSubtle, fontWeight: '600' },
  quickDateRow: { flexDirection: 'row', gap: 8 },
  quickDateButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  quickDateButtonText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  dateTimeRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  pickerButton: {
    flex: 1.4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pickerButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  timePickerButton: { flex: 0.8 },
  pickerButtonText: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  pickerPanel: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginTop: 10,
    overflow: 'hidden',
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 100,
  },
  inputFocused: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  undoButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  undoButtonText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  aiSuggestionSection: {
    marginTop: 16,
    backgroundColor: COLORS.aiBg,
    borderRadius: 12,
    padding: 12,
  },
  aiSuggestionHeader: { gap: 4, marginBottom: 10 },
  aiSuggestionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  aiSuggestionSub: { fontSize: 11, color: COLORS.textMuted },
  inlineLoading: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  rewriteList: { gap: 10 },
  visibilityRow: { flexDirection: 'row', gap: 12 },
  visBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  visBtnSharedActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  visBtnPrivateActive: { borderColor: COLORS.textMuted, backgroundColor: COLORS.borderSoft },
  visBtnText: { fontSize: 13, color: COLORS.textWeak },
  visBtnSharedTextActive: { color: COLORS.primary, fontWeight: '600' },
  visBtnPrivateTextActive: { color: COLORS.textSubtle, fontWeight: '600' },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  saveButtonDisabled: { backgroundColor: COLORS.primaryDim, shadowOpacity: 0 },
  saveButtonText: { color: COLORS.surface, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalLoadingText: { fontSize: 13, color: COLORS.textMuted },
  rewriteCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.aiBorder,
  },
  understandingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.aiBorder,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.ai,
    gap: 8,
  },
  understandingItem: { gap: 2 },
  understandingKey: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700' },
  understandingText: { fontSize: 13, color: COLORS.textBody, lineHeight: 19 },
  rewriteLabel: { fontSize: 11, color: COLORS.ai, fontWeight: '700', marginBottom: 6 },
  rewriteText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  applyRewriteButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.ai,
  },
  applyRewriteButtonText: { color: COLORS.ai, fontSize: 12, fontWeight: '700' },
});
