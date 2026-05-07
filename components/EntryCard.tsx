import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Lock,
  Star,
  Users,
} from 'phosphor-react-native';
import { Entry } from '../lib/db';
import { getMoodColor, getMoodEmoji } from '../lib/mood';

type EntryCardProps = {
  entry: Entry;
  authorName: string;
  isOwn: boolean;
  isFavorite?: boolean;
  timeLabel: string;
  onPressActions?: () => void;
  onToggleFavorite?: () => void;
};

export function EntryCard({
  entry,
  authorName,
  isOwn,
  isFavorite = false,
  timeLabel,
  onPressActions,
  onToggleFavorite,
}: EntryCardProps) {
  const visibilityLabel = entry.visibility === 'private' ? '自分だけ' : 'ふたりに共有';

  return (
    <View style={[styles.card, { borderLeftColor: getMoodColor(entry.mood) }]}>
      <TouchableOpacity
        activeOpacity={onPressActions ? 0.65 : 1}
        onPress={onPressActions}
        onLongPress={onPressActions}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardEmoji}>{getMoodEmoji(entry.mood)}</Text>
          <View style={styles.cardMeta}>
            <View style={styles.badgeRow}>
              <View style={[styles.authorBadge, isOwn ? styles.ownBadge : styles.partnerBadge]}>
                <Text style={[styles.authorBadgeText, isOwn ? styles.ownBadgeText : styles.partnerBadgeText]}>
                  {authorName}
                </Text>
              </View>
              <View style={[styles.visibilityBadge, entry.visibility === 'private' && styles.privateBadge]}>
                {entry.visibility === 'private' ? (
                  <Lock size={11} color="#888" weight="regular" />
                ) : (
                  <Users size={11} color="#7B9E87" weight="regular" />
                )}
                <Text
                  style={[
                    styles.visibilityBadgeText,
                    entry.visibility === 'private' ? styles.privateBadgeText : styles.sharedBadgeText,
                  ]}
                >
                  {visibilityLabel}
                </Text>
              </View>
            </View>
            <Text style={styles.cardTime}>{timeLabel}</Text>
          </View>
          {onToggleFavorite ? (
            <TouchableOpacity
              style={styles.favoriteButton}
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                onToggleFavorite();
              }}
            >
              <Star
                size={18}
                color={isFavorite ? '#7B9E87' : '#AAA'}
                weight={isFavorite ? 'fill' : 'regular'}
              />
            </TouchableOpacity>
          ) : isFavorite ? (
            <View style={styles.favoriteStatic}>
              <Star size={16} color="#7B9E87" weight="fill" />
            </View>
          ) : null}
        </View>
        {entry.memo ? <Text style={styles.cardMemo}>{entry.memo}</Text> : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  authorBadge: {
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  ownBadge: { backgroundColor: '#EDF4F0' },
  partnerBadge: { backgroundColor: '#FBF4F4' },
  authorBadgeText: { fontSize: 12, fontWeight: '700' },
  ownBadgeText: { color: '#5F856B' },
  partnerBadgeText: { color: '#B26F6F' },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE9E1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F7FBF8',
  },
  privateBadge: {
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAF8',
  },
  visibilityBadgeText: { fontSize: 11, fontWeight: '600' },
  sharedBadgeText: { color: '#7B9E87' },
  privateBadgeText: { color: '#555' },
  cardTime: { fontSize: 11, color: '#AAA', marginTop: 5 },
  favoriteButton: { padding: 6, marginRight: -6 },
  favoriteStatic: { padding: 6, marginRight: -6 },
  cardMemo: { fontSize: 14, color: '#444', marginTop: 10, lineHeight: 20 },
});
