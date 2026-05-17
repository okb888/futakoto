import { useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  StyleSheet as RN,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  Bell,
  EnvelopeSimple,
  FileText,
  Heart,
  Lock,
  SignOut,
  Sparkle,
  Star,
  Trash,
  User,
} from 'phosphor-react-native';
import { signOut } from 'firebase/auth';
import Constants from 'expo-constants';
import { PaywallModal } from '../../../components/PaywallModal';
import { auth } from '../../../lib/firebase';
import { useSettingsProfile } from '../../../hooks/useSettingsProfile';
import { DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE } from '../../../lib/notifications';
import { AI_FREE_MONTHLY_LIMIT } from '../../../lib/db';
import { COLORS } from '../../../lib/theme';

function formatTime(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const PERSONA_LABEL: Record<string, string> = {
  soft: 'ソフト',
  friendly: 'フレンドリー',
  logical: 'ロジカル',
};

type SettingRowProps = {
  icon?: ReactNode;
  label: string;
  subtitle?: string;
  value?: string;
  showChevron?: boolean;
  danger?: boolean;
  onPress?: () => void;
};

function SettingRow({ icon, label, subtitle, value, showChevron = true, danger = false, onPress }: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      <View style={styles.rowLeft}>
        {icon ? <View style={[styles.iconBox, danger && styles.iconBoxDanger]}>{icon}</View> : null}
        <View style={styles.rowTextBlock}>
          <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
          {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
        {showChevron && onPress ? (
          <ArrowRight size={14} color={COLORS.disabled} weight="bold" />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function SectionDivider() {
  return <View style={styles.divider} />;
}

function hasActivePremium(profile: { premium?: boolean; premiumExpiresAt?: any } | null): boolean {
  if (!profile?.premium) return false;
  const expires = profile.premiumExpiresAt;
  if (!expires) return true;
  const ms = typeof expires?.toMillis === 'function' ? expires.toMillis() : 0;
  return ms === 0 || ms > Date.now();
}

export default function SettingsIndexScreen() {
  const router = useRouter();
  const { profile, partnerProfile, load } = useSettingsProfile();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const notif = profile?.notificationSettings;
  const reminderOn = notif?.dailyReminderEnabled ?? false;
  const reminderTime = formatTime(
    notif?.dailyReminderHour ?? DEFAULT_REMINDER_HOUR,
    notif?.dailyReminderMinute ?? DEFAULT_REMINDER_MINUTE,
  );
  const partnerNotifOn = notif?.sharedPostNotificationsEnabled ?? false;
  const persona = PERSONA_LABEL[profile?.aiPersona ?? 'soft'] ?? 'ソフト';
  const isPremium = hasActivePremium(profile) || hasActivePremium(partnerProfile);
  const aiLimit = profile?.aiCreditsLimit ?? AI_FREE_MONTHLY_LIMIT;
  const aiUsed = profile?.aiCreditsUsed ?? 0;
  const aiRemaining = Math.max(0, aiLimit - aiUsed);
  const premiumValue = isPremium ? '利用中' : `AI残り ${aiRemaining}/${aiLimit}回`;
  const iconColor = COLORS.textMuted;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* アカウント */}
      <Text style={styles.sectionLabel}>アカウント</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<User size={20} color={iconColor} weight="regular" />}
          label="アカウント"
          subtitle="表示名・ログイン方法・データ管理"
          value={profile?.displayName ?? '未設定'}
          onPress={() => router.push('/(app)/settings/account')}
        />
      </View>

      {/* パートナー連携 */}
      <Text style={styles.sectionLabel}>パートナー連携</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<Heart size={20} color={iconColor} weight="regular" />}
          label="パートナー連携"
          subtitle="招待コード・連携状況"
          value={profile?.partnerUid
            ? (partnerProfile?.displayName ?? '連携中')
            : '未連携'}
          onPress={() => router.push('/(app)/settings/partner')}
        />
      </View>

      {/* サブスクリプション */}
      <Text style={styles.sectionLabel}>サブスクリプション</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<Star size={20} color={iconColor} weight="regular" />}
          label="プレミアム"
          subtitle="AI機能を無制限で使う"
          value={premiumValue}
          onPress={() => setPaywallOpen(true)}
        />
      </View>

      {/* 通知 */}
      <Text style={styles.sectionLabel}>通知</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<Bell size={20} color={iconColor} weight="regular" />}
          label="通知"
          subtitle={`パートナー投稿通知 ${partnerNotifOn ? 'ON' : 'OFF'}`}
          value={reminderOn ? reminderTime : 'OFF'}
          onPress={() => router.push('/(app)/settings/notifications')}
        />
      </View>

      {/* AI */}
      <Text style={styles.sectionLabel}>AI</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<Sparkle size={20} color={iconColor} weight="regular" />}
          label="AI口調・送信範囲"
          subtitle="話し方スタイルとAI利用量"
          value={persona}
          onPress={() => router.push('/(app)/settings/ai')}
        />
      </View>

      {/* その他 */}
      <Text style={styles.sectionLabel}>その他</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<EnvelopeSimple size={20} color={iconColor} weight="regular" />}
          label="お問い合わせ"
          onPress={() => Linking.openURL('https://futakoto.web.app/support.html')}
        />
        <SectionDivider />
        <SettingRow
          icon={<FileText size={20} color={iconColor} weight="regular" />}
          label="利用規約"
          onPress={() => Linking.openURL('https://futakoto.web.app/terms.html')}
        />
        <SectionDivider />
        <SettingRow
          icon={<Lock size={20} color={iconColor} weight="regular" />}
          label="プライバシーポリシー"
          onPress={() => Linking.openURL('https://futakoto.web.app/privacy.html')}
        />
        <SectionDivider />
        <SettingRow
          icon={<Heart size={20} color={iconColor} weight="regular" />}
          label="レビューで応援"
          onPress={() => Alert.alert('正式リリース後にお願いします', 'App Store公開後、この行からレビューを書けるようにします。')}
        />
        <SectionDivider />
        <SettingRow
          label="バージョン"
          value={Constants.expoConfig?.version ?? '—'}
          showChevron={false}
        />
      </View>

      <Text style={styles.sectionLabel}>セッション</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<SignOut size={20} color={iconColor} weight="regular" />}
          label="ログアウト"
          onPress={() =>
            Alert.alert(
              'ログアウトしますか？',
              'もう一度ログインが必要になります',
              [
                { text: 'キャンセル', style: 'cancel' },
                { text: 'ログアウト', style: 'destructive', onPress: () => signOut(auth) },
              ]
            )
          }
        />
        <SectionDivider />
        <SettingRow
          icon={<Trash size={20} color={COLORS.error} weight="regular" />}
          label="アカウント削除"
          danger
          onPress={() => router.push('/(app)/settings/account')}
        />
      </View>

      </ScrollView>

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => {
          setPaywallOpen(false);
          load();
        }}
      />
    </>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 60,
    backgroundColor: COLORS.surface,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxDanger: { backgroundColor: COLORS.errorBg },
  rowTextBlock: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  rowLabelDanger: { color: COLORS.error },
  rowSubtitle: { marginTop: 3, fontSize: 12, color: COLORS.textWeak },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  rowValue: { fontSize: 14, color: COLORS.textMuted, maxWidth: 140 },
  divider: {
    height: RN.hairlineWidth,
    backgroundColor: COLORS.borderSoft,
    marginLeft: 68,
  },
});
