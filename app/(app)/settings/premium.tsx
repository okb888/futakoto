import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Sparkle } from 'phosphor-react-native';
import { AI_FREE_MONTHLY_LIMIT } from '../../../lib/db';
import { PaywallModal } from '../../../components/PaywallModal';
import { useSettingsProfile } from '../../../hooks/useSettingsProfile';
import { COLORS } from '../../../lib/theme';

function isPremiumActive(profile?: { premium?: boolean; premiumExpiresAt?: any } | null): boolean {
  if (!profile?.premium) return false;
  const expiresAt = profile.premiumExpiresAt;
  if (!expiresAt) return true;
  const ms = typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : 0;
  return ms === 0 || ms > Date.now();
}

export default function PremiumScreen() {
  const { profile, partnerProfile, load } = useSettingsProfile();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const premium = isPremiumActive(profile) || isPremiumActive(partnerProfile);
  const used = profile?.aiCreditsUsed ?? 0;
  const limit = AI_FREE_MONTHLY_LIMIT;
  const remaining = Math.max(0, limit - used);
  const ratio = Math.min(100, (used / limit) * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>プレミアム</Text>
      <View style={styles.section}>
        <View style={styles.usageRow}>
          <View style={styles.iconBox}>
            <Sparkle size={20} color={COLORS.ai} weight="fill" />
          </View>
          <View style={styles.usageContent}>
            {premium ? (
              <>
                <Text style={styles.usageTitle}>プレミアム加入中</Text>
                <Text style={styles.usageSub}>AI機能は無制限でお使いいただけます</Text>
              </>
            ) : (
              <>
                <View style={styles.usageHeader}>
                  <Text style={styles.usageTitle}>今月の無料分</Text>
                  <Text style={styles.usageCount}>残り {remaining}/{limit}</Text>
                </View>
                <View style={styles.usageTrack}>
                  <View style={[styles.usageFill, { width: `${ratio}%` as any }]} />
                </View>
                <Text style={styles.usageSub}>
                  {remaining === 0
                    ? '無料分を使い切りました。プレミアムで無制限に使えます'
                    : '初回利用から30日でリセットされます'}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>できること</Text>
      <View style={styles.features}>
        {[
          'AI壁打ち・伝え方リライトを無制限で使える',
          '相手の投稿の「気持ちを読み解く」を無制限で使える',
          '月次振り返りサマリーをいつでも見られる',
          '過去の壁打ち履歴をすべて参照できる',
        ].map((text) => (
          <View key={text} style={styles.featureRow}>
            <Sparkle size={13} color={COLORS.ai} weight="fill" />
            <Text style={styles.featureText}>{text}</Text>
          </View>
        ))}
      </View>

      {!premium ? (
        <TouchableOpacity
          style={styles.cta}
          onPress={() => setPaywallOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>プレミアムを始める</Text>
        </TouchableOpacity>
      ) : null}

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => load()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingVertical: 20, paddingBottom: 60 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
  },
  section: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  usageRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.aiBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  usageContent: { flex: 1 },
  usageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  usageTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  usageCount: { fontSize: 13, color: COLORS.ai, fontWeight: '700' },
  usageTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.aiBg,
    overflow: 'hidden',
    marginTop: 9,
  },
  usageFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.ai },
  usageSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 8, lineHeight: 16 },
  features: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
  },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  featureText: { flex: 1, fontSize: 13, color: COLORS.textBody, lineHeight: 19 },
  cta: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: COLORS.ai,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
