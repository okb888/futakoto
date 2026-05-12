import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkle } from 'phosphor-react-native';
import { COLORS } from '../lib/theme';
import type { UserProfile } from '../lib/db';

type Props = {
  profile: UserProfile | null;
  /** 無料月次上限（functions/src/shared.ts の AI_FREE_MONTHLY_LIMIT と揃える） */
  freeLimit?: number;
  onPress?: () => void;
};

export function AiQuotaChip({ profile, freeLimit = 5, onPress }: Props) {
  if (!profile) return null;

  // Premium はチップ自体表示しない（無制限なので情報的に薄い）
  if (profile.premium) {
    return (
      <TouchableOpacity style={[styles.chip, styles.chipPremium]} onPress={onPress} activeOpacity={0.7}>
        <Sparkle size={12} color={COLORS.ai} weight="fill" />
        <Text style={styles.textPremium}>無制限</Text>
      </TouchableOpacity>
    );
  }

  const used = profile.aiCreditsUsed ?? 0;
  const remaining = Math.max(0, freeLimit - used);
  const isLow = remaining <= 1;
  const isExhausted = remaining === 0;

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        isExhausted ? styles.chipExhausted : isLow ? styles.chipLow : styles.chipDefault,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Sparkle
        size={12}
        color={isExhausted ? COLORS.errorText : isLow ? COLORS.warningText : COLORS.ai}
        weight="regular"
      />
      <Text
        style={[
          styles.text,
          isExhausted ? styles.textExhausted : isLow ? styles.textLow : styles.textDefault,
        ]}
      >
        {isExhausted ? 'AI上限' : `残り${remaining}/${freeLimit}`}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipDefault: {
    backgroundColor: COLORS.aiBgSoft,
    borderColor: COLORS.aiBorderSoft,
  },
  chipLow: {
    backgroundColor: COLORS.warningBg,
    borderColor: COLORS.warningBorder,
  },
  chipExhausted: {
    backgroundColor: COLORS.errorBg,
    borderColor: COLORS.errorBorder,
  },
  chipPremium: {
    backgroundColor: COLORS.aiBg,
    borderColor: COLORS.aiBorder,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
  textDefault: {
    color: COLORS.ai,
  },
  textLow: {
    color: COLORS.warningText,
  },
  textExhausted: {
    color: COLORS.errorText,
  },
  textPremium: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.ai,
  },
});
