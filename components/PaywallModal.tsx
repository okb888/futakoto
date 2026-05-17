import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Sparkle, X, Check } from 'phosphor-react-native';
import { COLORS } from '../lib/theme';
import {
  getCurrentOffering,
  isPurchasesConfigured,
  purchasePremium,
  restorePurchases,
  type PaywallOffering,
} from '../lib/purchases';
import {
  trackPaywallShown,
  trackPurchaseStarted,
  trackPurchaseCompleted,
  trackPurchaseFailed,
  trackRestoreCompleted,
} from '../lib/analytics';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 「使い切ったので表示」など、表示理由のサブヘッダ */
  reason?: string;
  /** 購入成功時のコールバック */
  onPurchased?: () => void;
};

const FEATURES = [
  'AI相談・伝え方リライト 無制限',
  '相手の投稿の「気持ちを読み解く」 無制限',
  '月次振り返りサマリーがいつでも見られる',
  '過去の相談履歴をすべて参照可能',
];

export function PaywallModal({ visible, onClose, reason, onPurchased }: Props) {
  const [offering, setOffering] = useState<PaywallOffering | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    getCurrentOffering().then(setOffering);
    trackPaywallShown(reason ?? 'unknown');
  }, [visible]);

  async function handlePurchase() {
    setLoading(true);
    trackPurchaseStarted();
    try {
      const res = await purchasePremium();
      if (res.success) {
        trackPurchaseCompleted();
        onPurchased?.();
        onClose();
      } else if (res.error) {
        trackPurchaseFailed(res.error);
        Alert.alert('購入できませんでした', res.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    setLoading(true);
    try {
      const res = await restorePurchases();
      if (res.success) {
        trackRestoreCompleted(true);
        onPurchased?.();
        onClose();
      } else if (res.error) {
        trackRestoreCompleted(false);
        Alert.alert('復元できませんでした', res.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="プレミアム案内を閉じる"
          >
            <X size={22} color={COLORS.textMuted} weight="regular" />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Sparkle size={36} color={COLORS.ai} weight="fill" />
          </View>

          <Text style={styles.title}>ふたこと プレミアム</Text>
          {reason ? <Text style={styles.reason}>{reason}</Text> : null}

          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Check size={16} color={COLORS.primary} weight="bold" />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>
              {offering?.title ?? 'ふたこと プレミアム'}
            </Text>
            <Text style={styles.price}>{offering?.priceString ?? '¥500'} <Text style={styles.pricePer}>/ 月</Text></Text>
            <Text style={styles.priceNote}>
              いつでも解約可能。解約は端末の「設定 → Apple ID → サブスクリプション」から行えます。
              ペアの片方が契約すれば、ふたりとも無制限になります。
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.cta, loading && styles.ctaDisabled]}
            onPress={handlePurchase}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="プレミアムを始める"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.surface} />
            ) : (
              <Text style={styles.ctaText}>プレミアムを始める</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRestore}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="購入を復元"
          >
            <Text style={styles.restoreText}>購入を復元</Text>
          </TouchableOpacity>

          <Text style={styles.legalText}>
            購入後、App Store アカウントに課金されます。自動更新は購入終了の24時間前までに解約しない場合、同じ条件で更新されます。
            {' '}
            <Text style={styles.link} onPress={() => Linking.openURL('https://futakoto.web.app/terms.html')}>利用規約</Text>
            {' '}/{' '}
            <Text style={styles.link} onPress={() => Linking.openURL('https://futakoto.web.app/privacy.html')}>プライバシーポリシー</Text>
          </Text>

          {!isPurchasesConfigured() ? (
            <Text style={styles.devNote}>
              ※ 開発中：App Store Connect 課金設定が完了するまで購入処理は無効です。
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
  },
  close: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.aiBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  reason: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  features: {
    marginTop: 8,
    marginBottom: 16,
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: COLORS.textBody,
  },
  priceBox: {
    backgroundColor: COLORS.aiBgSoft,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
  },
  priceLabel: {
    fontSize: 13,
    color: COLORS.textSubtle,
    marginBottom: 4,
  },
  price: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.ai,
  },
  pricePer: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  priceNote: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
    lineHeight: 18,
  },
  cta: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  restoreText: {
    fontSize: 13,
    color: COLORS.primary,
    textAlign: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  legalText: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
    textAlign: 'center',
  },
  link: {
    textDecorationLine: 'underline',
  },
  devNote: {
    marginTop: 10,
    fontSize: 11,
    color: COLORS.errorText,
    textAlign: 'center',
  },
});
