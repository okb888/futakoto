import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Sparkle, Star } from 'phosphor-react-native';
import { EntryCard } from '../../components/EntryCard';
import { EntryActionPanel } from '../../components/EntryActionPanel';
import { SourceConsultationLink } from '../../components/SourceConsultationLink';
import { PaywallModal } from '../../components/PaywallModal';
import { AiConsentModal } from '../../components/AiConsentModal';
import { useAuth } from '../../lib/auth';
import { aiSummary } from '../../lib/ai';
import { MOOD_COLORS, MOOD_EMOJI } from '../../lib/mood';
import {
  AI_FREE_MONTHLY_LIMIT,
  getUserProfile,
  getEntriesInRange,
  getPartnerSharedEntries,
  getRecentEntries,
  getRecentConsultationSessions,
  getFavoriteEntryIds,
  getLatestAiSummary,
  saveAiSummary,
  setAiConsentAcknowledged,
  deleteEntry,
  favoriteKey,
  toggleFavoriteEntry,
  updateEntryVisibility,
  Entry,
  ConsultationSession,
  UserProfile,
} from '../../lib/db';
import { classifyError, firebaseErrorMessage } from '../../lib/errors';
import { dateKey, formatTime, sortMillis, todayKey } from '../../lib/format';
import { getPartnerDisplayName } from '../../lib/profile';
import { COLORS } from '../../lib/theme';
import { trackAiFeatureUsed, trackAiQuotaExceeded, trackPaywallShown } from '../../lib/analytics';

LocaleConfig.locales['ja'] = {
  monthNames: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  monthNamesShort: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  dayNames: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  dayNamesShort: ['日', '月', '火', '水', '木', '金', '土'],
};
LocaleConfig.defaultLocale = 'ja';

type LogTarget = 'both' | 'me' | 'partner';
type LogPeriod = 'current' | 'previous' | 'threeMonths' | 'all';
type LogFavoriteFilter = 'all' | 'favorites';
type LogVisibilityFilter = 'all' | 'shared' | 'private';
type LogMoodFilter = 'all' | 1 | 2 | 3 | 4 | 5;
type LogTypeFilter = 'all' | 'entry' | 'consultation';
type LogMemoFilter = 'all' | 'hasMemo';
type SortOrder = 'desc' | 'asc';
type ViewMode = 'calendar' | 'log';

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

function getLogBounds(period: LogPeriod): { start?: Date; end?: Date; label: string } {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'all') {
    return { label: '全期間' };
  }
  if (period === 'previous') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: thisMonthStart,
      label: '先月',
    };
  }
  if (period === 'threeMonths') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      label: '過去3ヶ月',
    };
  }
  return {
    start: thisMonthStart,
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    label: '今月',
  };
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
  const params = useLocalSearchParams<{ viewMode?: string; typeFilter?: string }>();
  const [myEntries, setMyEntries] = useState<Entry[]>([]);
  const [myEntriesCache, setMyEntriesCache] = useState<Record<string, Entry[]>>({});
  const [partnerEntries, setPartnerEntries] = useState<Entry[]>([]);
  const [partnerEntriesCache, setPartnerEntriesCache] = useState<Record<string, Entry[]>>({});
  const partnerEntriesCacheRef = useRef(partnerEntriesCache);
  const [consultations, setConsultations] = useState<ConsultationSession[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [selected, setSelected] = useState(todayKey());
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [logPeriod, setLogPeriod] = useState<LogPeriod>('current');
  const [logTarget, setLogTarget] = useState<LogTarget>('both');
  const [logFavoriteFilter, setLogFavoriteFilter] = useState<LogFavoriteFilter>('all');
  const [logVisibilityFilter, setLogVisibilityFilter] = useState<LogVisibilityFilter>('all');
  const [logMoodFilter, setLogMoodFilter] = useState<LogMoodFilter>('all');
  const [logTypeFilter, setLogTypeFilter] = useState<LogTypeFilter>('all');
  const [logMemoFilter, setLogMemoFilter] = useState<LogMemoFilter>('all');
  const [logFiltersOpen, setLogFiltersOpen] = useState(false);
  const [logMyEntries, setLogMyEntries] = useState<Entry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [daySheetOpen, setDaySheetOpen] = useState(false);
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
  const [softPremiumHint, setSoftPremiumHint] = useState<string | null>(null);
  const softPremiumOpacity = useRef(new Animated.Value(0)).current;
  const [calendarKey, setCalendarKey] = useState(0);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingSummary, setPendingSummary] = useState(false);

  const premium = isPremium(authProfile ?? null, partnerProfile);
  const isQuotaExceeded =
    !premium &&
    (authProfile?.aiCreditsUsed ?? 0) >= (authProfile?.aiCreditsLimit ?? AI_FREE_MONTHLY_LIMIT);

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
    try {
      const p = authProfile ?? await refreshProfile();
      if (isCancelled() || !p) return;
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
        const partnerCacheKey = `${currentMonth}:${p.partnerUid}`;
        const cachedPartnerEntries = partnerEntriesCacheRef.current[partnerCacheKey];
        if (cachedPartnerEntries) {
          setPartnerEntries(cachedPartnerEntries);
        } else {
          const partner = await getPartnerSharedEntries(p.partnerUid, 500);
          if (isCancelled()) return;
          const newPartnerCache = trimCache({ ...partnerEntriesCacheRef.current, [partnerCacheKey]: partner });
          partnerEntriesCacheRef.current = newPartnerCache;
          setPartnerEntries(partner);
          setPartnerEntriesCache(newPartnerCache);
        }
      } else {
        setPartnerEntries([]);
        if (Object.keys(partnerEntriesCacheRef.current).length > 0) {
          partnerEntriesCacheRef.current = {};
          setPartnerEntriesCache({});
        }
        setPartnerProfile(null);
        if (summaryTarget === 'partner') {
          setSummaryTarget('me');
          setAiSummaryText(aiSummaryCache[`${currentMonth}-me`] ?? null);
        }
        setLogTarget((current) => current === 'partner' ? 'both' : current);
      }
    } catch (e: any) {
      if (!isCancelled()) {
        Alert.alert('読み込みに失敗しました', firebaseErrorMessage(e));
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load(() => cancelled);

    if (params.viewMode === 'log') setViewMode('log');
    if (params.typeFilter === 'consultation') setLogTypeFilter('consultation');

    return () => {
      cancelled = true;
      if (params.viewMode === 'log') setViewMode('calendar');
      if (params.typeFilter === 'consultation') setLogTypeFilter('all');
    };
  }, [user, authProfile, currentMonth, params.viewMode, params.typeFilter]));

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const key = `${currentMonth}-${summaryTarget}`;
    const cached = aiSummaryCache[key];
    setAiSummaryText(cached ?? null);

    getLatestAiSummary(user.uid, currentMonth, summaryTarget)
      .then((latest) => {
        if (cancelled) return;
        if (latest?.text) {
          setAiSummaryText(latest.text);
          setAiSummaryCache((prev) => ({ ...prev, [key]: latest.text }));
        } else if (!cached) {
          setAiSummaryText(null);
        }
      })
      .catch((e: any) => {
        console.error('[Calendar] AI要約取得エラー:', e?.code, e?.message);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid, currentMonth, summaryTarget]);

  useEffect(() => {
    if (!user || viewMode !== 'log') return;
    let cancelled = false;
    const { start, end } = getLogBounds(logPeriod);
    setLogLoading(true);

    const loadEntries = start && end
      ? getEntriesInRange(user.uid, start, end)
      : getRecentEntries(user.uid, 500);

    loadEntries
      .then((entries) => {
        if (!cancelled) setLogMyEntries(entries);
      })
      .catch((e: any) => {
        if (!cancelled) Alert.alert('エラー', firebaseErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid, viewMode, logPeriod]);

  useEffect(() => {
    Animated.timing(softPremiumOpacity, {
      toValue: softPremiumHint ? 1 : 0,
      duration: softPremiumHint ? 220 : 120,
      useNativeDriver: true,
    }).start();
  }, [softPremiumHint, softPremiumOpacity]);

  function openPaywall(reason: string) {
    setPaywallReason(reason);
    setPaywallOpen(true);
  }

  function showSoftPremiumHint(message: string) {
    setSoftPremiumHint(message);
  }

  function switchSummaryTarget(target: 'me' | 'partner') {
    setSummaryTarget(target);
    const key = `${currentMonth}-${target}`;
    setAiSummaryText(aiSummaryCache[key] ?? null);
    setSummaryExpanded(false);
  }

  function handleMonthChange(date: { year: number; month: number }) {
    const newMonth = `${date.year}-${String(date.month).padStart(2, '0')}`;
    if (newMonth === currentMonth) return;

    // 無料ユーザーは過去月を閲覧できない（Premium 特典: 全期間振り返り）
    if (!premium && isPastMonth(newMonth)) {
      showSoftPremiumHint('プレミアムで先月以前の記録も振り返れます');
      // 月表示を当月に戻す（react-native-calendars は内部状態を持つので key で再描画）
      setCurrentMonth(thisMonthKey());
      setCalendarKey((k) => k + 1);
      return;
    }

    setCurrentMonth(newMonth);
    const key = `${newMonth}-${summaryTarget}`;
    setAiSummaryText(aiSummaryCache[key] ?? null);
    setSummaryExpanded(false);
    loadMonthEntries(newMonth, myEntriesCache);
  }

  async function handleAiSummary() {
    if (!user) return;
    if (isQuotaExceeded) {
      openPaywall('今月のAI要約の無料枠を使い切りました');
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

    // AI同意未取得なら同意モーダルを表示し、同意後に実行する
    if (authProfile?.aiConsentAcknowledged !== true) {
      setPendingSummary(true);
      setConsentOpen(true);
      return;
    }

    await runAiSummary(targetEntries);
  }

  async function runAiSummary(targetEntries: Entry[]) {
    if (!user) return;
    const cacheKey = `${currentMonth}-${summaryTarget}`;
    setAiSummaryLoading(true);
    try {
      const res = await aiSummary(
        targetEntries.map((e) => ({ mood: e.mood, memo: e.memo })),
        summaryTarget,
        partnerName
      );
      await saveAiSummary(user.uid, currentMonth, summaryTarget, res.summary, targetEntries.length);
      setAiSummaryText(res.summary);
      setAiSummaryCache((prev) => ({ ...prev, [cacheKey]: res.summary }));
      setSummaryExpanded(true);
      trackAiFeatureUsed('summary');
    } catch (e: any) {
      const classified = classifyError(e);
      if (classified.kind === 'quota') {
        trackAiQuotaExceeded('summary');
        trackPaywallShown('quota_summary');
        openPaywall(classified.message);
      } else {
        Alert.alert(classified.title, classified.message);
      }
    } finally {
      setAiSummaryLoading(false);
    }
  }

  async function handleAgreeAiConsent() {
    if (!user) return;
    try {
      await setAiConsentAcknowledged(user.uid);
      await refreshProfile();
      setConsentOpen(false);
      if (pendingSummary) {
        setPendingSummary(false);
        const targetEntries = summaryTarget === 'me'
          ? myEntries.filter((e) => dateKey(e.createdAt).startsWith(currentMonth))
          : partnerEntries.filter((e) => dateKey(e.createdAt).startsWith(currentMonth));
        if (targetEntries.length > 0) {
          await runAiSummary(targetEntries);
        }
      }
    } catch (e: any) {
      const classified = classifyError(e);
      Alert.alert(classified.title, classified.message);
      setConsentOpen(false);
      setPendingSummary(false);
    }
  }

  function handleCancelAiConsent() {
    setConsentOpen(false);
    setPendingSummary(false);
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
  ].sort((a, b) => b.sortMs - a.sortMs), [
    consultationsByDate,
    favoriteIds,
    myByDate,
    partnerByDate,
    partnerName,
    selected,
  ]);

  const logRecords = useMemo(() => {
    const { start, end } = getLogBounds(logPeriod);
    const startMs = start?.getTime();
    const endMs = end?.getTime();
    const inRange = (ms: number) => startMs === undefined || endMs === undefined || (ms >= startMs && ms < endMs);
    const records = [
      ...logMyEntries.map((entry) => ({
        kind: 'entry' as const,
        entry,
        authorType: 'me' as const,
        authorName: '自分',
        isFavorite: entry.id ? favoriteIds.has(favoriteKey(entry.uid, entry.id)) : false,
        sortMs: sortMillis(entry.createdAt),
      })),
      ...partnerEntries
        .filter((entry) => inRange(sortMillis(entry.createdAt)))
        .map((entry) => ({
          kind: 'entry' as const,
          entry,
          authorType: 'partner' as const,
          authorName: partnerName,
          isFavorite: entry.id ? favoriteIds.has(favoriteKey(entry.uid, entry.id)) : false,
          sortMs: sortMillis(entry.createdAt),
        })),
      ...consultations
        .filter((consultation) => inRange(sortMillis(consultation.createdAt)))
        .map((consultation) => ({
          kind: 'consultation' as const,
          consultation,
          sortMs: sortMillis(consultation.createdAt),
        })),
    ].filter((record) => {
      const matchesTarget =
        record.kind === 'consultation'
          ? logTarget !== 'partner'
          : logTarget === 'me'
            ? record.authorType === 'me'
            : logTarget === 'partner'
              ? record.authorType === 'partner'
              : true;
      if (!matchesTarget) return false;
      if (logTypeFilter === 'entry' && record.kind !== 'entry') return false;
      if (logTypeFilter === 'consultation' && record.kind !== 'consultation') return false;
      if (logFavoriteFilter === 'favorites') {
        const favorite = record.kind === 'consultation' ? record.consultation.favored : record.isFavorite;
        if (!favorite) return false;
      }
      if (logVisibilityFilter !== 'all') {
        const visibility = record.kind === 'consultation' ? 'private' : record.entry.visibility;
        if (visibility !== logVisibilityFilter) return false;
      }
      if (logMoodFilter !== 'all') {
        if (record.kind !== 'entry' || record.entry.mood !== logMoodFilter) return false;
      }
      if (logMemoFilter === 'hasMemo') {
        if (record.kind !== 'entry' || !record.entry.memo?.trim()) return false;
      }
      return true;
    });
    return records.sort((a, b) => sortOrder === 'desc' ? b.sortMs - a.sortMs : a.sortMs - b.sortMs);
  }, [
    consultations,
    favoriteIds,
    logMyEntries,
    logFavoriteFilter,
    logMemoFilter,
    logMoodFilter,
    logPeriod,
    logTarget,
    logTypeFilter,
    logVisibilityFilter,
    partnerEntries,
    partnerName,
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
        onPress={() => {
          setSelected(key);
          setDaySheetOpen(true);
        }}
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

  const logPeriods: { key: LogPeriod; label: string; premiumOnly?: boolean }[] = [
    { key: 'current', label: '今月' },
    { key: 'previous', label: '先月', premiumOnly: true },
    { key: 'threeMonths', label: '過去3ヶ月', premiumOnly: true },
    { key: 'all', label: '全期間', premiumOnly: true },
  ];
  const logTargets: { key: LogTarget; label: string }[] = [
    { key: 'both', label: '両方' },
    { key: 'me', label: '自分' },
    { key: 'partner', label: '相手' },
  ];
  const logFavoriteFilters: { key: LogFavoriteFilter; label: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'favorites', label: 'お気に入り' },
  ];
  const logVisibilityFilters: { key: LogVisibilityFilter; label: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'shared', label: 'ふたりに共有' },
    { key: 'private', label: '自分だけ' },
  ];
  const logTypeFilters: { key: LogTypeFilter; label: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'entry', label: '投稿' },
    { key: 'consultation', label: '相談' },
  ];
  const logPeriodLabel = getLogBounds(logPeriod).label;
  const activeLogFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (logTarget === 'me') labels.push('自分');
    if (logTarget === 'partner') labels.push('相手');
    if (logVisibilityFilter === 'shared') labels.push('ふたりに共有');
    if (logVisibilityFilter === 'private') labels.push('自分だけ');
    if (logMoodFilter !== 'all') labels.push(MOOD_EMOJI[logMoodFilter]);
    if (logFavoriteFilter === 'favorites') labels.push('お気に入り');
    if (logMemoFilter === 'hasMemo') labels.push('コメントあり');
    if (logTypeFilter === 'entry') labels.push('投稿');
    if (logTypeFilter === 'consultation') labels.push('相談');
    if (sortOrder === 'asc') labels.push('古い順');
    return labels;
  }, [
    logFavoriteFilter,
    logMemoFilter,
    logMoodFilter,
    logTarget,
    logTypeFilter,
    logVisibilityFilter,
    sortOrder,
  ]);

  function selectLogPeriod(period: LogPeriod, premiumOnly?: boolean) {
    if (premiumOnly && !premium) {
      openPaywall('過去の記録を振り返れるのはプレミアム特典です');
      return;
    }
    setLogPeriod(period);
  }

  function renderRecord(record: (typeof selectedDayRecords)[number] | (typeof logRecords)[number]) {
    if (record.kind === 'consultation') {
      const session = record.consultation;
      const firstTurn = session.turns?.[0];
      if (!firstTurn) return null;
      const draftText = session.lastDraft?.messageDraft ?? firstTurn.messageDraft;
      return (
        <View
          key={`consultation-${session.id}-${record.sortMs}`}
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
      <View key={`entry-${e.id ?? ''}-${e.uid}-${record.sortMs}`}>
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
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeButton, viewMode === 'calendar' && styles.modeButtonActive]}
          onPress={() => setViewMode('calendar')}
        >
          <Text style={[styles.modeButtonText, viewMode === 'calendar' && styles.modeButtonTextActive]}>
            カレンダー
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, viewMode === 'log' && styles.modeButtonActive]}
          onPress={() => setViewMode('log')}
        >
          <Text style={[styles.modeButtonText, viewMode === 'log' && styles.modeButtonTextActive]}>
            ログ
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'calendar' ? (
        <>
          <Calendar
            key={calendarKey}
            current={`${currentMonth}-01`}
            markedDates={markedDates}
            onDayPress={(d) => {
              setSelected(d.dateString);
              setDaySheetOpen(true);
            }}
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
              style={[
                styles.summaryButton,
                isQuotaExceeded && styles.summaryButtonLocked,
                aiSummaryLoading && { opacity: 0.6 },
              ]}
              onPress={handleAiSummary}
              disabled={aiSummaryLoading}
            >
              {aiSummaryLoading ? (
                <ActivityIndicator color={COLORS.ai} size="small" />
              ) : (
                <>
                  <Sparkle size={14} color={COLORS.ai} weight="fill" />
                  <Text style={styles.summaryButtonText}>
                    {isQuotaExceeded
                      ? '無料枠を使い切りました'
                      : aiSummaryText
                        ? 'さらに最新で要約'
                        : '今月をここまでで要約'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {softPremiumHint ? (
            <Animated.View style={[styles.softPremiumHint, { opacity: softPremiumOpacity }]}>
              <Sparkle size={14} color={COLORS.ai} weight="fill" />
              <View style={styles.softPremiumHintTextBlock}>
                <Text style={styles.softPremiumHintTitle}>{softPremiumHint}</Text>
                <Text style={styles.softPremiumHintBody}>先月・過去3ヶ月・全期間のログを見られます。</Text>
              </View>
              <TouchableOpacity
                style={styles.softPremiumHintButton}
                onPress={() => openPaywall('過去の記録を振り返れるのはプレミアム特典です')}
              >
                <Text style={styles.softPremiumHintButtonText}>詳しく見る</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}

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

        </>
      ) : (
        <>
          <View style={styles.logHeader}>
            <View>
              <Text style={styles.dateTitle}>
                {logFavoriteFilter === 'favorites'
                  ? `${logPeriodLabel}のお気に入り`
                  : `${logPeriodLabel}のログ`}
              </Text>
              {activeLogFilterLabels.length > 0 ? (
                <View style={styles.activeFilterRow}>
                  {activeLogFilterLabels.map((label) => (
                    <View key={label} style={styles.activeFilterChip}>
                      <Text style={styles.activeFilterText}>{label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.filterToggleButton}
              onPress={() => setLogFiltersOpen((current) => !current)}
            >
              <Text style={styles.filterToggleText}>
                フィルター {logFiltersOpen ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
          </View>

          {logFiltersOpen ? (
            <View style={styles.logFilterPanel}>
              <Text style={styles.filterGroupLabel}>期間</Text>
              <View style={styles.filterWrapRow}>
                {logPeriods.map((item) => {
                  const active = logPeriod === item.key;
                  const locked = !!item.premiumOnly && !premium;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.filterButton,
                        active && styles.filterButtonActive,
                        locked && styles.filterButtonPremium,
                      ]}
                      onPress={() => selectLogPeriod(item.key, item.premiumOnly)}
                    >
                      <View style={styles.filterButtonInner}>
                        {item.premiumOnly ? (
                          <Star size={11} color={COLORS.ai} weight="fill" />
                        ) : null}
                        <Text style={[
                          styles.filterText,
                          active && styles.filterTextActive,
                          locked && styles.filterTextPremium,
                        ]}>
                          {item.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.filterGroupLabel}>投稿者</Text>
              <View style={styles.filterWrapRow}>
                {logTargets.map((item) => {
                  const active = logTarget === item.key;
                  const disabled = item.key === 'partner' && !partnerProfile;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.filterButton,
                        active && styles.filterButtonActive,
                        disabled && styles.filterButtonDisabled,
                      ]}
                      onPress={() => setLogTarget(item.key)}
                      disabled={disabled}
                    >
                      <Text style={[
                        styles.filterText,
                        active && styles.filterTextActive,
                        disabled && styles.filterTextDisabled,
                      ]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.filterGroupLabel}>公開範囲</Text>
              <View style={styles.filterWrapRow}>
                {logVisibilityFilters.map((item) => {
                  const active = logVisibilityFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.filterButton, active && styles.filterButtonActive]}
                      onPress={() => setLogVisibilityFilter(item.key)}
                    >
                      <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.filterGroupLabel}>感情</Text>
              <View style={styles.filterWrapRow}>
                <TouchableOpacity
                  style={[styles.filterButton, logMoodFilter === 'all' && styles.filterButtonActive]}
                  onPress={() => setLogMoodFilter('all')}
                >
                  <Text style={[styles.filterText, logMoodFilter === 'all' && styles.filterTextActive]}>全部</Text>
                </TouchableOpacity>
                {[1, 2, 3, 4, 5].map((mood) => {
                  const active = logMoodFilter === mood;
                  return (
                    <TouchableOpacity
                      key={mood}
                      style={[styles.moodFilterButton, active && styles.filterButtonActive]}
                      onPress={() => setLogMoodFilter(mood as LogMoodFilter)}
                    >
                      <Text style={styles.moodFilterText}>{MOOD_EMOJI[mood]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.filterGroupLabel}>その他</Text>
              <View style={styles.filterWrapRow}>
                {logFavoriteFilters.map((item) => {
                  const active = logFavoriteFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.filterButton, active && styles.filterButtonActive]}
                      onPress={() => setLogFavoriteFilter(item.key)}
                    >
                      <View style={styles.filterButtonInner}>
                        {item.key === 'favorites' ? (
                          <Star
                            size={12}
                            color={active ? COLORS.primary : COLORS.textMuted}
                            weight={active ? 'fill' : 'regular'}
                          />
                        ) : null}
                        <Text style={[styles.filterText, active && styles.filterTextActive]}>
                          {item.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {logTypeFilters.map((item) => {
                  const active = logTypeFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.filterButton, active && styles.filterButtonActive]}
                      onPress={() => setLogTypeFilter(item.key)}
                    >
                      <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.filterButton, logMemoFilter === 'hasMemo' && styles.filterButtonActive]}
                  onPress={() => setLogMemoFilter(logMemoFilter === 'hasMemo' ? 'all' : 'hasMemo')}
                >
                  <Text style={[styles.filterText, logMemoFilter === 'hasMemo' && styles.filterTextActive]}>
                    コメントあり
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.filterGroupLabel}>並び順</Text>
              <View style={styles.filterWrapRow}>
                <TouchableOpacity
                  style={[styles.filterButton, sortOrder === 'desc' && styles.filterButtonActive]}
                  onPress={() => setSortOrder('desc')}
                >
                  <Text style={[styles.filterText, sortOrder === 'desc' && styles.filterTextActive]}>新しい順</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterButton, sortOrder === 'asc' && styles.filterButtonActive]}
                  onPress={() => setSortOrder('asc')}
                >
                  <Text style={[styles.filterText, sortOrder === 'asc' && styles.filterTextActive]}>古い順</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {logLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : logRecords.length === 0 ? (
            <Text style={styles.empty}>
              {logFavoriteFilter === 'favorites'
                ? 'この期間のお気に入りはありません'
                : 'この期間の記録はありません'}
            </Text>
          ) : (
            logRecords.map(renderRecord)
          )}
        </>
      )}

      <Modal
        visible={daySheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDaySheetOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setDaySheetOpen(false)}
          />
          <View style={styles.daySheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{selected.replace(/-/g, '/')}</Text>
              <TouchableOpacity onPress={() => setDaySheetOpen(false)} hitSlop={8}>
                <Text style={styles.sheetClose}>閉じる</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {selectedDayRecords.length === 0 ? (
                <Text style={styles.empty}>この日の記録はありません</Text>
              ) : (
                selectedDayRecords.map(renderRecord)
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        reason={paywallReason}
        onPurchased={() => {
          setPaywallOpen(false);
          refreshProfile();
          load();
        }}
      />

      <AiConsentModal
        visible={consentOpen}
        onAgree={handleAgreeAiConsent}
        onCancel={handleCancelAiConsent}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 64 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  inlineLoading: { paddingVertical: 28, alignItems: 'center' },
  modeRow: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    padding: 3,
    borderRadius: 18,
    backgroundColor: COLORS.borderSoft,
  },
  modeButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 15,
  },
  modeButtonActive: {
    backgroundColor: COLORS.surface,
  },
  modeButtonText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '700' },
  modeButtonTextActive: { color: COLORS.text },
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
  filterRow: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, gap: 8 },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButtonActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  filterButtonPremium: { backgroundColor: COLORS.aiBgSoft, borderColor: COLORS.aiBorderSoft },
  filterText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  filterTextActive: { color: COLORS.primary },
  filterTextPremium: { color: COLORS.ai },
  filterButtonDisabled: { opacity: 0.4 },
  filterTextDisabled: { color: COLORS.disabled },
  logControls: { paddingTop: 8 },
  filterRowCompact: { paddingHorizontal: 24, paddingVertical: 5, gap: 8 },
  filterButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logHeader: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  activeFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  activeFilterChip: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.primarySoft,
  },
  activeFilterText: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },
  filterToggleButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterToggleText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  logFilterPanel: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  filterGroupLabel: {
    fontSize: 11,
    color: COLORS.textWeak,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 7,
  },
  filterWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moodFilterButton: {
    width: 36,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  moodFilterText: { fontSize: 15 },
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
  summaryButtonLocked: {
    backgroundColor: COLORS.aiBgSoft,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
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
  softPremiumHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.aiBgSoft,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
  },
  softPremiumHintTextBlock: { flex: 1 },
  softPremiumHintTitle: { fontSize: 12, color: COLORS.ai, fontWeight: '700' },
  softPremiumHintBody: { fontSize: 11, color: COLORS.textMuted, marginTop: 3, lineHeight: 16 },
  softPremiumHintButton: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.aiBg,
  },
  softPremiumHintButtonText: { fontSize: 11, color: COLORS.ai, fontWeight: '700' },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  daySheet: {
    maxHeight: '78%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 10,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { fontSize: 16, color: COLORS.text, fontWeight: '700' },
  sheetClose: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  sheetContent: { paddingBottom: 24 },
});
