import { useState, useCallback, useMemo, useEffect } from 'react';
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
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Sparkle } from 'phosphor-react-native';
import { EntryCard } from '../../components/EntryCard';
import { EntryActionPanel } from '../../components/EntryActionPanel';
import { SourceConsultationLink } from '../../components/SourceConsultationLink';
import { PaywallModal } from '../../components/PaywallModal';
import { useAuth } from '../../lib/auth';
import { aiSummary } from '../../lib/ai';
import { MOOD_COLORS, MOOD_EMOJI } from '../../lib/mood';
import {
  getUserProfile,
  getEntriesInRange,
  getPartnerSharedEntries,
  getRecentConsultationSessions,
  getRecentEntries,
  getFavoriteEntryIds,
  deleteEntry,
  favoriteKey,
  toggleFavoriteEntry,
  updateEntryVisibility,
  Entry,
  ConsultationSession,
  UserProfile,
} from '../../lib/db';
import { firebaseErrorMessage } from '../../lib/errors';
import { dateKey, formatTime, sortMillis, todayKey } from '../../lib/format';
import { getPartnerDisplayName } from '../../lib/profile';
import { COLORS } from '../../lib/theme';

LocaleConfig.locales['ja'] = {
  monthNames: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  monthNamesShort: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  dayNames: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  dayNamesShort: ['日', '月', '火', '水', '木', '金', '土'],
};
LocaleConfig.defaultLocale = 'ja';

type ViewMode = 'calendar' | 'log';
type FilterType = 'all' | 'me' | 'partner' | 'favorite' | 'consultation';
type SortOrder = 'desc' | 'asc';
type PeriodFilter = 'thisMonth' | 'lastMonth' | 'past3Months' | 'all';
type VisibilityFilter = 'all' | 'shared' | 'private';
type MoodFilter = 0 | 1 | 2 | 3 | 4 | 5;

const MAX_CACHE_MONTHS = 6;

function trimCache(cache: Record<string, Entry[]>): Record<string, Entry[]> {
  const keys = Object.keys(cache).sort();
  if (keys.length <= MAX_CACHE_MONTHS) return cache;
  const keep = keys.slice(-MAX_CACHE_MONTHS);
  return Object.fromEntries(keep.map((k) => [k, cache[k]]));
}

function thisMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isPastMonth(monthStr: string): boolean {
  return monthStr < thisMonthKey();
}

function isPremium(profile: UserProfile | null, partnerProfile: UserProfile | null): boolean {
  return checkActivePremium(profile) || checkActivePremium(partnerProfile);
}

function checkActivePremium(p: UserProfile | null): boolean {
  if (!p?.premium) return false;
  const expires = p.premiumExpiresAt;
  if (!expires) return true;
  const ms = typeof (expires as any)?.toMillis === 'function' ? (expires as any).toMillis() : 0;
  return ms === 0 || ms > Date.now();
}

function latestByDate(entries: Entry[]): Record<string, Entry> {
  const map: Record<string, Entry> = {};
  entries.forEach((entry) => {
    const key = dateKey(entry.createdAt);
    if (!key) return;
    if (!map[key] || sortMillis(entry.createdAt) > sortMillis(map[key].createdAt)) {
      map[key] = entry;
    }
  });
  return map;
}

export default function CalendarScreen() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ viewMode?: string; typeFilter?: string }>();

  const [viewMode, setViewMode] = useState<ViewMode>('calendar');

  // ログビュー用の状態
  const [logEntries, setLogEntries] = useState<Entry[]>([]);
  const [logPartnerEntries, setLogPartnerEntries] = useState<Entry[]>([]);
  const [logConsultations, setLogConsultations] = useState<ConsultationSession[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('thisMonth');
  const [logAuthorFilter, setLogAuthorFilter] = useState<'all' | 'me' | 'partner'>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [moodFilter, setMoodFilter] = useState<MoodFilter>(0);
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'entry' | 'consultation'>('all');
  const [logSortOrder, setLogSortOrder] = useState<SortOrder>('desc');
  const [logFavoriteOnly, setLogFavoriteOnly] = useState(false);

  const [myEntries, setMyEntries] = useState<Entry[]>([]);
  const [myEntriesCache, setMyEntriesCache] = useState<Record<string, Entry[]>>({});
  const [partnerEntries, setPartnerEntries] = useState<Entry[]>([]);
  const [consultations, setConsultations] = useState<ConsultationSession[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [selected, setSelected] = useState('');
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
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);
  const [calendarKey, setCalendarKey] = useState(0);

  const premium = isPremium(authProfile ?? null, partnerProfile);

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
      setMyEntriesCache((prev) => trimCache({ ...prev, [monthStr]: entries }));
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
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
      getRecentConsultationSessions(user.uid, 100),
      getFavoriteEntryIds(user.uid),
    ]);
    if (isCancelled()) return;
    const newCache = trimCache({ [currentMonth]: my });
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

  // URLパラメータでviewModeとtypeFilterを受け取る
  useFocusEffect(useCallback(() => {
    if (params.viewMode === 'log') {
      setViewMode('log');
      if (params.typeFilter === 'consultation') {
        setLogTypeFilter('consultation');
        setFilterPanelOpen(false);
      }
    } else if (params.viewMode === undefined) {
      setLogTypeFilter('all');
    }
  }, [params.viewMode, params.typeFilter]));

  // ナビゲーションヘッダーにタブ切り替えボタン
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.tabSwitch}>
          <TouchableOpacity
            style={[styles.tabSwitchBtn, viewMode === 'calendar' && styles.tabSwitchBtnActive]}
            onPress={() => setViewMode('calendar')}
          >
            <Text style={[styles.tabSwitchText, viewMode === 'calendar' && styles.tabSwitchTextActive]}>
              カレンダー
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabSwitchBtn, viewMode === 'log' && styles.tabSwitchBtnActive]}
            onPress={() => setViewMode('log')}
          >
            <Text style={[styles.tabSwitchText, viewMode === 'log' && styles.tabSwitchTextActive]}>
              ログ
            </Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, viewMode]);

  // ログデータ読み込み
  async function loadLog(isCancelled: () => boolean = () => false) {
    if (!user) return;
    setLogLoading(true);
    try {
      const p = authProfile ?? await refreshProfile();
      if (isCancelled() || !p) return;

      const [myAll, savedConsultations, favorites] = await Promise.all([
        getRecentEntries(user.uid, 500),
        getRecentConsultationSessions(user.uid, 200),
        getFavoriteEntryIds(user.uid),
      ]);
      if (isCancelled()) return;
      setLogEntries(myAll);
      setLogConsultations(savedConsultations);
      setFavoriteIds(favorites);

      if (p?.partnerUid) {
        const pp = await getUserProfile(p.partnerUid);
        if (isCancelled()) return;
        setPartnerProfile(pp);
        const partnerAll = await getPartnerSharedEntries(p.partnerUid, 500);
        if (isCancelled()) return;
        setLogPartnerEntries(partnerAll);
      } else {
        setPartnerProfile(null);
        setLogPartnerEntries([]);
      }
    } catch (e: any) {
      Alert.alert('エラー', '読み込みに失敗しました');
    } finally {
      if (!isCancelled()) setLogLoading(false);
    }
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [user, authProfile, currentMonth]));

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    loadLog(() => cancelled);
    return () => { cancelled = true; };
  }, [user, authProfile]));

  function filterByPeriod(entries: Entry[]): Entry[] {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    return entries.filter((e) => {
      const dk = dateKey(e.createdAt);
      if (periodFilter === 'thisMonth') return dk.startsWith(thisMonth);
      if (periodFilter === 'lastMonth') return dk.startsWith(lastMonth);
      if (periodFilter === 'past3Months') {
        const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return sortMillis(e.createdAt) >= cutoff.getTime();
      }
      return true;
    });
  }

  function filterConsultsByPeriod(sessions: ConsultationSession[]): ConsultationSession[] {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    return sessions.filter((s) => {
      const dk = dateKey(s.createdAt);
      if (periodFilter === 'thisMonth') return dk.startsWith(thisMonth);
      if (periodFilter === 'lastMonth') return dk.startsWith(lastMonth);
      if (periodFilter === 'past3Months') {
        const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return sortMillis(s.createdAt) >= cutoff.getTime();
      }
      return true;
    });
  }

  const filteredLogRecords = useMemo(() => {
    const myFiltered = filterByPeriod(logEntries).filter((e) => {
      if (logAuthorFilter === 'partner') return false;
      if (visibilityFilter === 'shared' && e.visibility !== 'shared') return false;
      if (visibilityFilter === 'private' && e.visibility !== 'private') return false;
      if (moodFilter !== 0 && e.mood !== moodFilter) return false;
      if (logFavoriteOnly && e.id && !favoriteIds.has(favoriteKey(e.uid, e.id))) return false;
      return true;
    }).map((e) => ({
      kind: 'entry' as const,
      entry: e,
      authorName: '自分',
      isOwn: true,
      isFavorite: e.id ? favoriteIds.has(favoriteKey(e.uid, e.id)) : false,
      sortMs: sortMillis(e.createdAt),
    }));

    const partnerFiltered = filterByPeriod(logPartnerEntries).filter((e) => {
      if (logAuthorFilter === 'me') return false;
      if (moodFilter !== 0 && e.mood !== moodFilter) return false;
      if (logFavoriteOnly && e.id && !favoriteIds.has(favoriteKey(e.uid, e.id))) return false;
      return true;
    }).map((e) => ({
      kind: 'entry' as const,
      entry: e,
      authorName: getPartnerDisplayName(partnerProfile),
      isOwn: false,
      isFavorite: e.id ? favoriteIds.has(favoriteKey(e.uid, e.id)) : false,
      sortMs: sortMillis(e.createdAt),
    }));

    const consultFiltered = logFavoriteOnly ? [] : filterConsultsByPeriod(logConsultations).map((s) => ({
      kind: 'consultation' as const,
      consultation: s,
      sortMs: sortMillis(s.createdAt),
    }));

    type LogRecord =
      | { kind: 'entry'; entry: Entry; authorName: string; isOwn: boolean; isFavorite: boolean; sortMs: number }
      | { kind: 'consultation'; consultation: ConsultationSession; sortMs: number };

    let all: LogRecord[] = [];
    if (logTypeFilter === 'all' || logTypeFilter === 'entry') all = [...all, ...myFiltered, ...partnerFiltered];
    if (logTypeFilter === 'all' || logTypeFilter === 'consultation') all = [...all, ...consultFiltered];

    return all.sort((a, b) => logSortOrder === 'desc' ? b.sortMs - a.sortMs : a.sortMs - b.sortMs);
  }, [logEntries, logPartnerEntries, logConsultations, favoriteIds, periodFilter, logAuthorFilter, visibilityFilter, moodFilter, logTypeFilter, logSortOrder, logFavoriteOnly, partnerProfile]);

  function switchSummaryTarget(target: 'me' | 'partner') {
    setSummaryTarget(target);
    const key = `${currentMonth}-${target}`;
    setAiSummaryText(aiSummaryCache[key] ?? null);
    setSummaryExpanded(false);
  }

  const isPastMonthLocked = !premium && isPastMonth(currentMonth);

  function handleMonthChange(date: { year: number; month: number }) {
    const newMonth = `${date.year}-${String(date.month).padStart(2, '0')}`;
    if (newMonth === currentMonth) return;

    setCurrentMonth(newMonth);
    const key = `${newMonth}-${summaryTarget}`;
    setAiSummaryText(aiSummaryCache[key] ?? null);
    setSummaryExpanded(false);

    // 無料ユーザーは過去月のデータを取得しない（オーバーレイで隠す）
    if (!premium && isPastMonth(newMonth)) return;
    loadMonthEntries(newMonth, myEntriesCache);
  }

  async function handleAiSummary() {
    if (!premium) {
      setPaywallReason('AI要約はプレミアム機能です');
      setPaywallOpen(true);
      return;
    }
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
      Alert.alert('エラー', firebaseErrorMessage(e));
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

  const groupConsultationsByDate = (items: ConsultationSession[]) => {
    const map: Record<string, ConsultationSession[]> = {};
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
    markedDates[selected] = { ...(markedDates[selected] ?? {}), selected: true, selectedColor: COLORS.primary };
  }

  const partnerName = getPartnerDisplayName(partnerProfile);
  const selectedDayRecords = useMemo(() => [
    ...(myByDate[selected] ?? []).map((entry) => ({
      kind: 'entry' as const,
      entry,
      authorType: 'me' as const,
      authorName: '自分',
      isFavorite: entry.id ? favoriteIds.has(favoriteKey(entry.uid, entry.id)) : false,
      sortMs: sortMillis(entry.createdAt),
    })),
    ...(partnerByDate[selected] ?? []).map((entry) => ({
      kind: 'entry' as const,
      entry,
      authorType: 'partner' as const,
      authorName: partnerName,
      isFavorite: entry.id ? favoriteIds.has(favoriteKey(entry.uid, entry.id)) : false,
      sortMs: sortMillis(entry.createdAt),
    })),
    ...(consultationsByDate[selected] ?? []).map((consultation) => ({
      kind: 'consultation' as const,
      consultation,
      sortMs: sortMillis(consultation.createdAt),
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
    .sort((a, b) => sortOrder === 'desc' ? b.sortMs - a.sortMs : a.sortMs - b.sortMs), [
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

  if (viewMode === 'log') {
    const periodLabels: { key: PeriodFilter; label: string; premium?: boolean }[] = [
      { key: 'thisMonth', label: '今月' },
      { key: 'lastMonth', label: '先月', premium: true },
      { key: 'past3Months', label: '過去3ヶ月', premium: true },
      { key: 'all', label: '全期間', premium: true },
    ];
    const MOOD_EMOJIS = ['', '😣', '😔', '😐', '🙂', '😊'] as const;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>
            {periodFilter === 'thisMonth' ? '今月' : periodFilter === 'lastMonth' ? '先月' : periodFilter === 'past3Months' ? '過去3ヶ月' : '全期間'}のログ
          </Text>
          <View style={styles.logHeaderRight}>
            <TouchableOpacity
              style={styles.sortChip}
              onPress={() => setLogSortOrder((o) => o === 'desc' ? 'asc' : 'desc')}
            >
              <Text style={styles.sortChipText}>{logSortOrder === 'desc' ? '新しい順' : '古い順'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterToggleBtn}
              onPress={() => setFilterPanelOpen(!filterPanelOpen)}
            >
              <Text style={styles.filterToggleText}>フィルター {filterPanelOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {filterPanelOpen && (
          <View style={styles.filterPanel}>
            <Text style={styles.filterGroupLabel}>期間</Text>
            <View style={styles.filterRow}>
              {periodLabels.map((p) => {
                const isPremiumChip = !!p.premium;
                const isActive = periodFilter === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.filterChip,
                      isPremiumChip && styles.filterChipPremium,
                      isActive && (isPremiumChip ? styles.filterChipPremiumActive : styles.filterChipActive),
                    ]}
                    onPress={() => {
                      if (isPremiumChip && !premium) {
                        setPaywallReason('先月以前のログはプレミアム機能です');
                        setPaywallOpen(true);
                        return;
                      }
                      setPeriodFilter(p.key);
                    }}
                  >
                    <Text style={[
                      styles.filterChipText,
                      isPremiumChip && styles.filterChipPremiumText,
                      isActive && (isPremiumChip ? styles.filterChipPremiumTextActive : styles.filterChipTextActive),
                    ]}>
                      {isPremiumChip ? '★ ' : ''}{p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.filterGroupLabel}>投稿者</Text>
            <View style={styles.filterRow}>
              {([['all', '両方'], ['me', '自分'], ['partner', '相手']] as const).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterChip, logAuthorFilter === key && styles.filterChipActive]}
                  onPress={() => setLogAuthorFilter(key)}
                >
                  <Text style={[styles.filterChipText, logAuthorFilter === key && styles.filterChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>公開範囲</Text>
            <View style={styles.filterRow}>
              {([['all', 'すべて'], ['shared', 'ふたりに共有'], ['private', '自分だけ']] as const).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterChip, visibilityFilter === key && styles.filterChipActive]}
                  onPress={() => setVisibilityFilter(key)}
                >
                  <Text style={[styles.filterChipText, visibilityFilter === key && styles.filterChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>感情</Text>
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterChip, moodFilter === 0 && styles.filterChipActive]}
                onPress={() => setMoodFilter(0)}
              >
                <Text style={[styles.filterChipText, moodFilter === 0 && styles.filterChipTextActive]}>全部</Text>
              </TouchableOpacity>
              {([1, 2, 3, 4, 5] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.filterChip, moodFilter === m && styles.filterChipActive]}
                  onPress={() => setMoodFilter(moodFilter === m ? 0 : m)}
                >
                  <Text style={styles.filterChipEmoji}>{MOOD_EMOJIS[m]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>種別</Text>
            <View style={styles.filterRow}>
              {([['all', 'すべて'], ['entry', '投稿'], ['consultation', '相談']] as const).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterChip, logTypeFilter === key && styles.filterChipActive]}
                  onPress={() => setLogTypeFilter(key)}
                >
                  <Text style={[styles.filterChipText, logTypeFilter === key && styles.filterChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>その他</Text>
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterChip, logFavoriteOnly && styles.filterChipActive]}
                onPress={() => setLogFavoriteOnly(!logFavoriteOnly)}
              >
                <Text style={[styles.filterChipText, logFavoriteOnly && styles.filterChipTextActive]}>★ お気に入りのみ</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.filterResetBtn}
              onPress={() => {
                setPeriodFilter('thisMonth');
                setLogAuthorFilter('all');
                setVisibilityFilter('all');
                setMoodFilter(0);
                setLogTypeFilter('all');
                setLogSortOrder('desc');
                setLogFavoriteOnly(false);
              }}
            >
              <Text style={styles.filterResetText}>フィルターをリセット</Text>
            </TouchableOpacity>
          </View>
        )}

        {logLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : filteredLogRecords.length === 0 ? (
          <Text style={styles.empty}>この期間の記録はありません</Text>
        ) : (
          filteredLogRecords.map((record) => {
            if (record.kind === 'consultation') {
              const session = record.consultation;
              const firstTurn = session.turns?.[0];
              if (!firstTurn) return null;
              return (
                <View key={`c-${session.id}`} style={[styles.card, styles.consultationCard]}>
                  <View style={styles.cardTop}>
                    <Sparkle size={20} color={COLORS.ai} weight="fill" />
                    <View style={styles.cardMeta}>
                      <Text style={styles.cardAuthor}>相談</Text>
                      <Text style={styles.cardTime}>{dateKey(session.createdAt).replace(/-/g, '/')}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMemo}>{firstTurn.reflection}</Text>
                  <TouchableOpacity
                    style={styles.usePostButton}
                    onPress={() => router.push({ pathname: '/(app)/consult', params: { sessionId: session.id ?? '' } })}
                  >
                    <Text style={styles.usePostButtonText}>セッションを開く</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            return (
              <EntryCard
                key={`e-${record.entry.id ?? ''}-${record.entry.uid}`}
                entry={record.entry}
                authorName={record.authorName}
                isOwn={record.isOwn}
                isFavorite={record.isFavorite}
                timeLabel={dateKey(record.entry.createdAt).replace(/-/g, '/')}
                onToggleFavorite={() => handleToggleFavorite(record.entry)}
              />
            );
          })
        )}

        <PaywallModal
          visible={paywallOpen}
          reason={paywallReason}
          onClose={() => setPaywallOpen(false)}
          onPurchased={() => {}}
        />
      </ScrollView>
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={{ position: 'relative' }}>
        <Calendar
          key={calendarKey}
          current={`${currentMonth}-01`}
          markedDates={markedDates}
          onDayPress={(d) => setSelected(d.dateString)}
          onMonthChange={handleMonthChange}
          dayComponent={({ date, state }) => renderDay(date, state)}
          theme={{
            backgroundColor: COLORS.background,
            calendarBackground: COLORS.background,
            todayTextColor: COLORS.primary,
            arrowColor: COLORS.primary,
            monthTextColor: COLORS.text,
            textDayFontSize: 14,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 12,
          }}
        />
        {isPastMonthLocked && (
          <View style={styles.calendarOverlay}>
            <Sparkle size={28} color={COLORS.ai} weight="fill" />
            <Text style={styles.calendarOverlayText}>過去月の振り返りはプレミアム機能です</Text>
            <TouchableOpacity
              style={styles.calendarOverlayBtn}
              onPress={() => {
                setPaywallReason('過去の月を振り返れるのはプレミアム特典です');
                setPaywallOpen(true);
              }}
            >
              <Text style={styles.calendarOverlayBtnText}>プレミアムを見る</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

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
            <ActivityIndicator color={COLORS.ai} size="small" />
          ) : (
            <>
              <Sparkle size={14} color={COLORS.ai} weight="fill" />
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
            <Sparkle size={13} color={COLORS.ai} weight="fill" />
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
        contentContainerStyle={styles.calendarFilterRow}
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
        <Text style={styles.dateTitle}>
          {selected === '' ? '日付を選択してください' : selected.replace(/-/g, '/')}
        </Text>
        {selected !== '' && (
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortOrder((current) => current === 'desc' ? 'asc' : 'desc')}
          >
            <Text style={styles.sortButtonText}>{sortOrder === 'desc' ? '新しい順' : '古い順'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!premium ? (
        <TouchableOpacity
          style={styles.premiumHint}
          onPress={() => {
            setPaywallReason('過去の月を振り返れるのはプレミアム特典です');
            setPaywallOpen(true);
          }}
          activeOpacity={0.7}
        >
          <Sparkle size={13} color={COLORS.ai} weight="fill" />
          <Text style={styles.premiumHintText}>
            過去月の振り返りはプレミアム
          </Text>
        </TouchableOpacity>
      ) : null}

      {selected === '' ? null : selectedDayRecords.length === 0 ? (
        <Text style={styles.empty}>この日の記録はありません</Text>
      ) : (
        selectedDayRecords.map((record) => {
          if (record.kind === 'consultation') {
            const session = record.consultation;
            const firstTurn = session.turns?.[0];
            if (!firstTurn) return null;
            const draftText = session.lastDraft?.messageDraft ?? firstTurn.messageDraft;
            return (
              <View
                key={`consultation-${session.id}`}
                style={[styles.card, styles.consultationCard]}
              >
                <View style={styles.cardTop}>
                  <Sparkle size={22} color={COLORS.ai} weight="fill" />
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardAuthor}>相談 / 自分だけ</Text>
                    <Text style={styles.cardTime}>{formatTime(session.createdAt)}</Text>
                  </View>
                </View>
                <Text style={styles.cardMemo}>{firstTurn.reflection}</Text>
                {draftText ? (
                  <TouchableOpacity
                    style={styles.usePostButton}
                    onPress={() => router.push({
                      pathname: '/(app)/post',
                      params: { memo: draftText, sourceConsultationSessionId: session.id ?? '' },
                    })}
                  >
                    <Text style={styles.usePostButtonText}>投稿に使う</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.usePostButton}
                    onPress={() => router.push({
                      pathname: '/(app)/consult',
                      params: { sessionId: session.id ?? '' },
                    })}
                  >
                    <Text style={styles.usePostButtonText}>セッションを開く</Text>
                  </TouchableOpacity>
                )}
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
                <View style={styles.sourceConsultationLinkWrapper}>
                  <SourceConsultationLink onPress={() => openSourceConsultation(e)} />
                </View>
              ) : null}
            </View>
          );
        })
      )}

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        reason={paywallReason}
        onPurchased={() => {
          setPaywallOpen(false);
          load();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 64 },

  // ヘッダータブ切り替え
  tabSwitch: { flexDirection: 'row', marginRight: 12, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  tabSwitchBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: COLORS.surface },
  tabSwitchBtnActive: { backgroundColor: COLORS.primary },
  tabSwitchText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  tabSwitchTextActive: { color: COLORS.surface },

  // ログビュー
  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  logTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  logHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  sortChipText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  filterToggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  filterToggleText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  filterPanel: { backgroundColor: COLORS.surface, margin: 16, marginTop: 0, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  filterGroupLabel: { fontSize: 11, color: COLORS.textWeak, fontWeight: '700', marginTop: 6 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.background },
  filterChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '18' },
  filterChipPremium: { borderColor: COLORS.aiBorder, backgroundColor: COLORS.aiBgSoft },
  filterChipPremiumActive: { borderColor: COLORS.ai, backgroundColor: COLORS.aiBg },
  filterChipText: { fontSize: 13, color: COLORS.textMuted },
  filterChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  filterChipPremiumText: { fontSize: 13, color: COLORS.ai },
  filterChipPremiumTextActive: { color: COLORS.ai, fontWeight: '700' },
  filterChipEmoji: { fontSize: 18 },
  filterResetBtn: { marginTop: 8, paddingVertical: 8, alignItems: 'center' },
  filterResetText: { fontSize: 13, color: COLORS.textWeak, fontWeight: '600' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  legend: { paddingHorizontal: 24, paddingVertical: 12 },
  ownerLegendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  ownerLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendCellSample: { width: 18, height: 18, borderRadius: 4, backgroundColor: '#AED58144' },
  legendStripSample: { width: 18, height: 4, borderRadius: 2, backgroundColor: '#81D4FA' },
  consultationLegendDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.ai },
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
    borderColor: COLORS.primary,
  },
  dayText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  dayTextDisabled: { color: COLORS.disabled },
  dayTextSelected: { color: COLORS.primaryDeep, fontWeight: '700' },
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
    backgroundColor: COLORS.ai,
  },
  calendarFilterRow: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, gap: 8 },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButtonActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  filterButtonAiActive: { backgroundColor: COLORS.aiBg, borderColor: COLORS.aiBorder },
  filterText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  filterTextActive: { color: COLORS.primary },
  filterTextAiActive: { color: COLORS.ai },
  sortRow: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textSubtle },
  sortButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sortButtonText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  empty: { fontSize: 13, color: COLORS.placeholder, textAlign: 'center', paddingVertical: 24 },
  card: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  consultationCard: { borderLeftColor: COLORS.ai, borderWidth: 1, borderColor: COLORS.aiBorder },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardMeta: { flex: 1 },
  cardAuthor: { fontSize: 13, fontWeight: '600', color: COLORS.textBody },
  cardTime: { fontSize: 11, color: COLORS.textWeak, marginTop: 2 },
  cardMemo: { fontSize: 13, color: COLORS.textBody, marginTop: 10, lineHeight: 19 },
  usePostButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  usePostButtonText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  sourceConsultationLinkWrapper: { marginHorizontal: 16, marginTop: -6, marginBottom: 10 },
  summaryButtonArea: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 8, gap: 10 },
  summaryTargetRow: { flexDirection: 'row', gap: 8 },
  summaryTargetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryTargetBtnActive: { backgroundColor: COLORS.aiBg, borderColor: COLORS.aiBorder },
  summaryTargetBtnDisabled: { opacity: 0.4 },
  summaryTargetText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  summaryTargetTextActive: { color: COLORS.ai },
  summaryTargetTextDisabled: { color: COLORS.disabled },
  summaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.aiBg,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  summaryButtonText: { fontSize: 13, color: COLORS.ai, fontWeight: '700' },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: COLORS.aiBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.aiBorder,
    overflow: 'hidden',
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryCardTitle: { flex: 1, fontSize: 13, color: COLORS.ai, fontWeight: '700' },
  summaryToggle: { fontSize: 11, color: COLORS.ai },
  summaryText: { fontSize: 14, color: COLORS.text, lineHeight: 21, paddingHorizontal: 14, paddingBottom: 14 },
  premiumHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginVertical: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: COLORS.aiBgSoft,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
  },
  premiumHintText: { fontSize: 12, color: COLORS.ai, fontWeight: '600' },
  calendarOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 10,
  },
  calendarOverlayText: { fontSize: 14, color: COLORS.ai, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },
  calendarOverlayBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.ai },
  calendarOverlayBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },
});
