import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowRight, Sparkle, Star } from 'phosphor-react-native';
import { EntryCard } from '../../components/EntryCard';
import { useAuth } from '../../lib/auth';
import {
  Entry,
  FavoriteEntryWithEntry,
  favoriteKey,
  getFavoriteEntries,
  getUserProfile,
  toggleFavoriteEntry,
  UserProfile,
} from '../../lib/db';
import { firebaseErrorMessage } from '../../lib/errors';
import { COLORS } from '../../lib/theme';

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function FavoritesScreen() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<FavoriteEntryWithEntry[]>([]);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(isCancelled: () => boolean = () => false) {
    if (!user) return;
    setLoading(true);
    try {
      const [profile, favorites] = await Promise.all([
        authProfile ?? refreshProfile(),
        getFavoriteEntries(user.uid),
      ]);
      if (isCancelled()) return;
      setItems(favorites);
      if (profile?.partnerUid) {
        const partner = await getUserProfile(profile.partnerUid);
        if (isCancelled()) return;
        setPartnerProfile(partner);
      } else {
        setPartnerProfile(null);
      }
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      if (!isCancelled()) setLoading(false);
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

  async function handleRemoveFavorite(entry: Entry) {
    if (!user || !entry.id) return;
    await toggleFavoriteEntry(user.uid, entry.uid, entry.id, true);
    setItems((current) => current.filter((item) => item.id !== favoriteKey(entry.uid, entry.id!)));
  }

  function openSourceConsultation(entry: Entry) {
    if (!entry.sourceConsultationSessionId) return;
    router.push({
      pathname: '/(app)/consult',
      params: { sessionId: entry.sourceConsultationSessionId },
    });
  }

  const partnerName = partnerProfile?.displayName ?? partnerProfile?.email?.split('@')[0] ?? 'パートナー';

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#7B9E87" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Star size={18} color="#7B9E87" weight="fill" />
        <Text style={styles.title}>お気に入り</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>まだお気に入りがありません</Text>
          <Text style={styles.emptyHint}>残しておきたい記録に星をつけると、ここに集まります</Text>
        </View>
      ) : (
        items.map((item) => {
          if (!item.entry) {
            return (
              <View key={item.id} style={styles.missingCard}>
                <Text style={styles.missingText}>この記録は表示できません</Text>
              </View>
            );
          }

          const entry = item.entry;
          const isOwn = entry.uid === user?.uid;
          const footer = isOwn && entry.sourceConsultationSessionId ? (
            <TouchableOpacity
              style={styles.sourceConsultationLink}
              onPress={() => openSourceConsultation(entry)}
              activeOpacity={0.7}
            >
              <Sparkle size={13} color="#7C5BB7" weight="fill" />
              <Text style={styles.sourceConsultationLinkText}>この壁打ちを見る</Text>
              <ArrowRight size={13} color="#7C5BB7" weight="bold" />
            </TouchableOpacity>
          ) : undefined;

          return (
            <EntryCard
              key={item.id}
              entry={entry}
              authorName={isOwn ? '自分' : partnerName}
              isOwn={isOwn}
              isFavorite
              timeLabel={formatDate(entry.createdAt)}
              onToggleFavorite={() => handleRemoveFavorite(entry)}
              footer={footer}
            />
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingTop: 12, paddingBottom: 64 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  header: {
    marginHorizontal: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 64 },
  emptyText: { fontSize: 15, color: COLORS.textWeak },
  emptyHint: { fontSize: 13, color: COLORS.disabled, marginTop: 8, textAlign: 'center', lineHeight: 19 },
  missingCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  missingText: { fontSize: 13, color: COLORS.textWeak },
  sourceConsultationLink: {
    backgroundColor: COLORS.aiBgSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceConsultationLinkText: { flex: 1, fontSize: 12, color: COLORS.ai, fontWeight: '700' },
});
