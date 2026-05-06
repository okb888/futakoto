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
  Modal,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ArrowCounterClockwise, CalendarBlank, Clock, Users, Lock, Sparkle } from 'phosphor-react-native';
import { useAuth } from '../../lib/auth';
import { addEntry, getEntry, getUserProfile, updateEntry, Visibility } from '../../lib/db';
import { aiRewrite, RewriteResult } from '../../lib/ai';

const MOODS = [
  { score: 1, emoji: '😣', label: 'つらい', color: '#E57373' },
  { score: 2, emoji: '😔', label: 'しんどい', color: '#FFB74D' },
  { score: 3, emoji: '😐', label: 'ふつう', color: '#FFF176' },
  { score: 4, emoji: '🙂', label: 'まあまあ', color: '#AED581' },
  { score: 5, emoji: '😊', label: 'いい感じ', color: '#81D4FA' },
];

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
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const TIME_PICKER_ITEM_HEIGHT = 50;

export default function PostScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ memo?: string; entryId?: string }>();
  const entryId = typeof params.entryId === 'string' ? params.entryId : undefined;
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

  // AI リライト
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<RewriteResult | null>(null);
  const [previousMemo, setPreviousMemo] = useState<string | null>(null);

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
        if (!cancelled) Alert.alert('エラー', e.message);
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
      if (p?.partnerUid) {
        const pp = await getUserProfile(p.partnerUid);
        if (pp) setPartnerName(pp.displayName ?? pp.email?.split('@')[0] ?? 'パートナー');
      }
    })();
  }, [user]);

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
        await addEntry(user.uid, mood, memo, visibility, recordDate);
      }
      router.back();
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAiRewrite() {
    if (!memo.trim()) {
      Alert.alert('まずメモを書いてください', 'AIで書き直すには元の文章が必要です');
      return;
    }
    setAiLoading(true);
    try {
      const result = await aiRewrite(memo, partnerName);
      setAiResult(result);
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setAiLoading(false);
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
            <ActivityIndicator color="#7B9E87" />
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
            <CalendarBlank size={16} color={activePicker === 'date' ? '#7B9E87' : '#888'} />
            <Text style={styles.pickerButtonText}>{formatDateInput(recordDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickerButton, styles.timePickerButton, timePickerOpen && styles.pickerButtonActive]}
            onPress={openTimePicker}
          >
            <Clock size={16} color={timePickerOpen ? '#7B9E87' : '#888'} />
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
                  [dateKey(recordDate)]: { selected: true, selectedColor: '#7B9E87' },
                }}
                onDayPress={(day) => handleDaySelect(day.dateString)}
                theme={{
                  calendarBackground: '#fff',
                  todayTextColor: '#7B9E87',
                  arrowColor: '#7B9E87',
                  monthTextColor: '#2D2D2D',
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
            <Sparkle size={14} color="#7C5BB7" weight="fill" />
            <Text style={styles.aiButtonText}>AIで整える</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          placeholder={`${partnerName}に伝えたいことを、そのまま書いてください`}
          placeholderTextColor="#BBB"
          value={memo}
          onChangeText={setMemo}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {previousMemo ? (
          <TouchableOpacity style={styles.undoButton} onPress={restorePreviousMemo}>
            <ArrowCounterClockwise size={14} color="#7B9E87" />
            <Text style={styles.undoButtonText}>置き換える前の文章に戻す</Text>
          </TouchableOpacity>
        ) : null}

        {(aiLoading || aiResult) ? (
          <View style={styles.aiSuggestionSection}>
            <View style={styles.aiSuggestionHeader}>
              <View style={styles.modalTitleRow}>
                <Sparkle size={16} color="#7C5BB7" weight="fill" />
                <Text style={styles.aiSuggestionTitle}>AIの提案</Text>
              </View>
              <Text style={styles.aiSuggestionSub}>元の文章と見比べて選べます</Text>
            </View>

            {aiLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color="#7B9E87" />
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
            <Users size={16} color={visibility === 'shared' ? '#7B9E87' : '#AAA'} weight={visibility === 'shared' ? 'fill' : 'regular'} />
            <Text style={[styles.visBtnText, visibility === 'shared' && styles.visBtnSharedTextActive]}>
              ふたりへ
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.visBtn, visibility === 'private' && styles.visBtnPrivateActive]}
            onPress={() => setVisibility('private')}
          >
            <Lock size={16} color={visibility === 'private' ? '#555' : '#AAA'} weight={visibility === 'private' ? 'fill' : 'regular'} />
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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{isEditing ? '変更を保存する' : '保存する'}</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      <Modal
        visible={timePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTimePickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setTimePickerOpen(false)}
          />
          <View style={styles.timePickerSheet}>
            <View style={styles.timePickerHeader}>
              <TouchableOpacity onPress={() => setTimePickerOpen(false)} hitSlop={10}>
                <Text style={styles.timePickerCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.timePickerTitle}>記録した時間</Text>
              <TouchableOpacity onPress={saveRecordTime} hitSlop={10}>
                <Text style={styles.timePickerSave}>保存</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.timePickerPreviewCard}>
              <View style={styles.timePickerPreviewHeader}>
                <Text style={styles.timePickerPreviewLabel}>この時間で記録します</Text>
                <TouchableOpacity style={styles.timePickerNowButton} onPress={setPickerToNow}>
                  <Text style={styles.timePickerNowText}>今</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.timePickerPreview}>
                {formatTimeInput(new Date(2000, 0, 1, pickerHour, pickerMinute))}
              </Text>
            </View>
            <View style={styles.timePickerPanel}>
              <View style={styles.timePickerColumns}>
                <View style={styles.timePickerColumn}>
                  <Text style={styles.timePickerColumnLabel}>時</Text>
                  <ScrollView
                    style={styles.timePickerList}
                    showsVerticalScrollIndicator={false}
                    contentOffset={{ x: 0, y: Math.max(0, pickerHour * TIME_PICKER_ITEM_HEIGHT - 100) }}
                  >
                    {HOURS.map((hour) => {
                      const selected = hour === pickerHour;
                      return (
                        <TouchableOpacity
                          key={hour}
                          style={[styles.timePickerItem, selected && styles.timePickerItemSelected]}
                          onPress={() => setPickerHour(hour)}
                        >
                          <Text
                            style={[
                              styles.timePickerItemText,
                              selected && styles.timePickerItemTextSelected,
                            ]}
                          >
                            {String(hour).padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
                <View style={styles.timePickerColon}>
                  <Text style={styles.timePickerColonText}>:</Text>
                </View>
                <View style={styles.timePickerColumn}>
                  <Text style={styles.timePickerColumnLabel}>分</Text>
                  <ScrollView
                    style={styles.timePickerList}
                    showsVerticalScrollIndicator={false}
                    contentOffset={{ x: 0, y: Math.max(0, pickerMinute * TIME_PICKER_ITEM_HEIGHT - 100) }}
                  >
                    {MINUTES.map((minute) => {
                      const selected = minute === pickerMinute;
                      return (
                        <TouchableOpacity
                          key={minute}
                          style={[styles.timePickerItem, selected && styles.timePickerItemSelected]}
                          onPress={() => setPickerMinute(minute)}
                        >
                          <Text
                            style={[
                              styles.timePickerItemText,
                              selected && styles.timePickerItemTextSelected,
                            ]}
                          >
                            {String(minute).padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  scroll: { padding: 24, paddingBottom: 48 },
  entryLoading: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  entryLoadingText: { color: '#888', fontSize: 13 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 12, marginTop: 24 },
  messageLabel: { flex: 1 },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  aiButton: {
    backgroundColor: '#F3EDFA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  aiButtonText: { fontSize: 12, color: '#7C5BB7', fontWeight: '600' },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  moodButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  moodEmoji: { fontSize: 24 },
  moodLabel: { fontSize: 10, color: '#AAA', marginTop: 4 },
  moodLabelSelected: { color: '#555', fontWeight: '600' },
  quickDateRow: { flexDirection: 'row', gap: 8 },
  quickDateButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  quickDateButtonText: { fontSize: 12, color: '#7B9E87', fontWeight: '700' },
  dateTimeRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  pickerButton: {
    flex: 1.4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pickerButtonActive: {
    borderColor: '#7B9E87',
    backgroundColor: '#EDF4F0',
  },
  timePickerButton: { flex: 0.8 },
  pickerButtonText: { fontSize: 14, color: '#2D2D2D', fontWeight: '600' },
  pickerPanel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    marginTop: 10,
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(45,45,45,0.24)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  timePickerSheet: {
    backgroundColor: '#FAFAF8',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
  },
  timePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timePickerCancel: { color: '#888', fontSize: 13, fontWeight: '600' },
  timePickerTitle: { color: '#2D2D2D', fontSize: 15, fontWeight: '700' },
  timePickerSave: { color: '#7B9E87', fontSize: 13, fontWeight: '700' },
  timePickerPreviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 18,
    marginBottom: 12,
  },
  timePickerPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  timePickerPreviewLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
  },
  timePickerNowButton: {
    backgroundColor: '#EDF4F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timePickerNowText: {
    color: '#7B9E87',
    fontSize: 11,
    fontWeight: '700',
  },
  timePickerPreview: {
    color: '#5A7E68',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0,
  },
  timePickerPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    padding: 12,
  },
  timePickerColumns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timePickerColumn: { flex: 1 },
  timePickerColumnLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  timePickerList: { height: 224 },
  timePickerItem: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  timePickerItemSelected: {
    backgroundColor: '#EDF4F0',
    borderWidth: 1,
    borderColor: '#C8D8CC',
  },
  timePickerItemText: {
    color: '#555',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
  },
  timePickerItemTextSelected: { color: '#7B9E87', fontWeight: '700' },
  timePickerColon: { paddingTop: 22 },
  timePickerColonText: { color: '#AAA', fontSize: 28, fontWeight: '700' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#2D2D2D',
    minHeight: 100,
  },
  undoButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  undoButtonText: { color: '#7B9E87', fontSize: 12, fontWeight: '600' },
  aiSuggestionSection: {
    marginTop: 16,
    backgroundColor: '#F3EDFA',
    borderRadius: 12,
    padding: 12,
  },
  aiSuggestionHeader: { gap: 4, marginBottom: 10 },
  aiSuggestionTitle: { fontSize: 14, fontWeight: '700', color: '#2D2D2D' },
  aiSuggestionSub: { fontSize: 11, color: '#888' },
  inlineLoading: {
    backgroundColor: '#fff',
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
    borderColor: '#E0E0E0',
    alignItems: 'center',
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  visBtnSharedActive: { borderColor: '#7B9E87', backgroundColor: '#EDF4F0' },
  visBtnPrivateActive: { borderColor: '#888', backgroundColor: '#F0F0F0' },
  visBtnText: { fontSize: 13, color: '#AAA' },
  visBtnSharedTextActive: { color: '#7B9E87', fontWeight: '600' },
  visBtnPrivateTextActive: { color: '#555', fontWeight: '600' },
  saveButton: {
    backgroundColor: '#7B9E87',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonDisabled: { backgroundColor: '#C8D8CC' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalLoadingText: { fontSize: 13, color: '#888' },
  rewriteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E0F2',
  },
  understandingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E0F2',
    borderLeftWidth: 4,
    borderLeftColor: '#7C5BB7',
    gap: 8,
  },
  understandingItem: { gap: 2 },
  understandingKey: { fontSize: 11, color: '#888', fontWeight: '700' },
  understandingText: { fontSize: 13, color: '#444', lineHeight: 19 },
  rewriteLabel: { fontSize: 11, color: '#7C5BB7', fontWeight: '700', marginBottom: 6 },
  rewriteText: { fontSize: 14, color: '#2D2D2D', lineHeight: 20 },
  applyRewriteButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#7C5BB7',
  },
  applyRewriteButtonText: { color: '#7C5BB7', fontSize: 12, fontWeight: '700' },
});
