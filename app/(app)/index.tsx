import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Heart, Users, Lock, Star } from 'phosphor-react-native';
import { useAuth } from '../../lib/auth';
import {
  createUserProfile,
  getUserProfile,
  getRecentEntries,
  getPartnerSharedEntries,
  deleteEntry,
  updateEntryVisibility,
  favoriteKey,
  getFavoriteEntryIds,
  toggleFavoriteEntry,
  Entry,
  UserProfile,
} from '../../lib/db';

const MOOD_EMOJI = ['', '😣', '😔', '😐', '🙂', '😊'];
const MOOD_COLORS = ['', '#E57373', '#FFB74D', '#FFF176', '#AED581', '#81D4FA'];

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return isToday ? `今日 ${time}` : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!user) return;
    const p = await createUserProfile(user.uid, user.email ?? '');
    setProfile(p);
    setFavoriteIds(await getFavoriteEntryIds(user.uid));

    const myEntries = await getRecentEntries(user.uid);

    let allEntries = myEntries;
    if (p?.partnerUid) {
      const pp = await getUserProfile(p.partnerUid);
      setPartnerProfile(pp);
      const partnerEntries = await getPartnerSharedEntries(p.partnerUid);
      allEntries = [...myEntries, ...partnerEntries].sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      );
    } else {
      setPartnerProfile(null);
    }

    setEntries(allEntries);
  }

  useFocusEffect(useCallback(() => { load(); }, [user]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function showActions(entry: Entry) {
    if (entry.uid !== user?.uid) return;

    const newVisibility = entry.visibility === 'shared' ? 'private' : 'shared';

    const handleDelete = () => {
      Alert.alert('削除しますか？', 'この投稿は完全に削除されます', [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await deleteEntry(user!.uid, entry.id!);
            await load();
          },
        },
      ]);
    };

    const handleToggleVisibility = async () => {
      await updateEntryVisibility(user!.uid, entry.id!, newVisibility);
      await load();
    };

    const visibilityActionLabel = entry.visibility === 'shared' ? '自分のみにする' : 'ふたりへ共有';

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['キャンセル', visibilityActionLabel, '削除'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) handleToggleVisibility();
          if (idx === 2) handleDelete();
        }
      );
    } else {
      Alert.alert('この投稿', '', [
        { text: 'キャンセル', style: 'cancel' },
        { text: visibilityActionLabel, onPress: handleToggleVisibility },
        { text: '削除', style: 'destructive', onPress: handleDelete },
      ]);
    }
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

  const isPaired = !!profile?.partnerUid;
  const partnerName = partnerProfile?.displayName ?? partnerProfile?.email?.split('@')[0] ?? 'パートナー';

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id! + item.uid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.appName}>ふたこと</Text>
            {isPaired ? (
              <View style={styles.pairedRow}>
                <Heart size={14} color="#E58B8B" weight="fill" />
                <Text style={styles.sub}>{partnerName} と繋がっています</Text>
              </View>
            ) : (
              <Text style={styles.sub}>設定タブからパートナーと繋がろう</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>まだ記録がありません</Text>
            <Text style={styles.emptyHint}>右下の＋ボタンで記録してみよう</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isOwn = item.uid === user?.uid;
          const authorName = isOwn ? '自分' : partnerName;
          const isFavorite = item.id ? favoriteIds.has(favoriteKey(item.uid, item.id)) : false;
          return (
            <TouchableOpacity
              activeOpacity={isOwn ? 0.6 : 1}
              onLongPress={() => showActions(item)}
              onPress={() => isOwn && showActions(item)}
              style={[styles.card, { borderLeftColor: MOOD_COLORS[item.mood] }]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardEmoji}>{MOOD_EMOJI[item.mood]}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardAuthor}>{authorName}</Text>
                  <View style={styles.cardDateRow}>
                    <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
                    <Text style={styles.cardDot}>·</Text>
                    {item.visibility === 'private' ? (
                      <Lock size={11} color="#AAA" weight="regular" />
                    ) : (
                      <Users size={11} color="#AAA" weight="regular" />
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.favoriteButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    handleToggleFavorite(item);
                  }}
                >
                  <Star
                    size={18}
                    color={isFavorite ? '#7B9E87' : '#AAA'}
                    weight={isFavorite ? 'fill' : 'regular'}
                  />
                </TouchableOpacity>
              </View>
              {item.memo ? <Text style={styles.cardMemo}>{item.memo}</Text> : null}
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(app)/post')}
      >
        <Plus size={28} color="#fff" weight="bold" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  list: { paddingBottom: 100, paddingTop: 16 },
  header: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 16 },
  appName: { fontSize: 28, fontWeight: '700', color: '#2D2D2D', letterSpacing: 3 },
  sub: { fontSize: 13, color: '#999', marginTop: 4 },
  pairedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 64 },
  emptyText: { fontSize: 15, color: '#AAA' },
  emptyHint: { fontSize: 13, color: '#CCC', marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardEmoji: { fontSize: 28 },
  cardMeta: { flex: 1 },
  cardAuthor: { fontSize: 13, fontWeight: '600', color: '#444' },
  cardDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  cardDate: { fontSize: 11, color: '#AAA' },
  cardDot: { fontSize: 11, color: '#AAA' },
  favoriteButton: { padding: 6, marginRight: -6 },
  cardMemo: { fontSize: 14, color: '#444', marginTop: 10, lineHeight: 20 },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7B9E87',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabText: { fontSize: 28, color: '#fff', lineHeight: 32 },
});
