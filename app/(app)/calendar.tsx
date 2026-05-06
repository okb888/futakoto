import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useFocusEffect, useRouter } from 'expo-router';
import { Lock, Sparkle, Star, Users } from 'phosphor-react-native';
import { useAuth } from '../../lib/auth';
import {
  createUserProfile,
  getUserProfile,
  getRecentEntries,
  getPartnerSharedEntries,
  getRecentConsultations,
  getFavoriteEntryIds,
  favoriteKey,
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

const MOOD_EMOJI = ['', '😣', '😔', '😐', '🙂', '😊'];
const MOOD_COLORS = ['', '#E57373', '#FFB74D', '#FFF176', '#AED581', '#81D4FA'];

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

export default function CalendarScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [myEntries, setMyEntries] = useState<Entry[]>([]);
  const [partnerEntries, setPartnerEntries] = useState<Entry[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [selected, setSelected] = useState(todayKey());
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    const p = await createUserProfile(user.uid, user.email ?? '');
    const my = await getRecentEntries(user.uid, 200);
    const savedConsultations = await getRecentConsultations(user.uid, 100);
    const favorites = await getFavoriteEntryIds(user.uid);
    setMyEntries(my);
    setConsultations(savedConsultations);
    setFavoriteIds(favorites);
    if (p?.partnerUid) {
      const pp = await getUserProfile(p.partnerUid);
      setPartnerProfile(pp);
      const partner = await getPartnerSharedEntries(p.partnerUid, 200);
      setPartnerEntries(partner);
    } else {
      setPartnerEntries([]);
      setPartnerProfile(null);
    }
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [user]));

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

  const myByDate = groupByDate(myEntries);
  const partnerByDate = groupByDate(partnerEntries);
  const consultationsByDate = groupConsultationsByDate(consultations);

  const markedDates: Record<string, any> = {};
  Object.keys({ ...myByDate, ...partnerByDate, ...consultationsByDate }).forEach((k) => {
    const dots = [];
    if (myByDate[k]) {
      const avg = Math.round(myByDate[k].reduce((s, e) => s + e.mood, 0) / myByDate[k].length);
      dots.push({ key: 'me', color: MOOD_COLORS[avg] });
    }
    if (partnerByDate[k]) {
      const avg = Math.round(partnerByDate[k].reduce((s, e) => s + e.mood, 0) / partnerByDate[k].length);
      dots.push({ key: 'partner', color: MOOD_COLORS[avg] });
    }
    if (consultationsByDate[k]) {
      dots.push({ key: 'consultation', color: '#7C5BB7' });
    }
    markedDates[k] = { dots };
  });

  if (selected) {
    markedDates[selected] = { ...(markedDates[selected] ?? {}), selected: true, selectedColor: '#7B9E87' };
  }

  const partnerName = partnerProfile?.displayName ?? partnerProfile?.email?.split('@')[0] ?? 'パートナー';
  const selectedDayRecords = [
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
    .sort((a, b) => sortOrder === 'desc' ? b.sortSeconds - a.sortSeconds : a.sortSeconds - b.sortSeconds);

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
        markingType="multi-dot"
        markedDates={markedDates}
        onDayPress={(d) => setSelected(d.dateString)}
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
        <Text style={styles.legendLabel}>気分の色</Text>
        <View style={styles.legendRow}>
          {[1, 2, 3, 4, 5].map((m) => (
            <View key={m} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: MOOD_COLORS[m] }]} />
              <Text style={styles.legendEmoji}>{MOOD_EMOJI[m]}</Text>
            </View>
          ))}
        </View>
      </View>

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
          const authorBorder = record.authorType === 'me' ? '#7B9E87' : '#E8D5D5';
          return (
            <View
              key={`entry-${e.id ?? ''}-${e.uid}`}
              style={[styles.card, { borderLeftColor: authorBorder }]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardEmoji}>{MOOD_EMOJI[e.mood]}</Text>
                <View style={styles.cardMeta}>
                  <View style={styles.authorRow}>
                    <Text style={styles.cardAuthor}>{record.authorName}</Text>
                    {e.visibility === 'private' ? (
                      <Lock size={11} color="#AAA" weight="regular" />
                    ) : (
                      <Users size={11} color="#AAA" weight="regular" />
                    )}
                  </View>
                  <Text style={styles.cardTime}>{formatTime(e.createdAt)}</Text>
                </View>
                {record.isFavorite ? (
                  <Star size={16} color="#7B9E87" weight="fill" />
                ) : null}
              </View>
              {e.memo ? <Text style={styles.cardMemo}>{e.memo}</Text> : null}
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
  legendLabel: { fontSize: 11, color: '#999', marginBottom: 8 },
  legendRow: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendEmoji: { fontSize: 14 },
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
  cardEmoji: { fontSize: 24 },
  cardMeta: { flex: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardAuthor: { fontSize: 13, fontWeight: '600', color: '#444' },
  cardTime: { fontSize: 11, color: '#AAA', marginTop: 2 },
  cardMemo: { fontSize: 13, color: '#444', marginTop: 10, lineHeight: 19 },
  usePostButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  usePostButtonText: { fontSize: 12, color: '#7B9E87', fontWeight: '700' },
});
