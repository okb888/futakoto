import type React from 'react';
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
import { COLORS } from '../lib/theme';

type EntryCardProps = {
  entry: Entry;
  authorName: string;
  isOwn: boolean;
  isFavorite?: boolean;
  timeLabel: string;
  onPressActions?: () => void;
  onToggleFavorite?: () => void;
  footer?: React.ReactNode;
};

export function EntryCard({
  entry,
  authorName,
  isOwn,
  isFavorite = false,
  timeLabel,
  onPressActions,
  onToggleFavorite,
  footer,
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
                color={isFavorite ? COLORS.primary : COLORS.textWeak}
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
      {footer ? <View style={styles.cardFooter}>{footer}</View> : null}
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
  ownBadge: { backgroundColor: COLORS.primarySoft },
  partnerBadge: { backgroundColor: COLORS.partnerBgSoft },
  authorBadgeText: { fontSize: 12, fontWeight: '700' },
  ownBadgeText: { color: '#5F856B' },
  partnerBadgeText: { color: COLORS.partnerText },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.primaryBgSoft,
  },
  privateBadge: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  visibilityBadgeText: { fontSize: 11, fontWeight: '600' },
  sharedBadgeText: { color: COLORS.primary },
  privateBadgeText: { color: COLORS.textSubtle },
  cardTime: { fontSize: 11, color: COLORS.textWeak, marginTop: 5 },
  favoriteButton: { padding: 6, marginRight: -6 },
  favoriteStatic: { padding: 6, marginRight: -6 },
  cardMemo: { fontSize: 14, color: COLORS.textBody, marginTop: 10, lineHeight: 20 },
  cardFooter: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.borderSoft },
});
