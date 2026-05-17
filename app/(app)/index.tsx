import { useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { Heart, Sparkle } from 'phosphor-react-native';
import { aiInterpret } from '../../lib/ai';
import { EntryCard } from '../../components/EntryCard';
import { EntryActionPanel } from '../../components/EntryActionPanel';
import { HomeMoodInput } from '../../components/HomeMoodInput';
import { PaywallModal } from '../../components/PaywallModal';
import { AiConsentModal } from '../../components/AiConsentModal';
import { useAuth } from '../../lib/auth';
import {
  AI_FREE_MONTHLY_LIMIT,
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
  getConsecutiveDays,
  Entry,
  UserProfile,
} from '../../lib/db';
import { classifyError } from '../../lib/errors';
import { dateKey, formatEntryDate, todayKey } from '../../lib/format';
import { getPartnerDisplayName } from '../../lib/profile';
import { COLORS } from '../../lib/theme';
import { trackAiFeatureUsed, trackAiQuotaExceeded, trackPaywallShown } from '../../lib/analytics';

export default function HomeScreen() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [myTodayEntry, setMyTodayEntry] = useState<Entry | null>(null);
  const [partnerTodayEntry, setPartnerTodayEntry] = useState<Entry | null>(null);
  const [streak, setStreak] = useState(0);
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: streak >= 2
        ? () => <Text style={styles.streakText}>{streak}日連続</Text>
        : undefined,
    });
  }, [navigation, streak]);

  async function load(isCancelled: () => boolean = () => false) {
    if (!user) return;
    try {
      const p = authProfile ?? await refreshProfile();
      if (isCancelled() || !p) return;
      setProfile(p);

      const [favorites, caches, myEntries, partnerData] = await Promise.all([
        getFavoriteEntryIds(user.uid).catch((e: any) => {
          console.error('[Home] favorites取得エラー:', e?.code, e?.message);
          return new Set<string>();
        }),
        getAllInterpretationCaches(user.uid, 200).catch((e: any) => {
          console.error('[Home] interpretationCache取得エラー:', e?.code, e?.message);
          return {};
        }),
        getRecentEntries(user.uid, 100),
        p.partnerUid
          ? Promise.all([
              getUserProfile(p.partnerUid),
              getPartnerSharedEntries(p.partnerUid, 100),
            ])
              .then(([pp, pe]) => ({ pp, pe }))
              .catch((e: any) => {
                console.error('[Home] パートナーデータ取得エラー:', e?.code, e?.message);
                return null;
              })
          : Promise.resolve(null),
      ]);
      if (isCancelled()) return;
      setFavoriteIds(favorites);
      if (isCancelled()) return;
      setInterpretationsCache(caches);
      if (isCancelled()) return;

      const today = todayKey();
      const nextMyTodayEntry = myEntries.find((entry) => dateKey(entry.createdAt) === today) ?? null;
      let nextPartnerTodayEntry: Entry | null = null;

      if (p.partnerUid && partnerData) {
        setPartnerProfile(partnerData.pp);
        if (isCancelled()) return;
        nextPartnerTodayEntry = partnerData.pe.find((entry) => dateKey(entry.createdAt) === today) ?? null;
      } else {
        setPartnerProfile(null);
      }

      if (isCancelled()) return;
      setMyTodayEntry(nextMyTodayEntry);
      setPartnerTodayEntry(nextPartnerTodayEntry);
      setStreak(getConsecutiveDays(myEntries));
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
      trackAiFeatureUsed('interpret');
    } catch (e: any) {
      const classified = classifyError(e);
      if (classified.kind === 'quota') {
        trackAiQuotaExceeded('interpret');
        trackPaywallShown('quota_interpret');
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
    const used = profile?.aiCreditsUsed ?? 0;
    const limit = profile?.aiCreditsLimit ?? AI_FREE_MONTHLY_LIMIT;
    if (!profile?.premium && used >= limit) {
      setPaywallReason('気持ちを読み解く無料枠を使い切りました');
      setPaywallOpen(true);
      return;
    }
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

  const isPaired = !!profile?.partnerUid;
  const partnerName = getPartnerDisplayName(partnerProfile);

  function renderPartnerFooter(entry: Entry) {
    if (!entry.id || !entry.memo) return undefined;
    const cacheKey = favoriteKey(entry.uid, entry.id);
    const cachedInterps = interpretationsCache[cacheKey];
    const isInterpreting = interpretLoadingIds.has(cacheKey);

    return (
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
              onPress={() => handleInterpret(entry, true)}
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
            onPress={() => handleInterpret(entry)}
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
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
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
        </View>

        {user && profile ? (
          <HomeMoodInput
            uid={user.uid}
            profile={profile}
            partnerProfile={partnerProfile}
            onSubmit={() => load()}
          />
        ) : null}

        <View style={styles.todaySection}>
          <Text style={styles.sectionLabel}>今日の記録</Text>

          {myTodayEntry ? (
            <View>
              <EntryCard
                entry={myTodayEntry}
                authorName="自分"
                isOwn
                isFavorite={
                  myTodayEntry.id
                    ? favoriteIds.has(favoriteKey(myTodayEntry.uid, myTodayEntry.id))
                    : false
                }
                timeLabel={formatEntryDate(myTodayEntry.createdAt)}
                onPressActions={() => showActions(myTodayEntry)}
                onToggleFavorite={() => handleToggleFavorite(myTodayEntry)}
              />
              {activeActionKey === actionKey(myTodayEntry) ? (
                <EntryActionPanel
                  entry={myTodayEntry}
                  onEdit={() => handleEdit(myTodayEntry)}
                  onToggleVisibility={() => handleToggleVisibility(myTodayEntry)}
                  onDelete={() => handleDelete(myTodayEntry)}
                />
              ) : null}
            </View>
          ) : (
            <Text style={styles.noEntryText}>まだ今日の記録がありません</Text>
          )}

          {isPaired && (
            partnerTodayEntry ? (
              <EntryCard
                entry={partnerTodayEntry}
                authorName={partnerName}
                isOwn={false}
                isFavorite={
                  partnerTodayEntry.id
                    ? favoriteIds.has(favoriteKey(partnerTodayEntry.uid, partnerTodayEntry.id))
                    : false
                }
                timeLabel={formatEntryDate(partnerTodayEntry.createdAt)}
                onToggleFavorite={() => handleToggleFavorite(partnerTodayEntry)}
                footer={renderPartnerFooter(partnerTodayEntry)}
              />
            ) : (
              <Text style={styles.noEntryText}>{partnerName}はまだ今日の記録がありません</Text>
            )
          )}
        </View>
      </ScrollView>

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
  scrollContent: { paddingTop: 12, paddingBottom: 80 },
  streakText: {
    marginRight: 16,
    fontSize: 12,
    color: COLORS.textWeak,
    fontWeight: '600',
  },
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
  todaySection: { paddingTop: 8, paddingBottom: 32 },
  sectionLabel: {
    marginHorizontal: 16,
    marginBottom: 10,
    fontSize: 12,
    color: COLORS.textWeak,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  noEntryText: {
    fontSize: 13,
    color: COLORS.textWeak,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  interpretArea: {
    backgroundColor: COLORS.aiBgSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  interpretButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  interpretButtonText: { fontSize: 12, color: COLORS.ai, fontWeight: '700' },
  interpretResult: { gap: 6 },
  interpretItem: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  interpretBullet: { fontSize: 13, color: COLORS.ai, lineHeight: 20, fontWeight: '700' },
  interpretText: { flex: 1, fontSize: 13, color: COLORS.textBody, lineHeight: 20 },
  reInterpretButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
    justifyContent: 'center',
  },
  reInterpretButtonText: { fontSize: 11, color: COLORS.ai, fontWeight: '600' },
});
