import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Heart, Sparkle, Star, ArrowRight } from 'phosphor-react-native';
import { aiInterpret } from '../../lib/ai';
import { EntryCard } from '../../components/EntryCard';
import { EntryActionPanel } from '../../components/EntryActionPanel';
import { SourceConsultationLink } from '../../components/SourceConsultationLink';
import { useAuth } from '../../lib/auth';
import {
  getUserProfile,
  getRecentEntries,
  getPartnerSharedEntries,
  deleteEntry,
  updateEntryVisibility,
  favoriteKey,
  getFavoriteEntryIds,
  toggleFavoriteEntry,
  getAllInterpretationCaches,
  Entry,
  UserProfile,
} from '../../lib/db';
import { firebaseErrorMessage } from '../../lib/errors';
import { formatEntryDate } from '../../lib/format';
import { getPartnerDisplayName } from '../../lib/profile';
import { COLORS } from '../../lib/theme';

export default function HomeScreen() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [interpretationsCache, setInterpretationsCache] = useState<Record<string, string[]>>({});
  const [interpretLoadingIds, setInterpretLoadingIds] = useState<Set<string>>(new Set());
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  function actionKey(entry: Entry): string {
    return `${entry.uid}_${entry.id ?? ''}`;
  }

  async function load(isCancelled: () => boolean = () => false) {
    if (!user) return;
    const [p, favorites, caches] = await Promise.all([
      authProfile ?? refreshProfile(),
      getFavoriteEntryIds(user.uid),
      getAllInterpretationCaches(user.uid),
    ]);
    if (isCancelled() || !p) return;
    setProfile(p);
    setFavoriteIds(favorites);
    setInterpretationsCache(caches);

    const myEntries = await getRecentEntries(user.uid);
    if (isCancelled()) return;

    let allEntries = myEntries;
    if (p?.partnerUid) {
      const pp = await getUserProfile(p.partnerUid);
      if (isCancelled()) return;
      setPartnerProfile(pp);
      const partnerEntries = await getPartnerSharedEntries(p.partnerUid);
      if (isCancelled()) return;
      allEntries = [...myEntries, ...partnerEntries].sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      );
    } else {
      setPartnerProfile(null);
    }

    setEntries(allEntries);
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [user, authProfile]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

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

  function showActions(entry: Entry) {
    if (entry.uid !== user?.uid) return;
    const key = actionKey(entry);
    setActiveActionKey((current) => current === key ? null : key);
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

  async function handleInterpret(entry: Entry, force = false) {
    if (!entry.id || !entry.memo) return;
    const cacheKey = favoriteKey(entry.uid, entry.id);
    setInterpretLoadingIds((prev) => new Set([...prev, cacheKey]));
    try {
      const res = await aiInterpret(entry.memo, entry.mood, partnerName, entry.id, entry.uid, force);
      setInterpretationsCache((prev) => ({ ...prev, [cacheKey]: res.interpretations }));
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setInterpretLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(cacheKey);
        return next;
      });
    }
  }

  function openSourceConsultation(entry: Entry) {
    if (!entry.sourceConsultationSessionId) return;
    router.push({
      pathname: '/(app)/consult',
      params: { sessionId: entry.sourceConsultationSessionId },
    });
  }

  const isPaired = !!profile?.partnerUid;
  const partnerName = getPartnerDisplayName(partnerProfile);

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id! + item.uid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.connectionHeader}>
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
            <TouchableOpacity
              style={styles.favoriteShortcut}
              onPress={() => router.push('/(app)/favorites')}
              activeOpacity={0.7}
            >
              <Star size={14} color={COLORS.primary} weight="fill" />
              <Text style={styles.favoriteShortcutText}>お気に入り</Text>
              <ArrowRight size={13} color={COLORS.primary} weight="bold" />
            </TouchableOpacity>
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
          const cacheKey = item.id ? favoriteKey(item.uid, item.id) : '';
          const isActionOpen = activeActionKey === actionKey(item);
          const cachedInterps = !isOwn ? interpretationsCache[cacheKey] : undefined;
          const isInterpreting = !isOwn && interpretLoadingIds.has(cacheKey);
          const footer = isOwn && item.sourceConsultationSessionId ? (
            <SourceConsultationLink onPress={() => openSourceConsultation(item)} />
          ) : !isOwn && item.memo ? (
            <View style={styles.interpretArea}>
              {cachedInterps ? (
                <>
                  <View style={styles.interpretResult}>
                    {cachedInterps.map((interp, i) => (
                      <View key={i} style={styles.interpretItem}>
                        <Text style={styles.interpretBullet}>·</Text>
                        <Text style={styles.interpretText}>{interp}</Text>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={styles.reInterpretButton}
                    onPress={() => handleInterpret(item, true)}
                    disabled={isInterpreting}
                  >
                    {isInterpreting ? (
                      <ActivityIndicator color={COLORS.ai} size="small" />
                    ) : (
                      <Text style={styles.reInterpretButtonText}>もう一度読み解く</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.interpretButton}
                  onPress={() => handleInterpret(item)}
                  disabled={isInterpreting}
                >
                  {isInterpreting ? (
                    <ActivityIndicator color={COLORS.ai} size="small" />
                  ) : (
                    <>
                      <Sparkle size={13} color={COLORS.ai} weight="fill" />
                      <Text style={styles.interpretButtonText}>気持ちを読み解く</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : undefined;
          return (
            <View>
              <EntryCard
                entry={item}
                authorName={authorName}
                isOwn={isOwn}
                isFavorite={isFavorite}
                timeLabel={formatEntryDate(item.createdAt)}
                onPressActions={isOwn ? () => showActions(item) : undefined}
                onToggleFavorite={() => handleToggleFavorite(item)}
                footer={footer}
              />
              {isOwn && isActionOpen ? (
                <EntryActionPanel
                  entry={item}
                  onEdit={() => handleEdit(item)}
                  onToggleVisibility={() => handleToggleVisibility(item)}
                  onDelete={() => handleDelete(item)}
                />
              ) : null}
            </View>
          );
        }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(app)/post')}
        accessibilityLabel="新しい記録を追加"
        accessibilityRole="button"
      >
        <Plus size={28} color="#fff" weight="bold" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingBottom: 100, paddingTop: 12 },
  connectionHeader: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectionPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.partnerBorder,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  },
  connectionMutedText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  favoriteShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  favoriteShortcutText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 64 },
  emptyText: { fontSize: 15, color: COLORS.textWeak },
  emptyHint: { fontSize: 13, color: COLORS.disabled, marginTop: 8 },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabText: { fontSize: 28, color: '#fff', lineHeight: 32 },
  interpretArea: {
    backgroundColor: COLORS.aiBgSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  interpretButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  interpretButtonText: { fontSize: 12, color: COLORS.ai, fontWeight: '700' },
  interpretResult: { gap: 6 },
  interpretItem: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  interpretBullet: { fontSize: 13, color: COLORS.ai, lineHeight: 20, fontWeight: '700' },
  interpretText: { flex: 1, fontSize: 13, color: COLORS.textBody, lineHeight: 20 },
  reInterpretButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
  },
  reInterpretButtonText: { fontSize: 11, color: COLORS.ai, fontWeight: '600' },
});
