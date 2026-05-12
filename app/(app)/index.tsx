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
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { Plus, Heart, Sparkle, Star, ArrowRight } from 'phosphor-react-native';
import { aiInterpret } from '../../lib/ai';
import { EntryCard } from '../../components/EntryCard';
import { EntryActionPanel } from '../../components/EntryActionPanel';
import { SourceConsultationLink } from '../../components/SourceConsultationLink';
import { AiQuotaChip } from '../../components/AiQuotaChip';
import { PaywallModal } from '../../components/PaywallModal';
import { AiConsentModal } from '../../components/AiConsentModal';
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
  setAiConsentAcknowledged,
  Entry,
  UserProfile,
} from '../../lib/db';
import { classifyError } from '../../lib/errors';
import { formatEntryDate, sortMillis } from '../../lib/format';
import { getPartnerDisplayName } from '../../lib/profile';
import { COLORS } from '../../lib/theme';

export default function HomeScreen() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [interpretationsCache, setInterpretationsCache] = useState<Record<string, string[]>>({});
  const [interpretLoadingIds, setInterpretLoadingIds] = useState<Set<string>>(new Set());
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingInterpret, setPendingInterpret] = useState<{ entry: Entry; force: boolean } | null>(null);

  function actionKey(entry: Entry): string {
    return `${entry.uid}_${entry.id ?? ''}`;
  }

  async function load(isCancelled: () => boolean = () => false) {
    if (!user) return;
    try {
      const p = authProfile ?? await refreshProfile();
      if (isCancelled() || !p) return;
      setProfile(p);

      let favorites = new Set<string>();
      try {
        favorites = await getFavoriteEntryIds(user.uid);
      } catch (e: any) {
        console.error('[Home] favorites取得エラー:', e?.code, e?.message);
      }
      setFavoriteIds(favorites);

      let caches: Record<string, string[]> = {};
      try {
        caches = await getAllInterpretationCaches(user.uid);
      } catch (e: any) {
        console.error('[Home] interpretationCache取得エラー:', e?.code, e?.message);
      }
      setInterpretationsCache(caches);

      const myEntries = await getRecentEntries(user.uid, 100);
      if (isCancelled()) return;

      let allEntries = myEntries;
      if (p?.partnerUid) {
        try {
          const pp = await getUserProfile(p.partnerUid);
          if (isCancelled()) return;
          setPartnerProfile(pp);
          const partnerEntries = await getPartnerSharedEntries(p.partnerUid, 100);
          if (isCancelled()) return;
          allEntries = [...myEntries, ...partnerEntries]
            .sort((a, b) => sortMillis(b.createdAt) - sortMillis(a.createdAt))
            .slice(0, 100);
        } catch (e: any) {
          console.error('[Home] パートナーデータ取得エラー:', e?.code, e?.message);
          allEntries = myEntries;
        }
      } else {
        setPartnerProfile(null);
      }

      setEntries(allEntries);
    } catch (e: any) {
      console.error('[Home] load全体エラー:', e?.code, e?.message);
    }
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [user, authProfile]));

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          <AiQuotaChip
            profile={profile}
            onPress={() => {
              setPaywallReason(undefined);
              setPaywallOpen(true);
            }}
          />
        </View>
      ),
    });
  }, [navigation, profile]);

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

  async function runInterpret(entry: Entry, force = false) {
    if (!entry.id || !entry.memo) return;
    const cacheKey = favoriteKey(entry.uid, entry.id);
    setInterpretLoadingIds((prev) => new Set([...prev, cacheKey]));
    try {
      const res = await aiInterpret(entry.memo, entry.mood, partnerName, entry.id, entry.uid, force);
      setInterpretationsCache((prev) => ({ ...prev, [cacheKey]: res.interpretations }));
    } catch (e: any) {
      const classified = classifyError(e);
      if (classified.kind === 'quota') {
        setPaywallReason(classified.message);
        setPaywallOpen(true);
      } else if (classified.kind === 'network') {
        Alert.alert(classified.title, classified.message);
      } else {
        Alert.alert(classified.title, classified.message);
      }
    } finally {
      setInterpretLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(cacheKey);
        return next;
      });
    }
  }

  async function handleInterpret(entry: Entry, force = false) {
    if (!entry.id || !entry.memo) return;
    // AI同意が未取得なら同意モーダルを表示し、同意後に実行する
    if (profile?.aiConsentAcknowledged !== true) {
      setPendingInterpret({ entry, force });
      setConsentOpen(true);
      return;
    }
    await runInterpret(entry, force);
  }

  async function handleConsentAgree() {
    if (!user) return;
    try {
      await setAiConsentAcknowledged(user.uid);
      await refreshProfile();
    } catch (e: any) {
      const classified = classifyError(e);
      Alert.alert(classified.title, classified.message);
      setConsentOpen(false);
      setPendingInterpret(null);
      return;
    }
    setConsentOpen(false);
    const next = pendingInterpret;
    setPendingInterpret(null);
    if (next) {
      await runInterpret(next.entry, next.force);
    }
  }

  function handleConsentCancel() {
    setConsentOpen(false);
    setPendingInterpret(null);
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
            <Text style={styles.emptyEmoji}>🌿</Text>
            <Text style={styles.emptyText}>今日の気持ちを記録しよう</Text>
            <Text style={styles.emptyHint}>
              毎日の気持ちを残すと{'\n'}パートナーに気持ちが届きます
            </Text>
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={() => router.push('/(app)/post')}
            >
              <Text style={styles.emptyActionText}>最初の記録をする</Text>
            </TouchableOpacity>
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
        <Plus size={28} color={COLORS.surface} weight="bold" />
      </TouchableOpacity>

      <PaywallModal
        visible={paywallOpen}
        reason={paywallReason}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => {
          setPaywallOpen(false);
          refreshProfile();
        }}
      />

      <AiConsentModal
        visible={consentOpen}
        onAgree={handleConsentAgree}
        onCancel={handleConsentCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingBottom: 100, paddingTop: 12 },
  connectionHeader: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 16, color: COLORS.textSubtle, fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: 13, color: COLORS.textWeak, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  emptyAction: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyActionText: { color: COLORS.surface, fontSize: 14, fontWeight: '700' },
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
  fabText: { fontSize: 28, color: COLORS.surface, lineHeight: 32 },
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
