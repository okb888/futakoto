import { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowRight, Sparkle } from 'phosphor-react-native';
import { EntryCard } from '../../components/EntryCard';
import { EntryActionPanel } from '../../components/EntryActionPanel';
import { useAuth } from '../../lib/auth';
import { aiSummary } from '../../lib/ai';
import { MOOD_COLORS, MOOD_EMOJI } from '../../lib/mood';
import {
  getUserProfile,
  getEntriesInRange,
  getPartnerSharedEntries,
  getRecentConsultations,
  getFavoriteEntryIds,
  deleteEntry,
  favoriteKey,
  toggleFavoriteEntry,
  updateEntryVisibility,
  Entry,
  Consultation,
  UserProfile,
} from '../../lib/db';

LocaleConfig.locales['ja'] = {
  monthNames: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  monthNamesShort: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  dayNames: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  dayNamesShort: ['日', '月', '火', '水', '木', '金', '土'],
};
LocaleConfig.defaultLocale = 'ja';

type FilterType = 'all' | 'me' | 'partner' | 'favorite' | 'consultation';
type SortOrder = 'desc' | 'asc';

function dateKey(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sortMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.seconds === 'number') {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1000000);
  }
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.getTime();
}

function latestByDate(entries: Entry[]): Record<string, Entry> {
  const map: Record<string, Entry> = {};
  entries.forEach((entry) => {
    const key = dateKey(entry.createdAt);
    if (!key) return;
    if (!map[key] || sortMillis(entry.createdAt) >= sortMillis(map[key].createdAt)) {
      map[key] = entry;
    }
  });
  return map;
}

export default function CalendarScreen() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const [myEntries, setMyEntries] = useState<Entry[]>([]);
  const [myEntriesCache, setMyEntriesCache] = useState<Record<string, Entry[]>>({});
  const [partnerEntries, setPartnerEntries] = useState<Entry[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [selected, setSelected] = useState(todayKey());
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [summaryTarget, setSummaryTarget] = useState<'me' | 'partner'>('me');
  const [aiSummaryCache, setAiSummaryCache] = useState<Record<string, string>>({});
  const [aiSummaryText, setAiSummaryText] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  function actionKey(entry: Entry): string {
    return `${entry.uid}_${entry.id ?? ''}`;
  }

  function getMonthBounds(monthStr: string): { start: Date; end: Date } {
    const [year, month] = monthStr.split('-').map(Number);
    return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
  }

  async function loadMonthEntries(monthStr: string, cache: Record<string, Entry[]>) {
    if (!user) return;
    if (cache[monthStr]) {
      setMyEntries(cache[monthStr]);
      return;
    }
    setLoading(true);
    try {
      const { start, end } = getMonthBounds(monthStr);
      const entries = await getEntriesInRange(user.uid, start, end);
      setMyEntries(entries);
      setMyEntriesCache((prev) => ({ ...prev, [monthStr]: entries }));
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function load(isCancelled: () => boolean = () => false) {
    if (!user) return;
    setLoading(true);
    const p = authProfile ?? await refreshProfile();
    if (isCancelled() || !p) {
      if (!isCancelled()) setLoading(false);
      return;
    }
    const { start, end } = getMonthBounds(currentMonth);
    const [my, savedConsultations, favorites] = await Promise.all([
      getEntriesInRange(user.uid, start, end),
      getRecentConsultations(user.uid, 100),
      getFavoriteEntryIds(user.uid),
    ]);
    if (isCancelled()) return;
    const newCache = { [currentMonth]: my };
    setMyEntries(my);
    setMyEntriesCache(newCache);
    setConsultations(savedConsultations);
    setFavoriteIds(favorites);
    if (p?.partnerUid) {
      const pp = await getUserProfile(p.partnerUid);
      if (isCancelled()) return;
      setPartnerProfile(pp);
      const partner = await getPartnerSharedEntries(p.partnerUid, 500);
      if (isCancelled()) return;
      setPartnerEntries(partner);
    } else {
      setPartnerEntries([]);
      setPartnerProfile(null);
      if (summaryTarget === 'partner') {
        setSummaryTarget('me');
        setAiSummaryText(aiSummaryCache[`${currentMonth}-me`] ?? null);
      }
      if (filter === 'partner') setFilter('all');
    }
    if (!isCancelled()) setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [user, authProfile, currentMonth]));

  function switchSummaryTarget(target: 'me' | 'partner') {
    setSummaryTarget(target);
    const key = `${currentMonth}-${target}`;
    setAiSummaryText(aiSummaryCache[key] ?? null);
    setSummaryExpanded(false);
  }

  function handleMonthChange(date: { year: number; month: number }) {
    const newMonth = `${date.year}-${String(date.month).padStart(2, '0')}`;
    if (newMonth !== currentMonth) {
      setCurrentMonth(newMonth);
      const key = `${newMonth}-${summaryTarget}`;
      setAiSummaryText(aiSummaryCache[key] ?? null);
      setSummaryExpanded(false);
      loadMonthEntries(newMonth, myEntriesCache);
    }
  }

  async function handleAiSummary() {
    const cacheKey = `${currentMonth}-${summaryTarget}`;
    if (aiSummaryCache[cacheKey]) {
      setAiSummaryText(aiSummaryCache[cacheKey]);
      setSummaryExpanded(true);
      return;
    }

    const targetEntries = summaryTarget === 'me'
      ? myEntries.filter((e) => dateKey(e.createdAt).startsWith(currentMonth))
      : partnerEntries.filter((e) => dateKey(e.createdAt).startsWith(currentMonth));

    if (targetEntries.length === 0) {
      Alert.alert(
        '投稿がありません',
        summaryTarget === 'me' ? 'この月に自分の投稿がありません' : 'この月にパートナーの共有投稿がありません'
      );
      return;
    }

    setAiSummaryLoading(true);
    try {
      const res = await aiSummary(
        targetEntries.map((e) => ({ mood: e.mood, memo: e.memo })),
        summaryTarget,
        partnerName
      );
      setAiSummaryText(res.summary);
      setAiSummaryCache((prev) => ({ ...prev, [cacheKey]: res.summary }));
      setSummaryExpanded(true);
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setAiSummaryLoading(false);
    }
  }

  const groupByDate = (entries: Entry[]) => {
    const map: Record<string, Entry[]> = {};
    entries.forEach((e) => {
      const k = dateKey(e.createdAt);
      if (!k) return;
      if (!map[k]) map[k] = [];
      map[k].push(e);
    });
    return map;
  };

  const groupConsultationsByDate = (items: Consultation[]) => {
    const map: Record<string, Consultation[]> = {};
    items.forEach((item) => {
      const k = dateKey(item.createdAt);
      if (!k) return;
      if (!map[k]) map[k] = [];
      map[k].push(item);
    });
    return map;
  };

  const myByDate = useMemo(() => groupByDate(myEntries), [myEntries]);
  const partnerByDate = useMemo(() => groupByDate(partnerEntries), [partnerEntries]);
  const consultationsByDate = useMemo(() => groupConsultationsByDate(consultations), [consultations]);
  const latestMyByDate = useMemo(() => latestByDate(myEntries), [myEntries]);
  const latestPartnerByDate = useMemo(() => latestByDate(partnerEntries), [partnerEntries]);

  const markedDates: Record<string, any> = {};
  if (selected) {
    markedDates[selected] = { ...(markedDates[selected] ?? {}), selected: true, selectedColor: '#7B9E87' };
  }

  const partnerName = partnerProfile?.displayName ?? partnerProfile?.email?.split('@')[0] ?? 'パートナー';
  const selectedDayRecords = useMemo(() => [
    ...(myByDate[selected] ?? []).map((entry) => ({
      kind: 'entry' as const,
      entry,
      authorType: 'me' as const,
      authorName: '自分',
      isFavorite: entry.id ? favoriteIds.has(favoriteKey(entry.uid, entry.id)) : false,
      sortSeconds: entry.createdAt?.seconds ?? 0,
    })),
    ...(partnerByDate[selected] ?? []).map((entry) => ({
      kind: 'entry' as const,
      entry,
      authorType: 'partner' as const,
      authorName: partnerName,
      isFavorite: entry.id ? favoriteIds.has(favoriteKey(entry.uid, entry.id)) : false,
      sortSeconds: entry.createdAt?.seconds ?? 0,
    })),
    ...(consultationsByDate[selected] ?? []).map((consultation) => ({
      kind: 'consultation' as const,
      consultation,
      sortSeconds: consultation.createdAt?.seconds ?? 0,
    })),
  ]
    .filter((record) => {
      if (filter === 'all') return true;
      if (filter === 'consultation') return record.kind === 'consultation';
      if (record.kind !== 'entry') return false;
      if (filter === 'me') return record.authorType === 'me';
      if (filter === 'partner') return record.authorType === 'partner';
      if (filter === 'favorite') return record.isFavorite;
      return true;
    })
    .sort((a, b) => sortOrder === 'desc' ? b.sortSeconds - a.sortSeconds : a.sortSeconds - b.sortSeconds), [
    consultationsByDate,
    favoriteIds,
    filter,
    myByDate,
    partnerByDate,
    partnerName,
    selected,
    sortOrder,
  ]);

  async function handleToggleVisibility(entry: Entry) {
    if (!user || !entry.id) return;
    const newVisibility = entry.visibility === 'shared' ? 'private' : 'shared';
    await updateEntryVisibility(user.uid, entry.id, newVisibility);
    setActiveActionKey(null);
    await load();
  }

  function handleDelete(entry: Entry) {
    if (!user || !entry.id) return;
    Alert.alert('削除しますか？', 'この投稿は完全に削除されます', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          setActiveActionKey(null);
          await deleteEntry(user.uid, entry.id!);
          await load();
        },
      },
    ]);
  }

  function handleEdit(entry: Entry) {
    if (!entry.id) return;
    setActiveActionKey(null);
    router.push({ pathname: '/(app)/post', params: { entryId: entry.id } });
  }

  function showEntryActions(entry: Entry) {
    if (entry.uid !== user?.uid) return;
    const key = actionKey(entry);
    setActiveActionKey((current) => current === key ? null : key);
  }

  function openSourceConsultation(entry: Entry) {
    if (!entry.sourceConsultationSessionId) return;
    router.push({
      pathname: '/(app)/consult',
      params: { sessionId: entry.sourceConsultationSessionId },
    });
  }

  async function handleToggleFavorite(entry: Entry) {
    if (!user || !entry.id) return;
    const key = favoriteKey(entry.uid, entry.id);
    const isFavorite = favoriteIds.has(key);
    await toggleFavoriteEntry(user.uid, entry.uid, entry.id, isFavorite);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFavorite) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderDay(day?: { dateString: string; day: number }, state?: string) {
    if (!day) return null;
    const key = day.dateString;
    const selectedDay = key === selected;
    const disabled = state === 'disabled';
    const myMood = latestMyByDate[key]?.mood;
    const partnerMood = latestPartnerByDate[key]?.mood;
    const hasConsultation = !!consultationsByDate[key];

    const cellBg = myMood ? MOOD_COLORS[myMood] + '44' : 'transparent';

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.dayCell, { backgroundColor: cellBg }, selectedDay && styles.dayCellSelected]}
        onPress={() => setSelected(key)}
      >
        <Text
          style={[
            styles.dayText,
            disabled && styles.dayTextDisabled,
            selectedDay && styles.dayTextSelected,
          ]}
        >
          {day.day}
        </Text>
        {partnerMood ? (
          <View style={[styles.partnerStrip, { backgroundColor: MOOD_COLORS[partnerMood] }]} />
        ) : null}
        {hasConsultation ? <View style={styles.consultationDot} /> : null}
      </TouchableOpacity>
    );
  }

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'me', label: '自分' },
    { key: 'partner', label: '相手' },
    { key: 'favorite', label: 'お気に入り' },
    { key: 'consultation', label: '相談' },
  ];

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#7B9E87" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Calendar
        markedDates={markedDates}
        onDayPress={(d) => setSelected(d.dateString)}
        onMonthChange={handleMonthChange}
        dayComponent={({ date, state }) => renderDay(date, state)}
        theme={{
          backgroundColor: '#FAFAF8',
          calendarBackground: '#FAFAF8',
          todayTextColor: '#7B9E87',
          arrowColor: '#7B9E87',
          monthTextColor: '#2D2D2D',
          textDayFontSize: 14,
          textMonthFontSize: 16,
          textDayHeaderFontSize: 12,
        }}
      />

      <View style={styles.legend}>
        <View style={styles.ownerLegendRow}>
          <View style={styles.ownerLegendItem}>
            <View style={styles.legendCellSample} />
            <Text style={styles.legendLabel}>背景: 自分</Text>
          </View>
          <View style={styles.ownerLegendItem}>
            <View style={styles.legendStripSample} />
            <Text style={styles.legendLabel}>下線: 相手</Text>
          </View>
          <View style={styles.ownerLegendItem}>
            <View style={styles.consultationLegendDot} />
            <Text style={styles.legendLabel}>相談</Text>
          </View>
        </View>
        <View style={styles.legendRow}>
          {[1, 2, 3, 4, 5].map((m) => (
            <View key={m} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: MOOD_COLORS[m] }]} />
              <Text style={styles.legendEmoji}>{MOOD_EMOJI[m]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.summaryButtonArea}>
        <View style={styles.summaryTargetRow}>
          <TouchableOpacity
            style={[styles.summaryTargetBtn, summaryTarget === 'me' && styles.summaryTargetBtnActive]}
            onPress={() => switchSummaryTarget('me')}
          >
            <Text style={[styles.summaryTargetText, summaryTarget === 'me' && styles.summaryTargetTextActive]}>
              自分
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.summaryTargetBtn,
              summaryTarget === 'partner' && styles.summaryTargetBtnActive,
              !partnerProfile && styles.summaryTargetBtnDisabled,
            ]}
            onPress={() => partnerProfile && switchSummaryTarget('partner')}
            disabled={!partnerProfile}
          >
            <Text style={[
              styles.summaryTargetText,
              summaryTarget === 'partner' && styles.summaryTargetTextActive,
              !partnerProfile && styles.summaryTargetTextDisabled,
            ]}>
              {partnerName}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.summaryButton, aiSummaryLoading && { opacity: 0.6 }]}
          onPress={handleAiSummary}
          disabled={aiSummaryLoading}
        >
          {aiSummaryLoading ? (
            <ActivityIndicator color="#7C5BB7" size="small" />
          ) : (
            <>
              <Sparkle size={14} color="#7C5BB7" weight="fill" />
              <Text style={styles.summaryButtonText}>
                {aiSummaryCache[`${currentMonth}-${summaryTarget}`] ? 'もう一度見る' : '今月をAI要約'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {aiSummaryText ? (
        <View style={styles.summaryCard}>
          <TouchableOpacity
            style={styles.summaryCardHeader}
            onPress={() => setSummaryExpanded(!summaryExpanded)}
            activeOpacity={0.7}
          >
            <Sparkle size={13} color="#7C5BB7" weight="fill" />
            <Text style={styles.summaryCardTitle}>
              {currentMonth.replace(/^(\d{4})-(\d{2})$/, '$1年$2月')}の記録
            </Text>
            <Text style={styles.summaryToggle}>{summaryExpanded ? '閉じる' : '開く'}</Text>
          </TouchableOpacity>
          {summaryExpanded ? (
            <Text style={styles.summaryText}>{aiSummaryText}</Text>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {filters.map((item) => {
          const active = filter === item.key;
          const isConsultation = item.key === 'consultation';
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.filterButton,
                active && styles.filterButtonActive,
                active && isConsultation && styles.filterButtonAiActive,
              ]}
              onPress={() => setFilter(item.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  active && styles.filterTextActive,
                  active && isConsultation && styles.filterTextAiActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.sortRow}>
        <Text style={styles.dateTitle}>{selected.replace(/-/g, '/')}</Text>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setSortOrder((current) => current === 'desc' ? 'asc' : 'desc')}
        >
          <Text style={styles.sortButtonText}>{sortOrder === 'desc' ? '新しい順' : '古い順'}</Text>
        </TouchableOpacity>
      </View>

      {selectedDayRecords.length === 0 ? (
        <Text style={styles.empty}>この日の記録はありません</Text>
      ) : (
        selectedDayRecords.map((record) => {
          if (record.kind === 'consultation') {
            const item = record.consultation;
            return (
              <View
                key={`consultation-${item.id}`}
                style={[styles.card, styles.consultationCard]}
              >
                <View style={styles.cardTop}>
                  <Sparkle size={22} color="#7C5BB7" weight="fill" />
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardAuthor}>相談 / 自分だけ</Text>
                    <Text style={styles.cardTime}>{formatTime(item.createdAt)}</Text>
                  </View>
                </View>
                <Text style={styles.cardMemo}>{item.reflection}</Text>
                <TouchableOpacity
                  style={styles.usePostButton}
                  onPress={() => router.push({ pathname: '/(app)/post', params: { memo: item.messageDraft } })}
                >
                  <Text style={styles.usePostButtonText}>投稿に使う</Text>
                </TouchableOpacity>
              </View>
            );
          }

          const e = record.entry;
          const isOwn = record.authorType === 'me';
          return (
            <View key={`entry-${e.id ?? ''}-${e.uid}`}>
              <EntryCard
                entry={e}
                authorName={record.authorName}
                isOwn={isOwn}
                isFavorite={record.isFavorite}
                timeLabel={formatTime(e.createdAt)}
                onPressActions={isOwn ? () => showEntryActions(e) : undefined}
                onToggleFavorite={() => handleToggleFavorite(e)}
              />
              {isOwn && activeActionKey === actionKey(e) ? (
                <EntryActionPanel
                  entry={e}
                  onEdit={() => handleEdit(e)}
                  onToggleVisibility={() => handleToggleVisibility(e)}
                  onDelete={() => handleDelete(e)}
                />
              ) : null}
              {isOwn && e.sourceConsultationSessionId ? (
                <TouchableOpacity
                  style={styles.sourceConsultationLink}
                  onPress={() => openSourceConsultation(e)}
                  activeOpacity={0.7}
                >
                  <Sparkle size={13} color="#7C5BB7" weight="fill" />
                  <Text style={styles.sourceConsultationLinkText}>この壁打ちを見る</Text>
                  <ArrowRight size={13} color="#7C5BB7" weight="bold" />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { paddingBottom: 64 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF8' },
  legend: { paddingHorizontal: 24, paddingVertical: 12 },
  ownerLegendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  ownerLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendCellSample: { width: 18, height: 18, borderRadius: 4, backgroundColor: '#AED58144' },
  legendStripSample: { width: 18, height: 4, borderRadius: 2, backgroundColor: '#81D4FA' },
  consultationLegendDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7C5BB7' },
  legendLabel: { fontSize: 11, color: '#999' },
  legendRow: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendEmoji: { fontSize: 14 },
  dayCell: {
    width: 38,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dayCellSelected: {
    borderWidth: 2,
    borderColor: '#7B9E87',
  },
  dayText: { fontSize: 13, color: '#2D2D2D', fontWeight: '600' },
  dayTextDisabled: { color: '#CCC' },
  dayTextSelected: { color: '#5F856B', fontWeight: '700' },
  partnerStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.7)',
  },
  consultationDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7C5BB7',
  },
  filterRow: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, gap: 8 },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterButtonActive: { backgroundColor: '#EDF4F0', borderColor: '#7B9E87' },
  filterButtonAiActive: { backgroundColor: '#F3EDFA', borderColor: '#E8E0F2' },
  filterText: { fontSize: 12, color: '#888', fontWeight: '600' },
  filterTextActive: { color: '#7B9E87' },
  filterTextAiActive: { color: '#7C5BB7' },
  sortRow: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateTitle: { fontSize: 14, fontWeight: '600', color: '#555' },
  sortButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sortButtonText: { fontSize: 12, color: '#7B9E87', fontWeight: '700' },
  empty: { fontSize: 13, color: '#BBB', textAlign: 'center', paddingVertical: 24 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  consultationCard: { borderLeftColor: '#7C5BB7', borderWidth: 1, borderColor: '#E8E0F2' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardMeta: { flex: 1 },
  cardAuthor: { fontSize: 13, fontWeight: '600', color: '#444' },
  cardTime: { fontSize: 11, color: '#AAA', marginTop: 2 },
  cardMemo: { fontSize: 13, color: '#444', marginTop: 10, lineHeight: 19 },
  usePostButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  usePostButtonText: { fontSize: 12, color: '#7B9E87', fontWeight: '700' },
  sourceConsultationLink: {
    marginHorizontal: 16,
    marginTop: -6,
    marginBottom: 10,
    backgroundColor: '#F9F7FC',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#EBE4F5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceConsultationLinkText: { flex: 1, fontSize: 12, color: '#7C5BB7', fontWeight: '700' },
  summaryButtonArea: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 8, gap: 10 },
  summaryTargetRow: { flexDirection: 'row', gap: 8 },
  summaryTargetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  summaryTargetBtnActive: { backgroundColor: '#F3EDFA', borderColor: '#E8E0F2' },
  summaryTargetBtnDisabled: { opacity: 0.4 },
  summaryTargetText: { fontSize: 12, color: '#888', fontWeight: '600' },
  summaryTargetTextActive: { color: '#7C5BB7' },
  summaryTargetTextDisabled: { color: '#CCC' },
  summaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3EDFA',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  summaryButtonText: { fontSize: 13, color: '#7C5BB7', fontWeight: '700' },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#F3EDFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E0F2',
    overflow: 'hidden',
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryCardTitle: { flex: 1, fontSize: 13, color: '#7C5BB7', fontWeight: '700' },
  summaryToggle: { fontSize: 11, color: '#7C5BB7' },
  summaryText: { fontSize: 14, color: '#2D2D2D', lineHeight: 21, paddingHorizontal: 14, paddingBottom: 14 },
});
