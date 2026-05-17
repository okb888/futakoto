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
  User,
  Heart,
  Star,
  Bell,
  Sparkle,
  Envelope,
  FileText,
  Lock,
} from 'phosphor-react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { useSettingsProfile } from '../../../hooks/useSettingsProfile';
import { DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE } from '../../../lib/notifications';
import { COLORS } from '../../../lib/theme';
import { AI_FREE_MONTHLY_LIMIT } from '../../../lib/db';

function formatTime(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const PERSONA_LABEL: Record<string, string> = {
  soft: 'ソフト',
  friendly: 'フレンドリー',
  logical: 'ロジカル',
};

type SettingRowProps = {
  icon?: React.ReactNode;
  label: string;
  subtitle?: string;
  value?: string;
  showChevron?: boolean;
  danger?: boolean;
  onPress?: () => void;
};

function SettingRow({
  icon,
  label,
  subtitle,
  value,
  showChevron = true,
  danger = false,
  onPress,
}: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        {value ? (
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
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

export default function SettingsIndexScreen() {
  const router = useRouter();
  const { profile, partnerProfile } = useSettingsProfile();

  const notif = profile?.notificationSettings;
  const reminderOn = notif?.dailyReminderEnabled ?? false;
  const reminderTime = formatTime(
    notif?.dailyReminderHour ?? DEFAULT_REMINDER_HOUR,
    notif?.dailyReminderMinute ?? DEFAULT_REMINDER_MINUTE,
  );
  const partnerNotifOn = notif?.sharedPostNotificationsEnabled ?? false;
  const persona = PERSONA_LABEL[profile?.aiPersona ?? 'soft'] ?? 'ソフト';

  // AI残り回数の計算
  const aiLimit = profile?.aiCreditsLimit ?? AI_FREE_MONTHLY_LIMIT;
  const aiUsed = profile?.aiCreditsUsed ?? 0;
  const aiRemaining = Math.max(0, aiLimit - aiUsed);
  const aiUsageValue = profile ? `AI残り ${aiRemaining}/${aiLimit}回` : 'AI残り —';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* アカウント */}
      <Text style={styles.sectionLabel}>アカウント</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<User size={18} color={COLORS.textMuted} />}
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
          icon={<Heart size={18} color={COLORS.partner} />}
          label="パートナー連携"
          subtitle="招待コード・連携状況"
          value={
            profile?.partnerUid
              ? (partnerProfile?.displayName ?? '連携中')
              : '未連携'
          }
          onPress={() => router.push('/(app)/settings/partner')}
        />
      </View>

      {/* サブスクリプション */}
      <Text style={styles.sectionLabel}>サブスクリプション</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<Star size={18} color={COLORS.textMuted} />}
          label="プレミアム"
          subtitle="AI機能を無制限で使う"
          value={aiUsageValue}
          onPress={() => router.push('/(app)/settings/ai')}
        />
      </View>

      {/* 通知 */}
      <Text style={styles.sectionLabel}>通知</Text>
      <View style={styles.section}>
        <SettingRow
          icon={<Bell size={18} color={COLORS.textMuted} />}
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
          icon={<Sparkle size={18} color={COLORS.ai} />}
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
          icon={<Envelope size={18} color={COLORS.textMuted} />}
          label="お問い合わせ"
          onPress={() => Linking.openURL('mailto:support@futakoto.jp')}
        />
        <SectionDivider />
        <SettingRow
          icon={<FileText size={18} color={COLORS.textMuted} />}
          label="利用規約"
          onPress={() => Linking.openURL('https://futakoto.jp/terms')}
        />
        <SectionDivider />
        <SettingRow
          icon={<Lock size={18} color={COLORS.textMuted} />}
          label="プライバシーポリシー"
          onPress={() => Linking.openURL('https://futakoto.jp/privacy')}
        />
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
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
      >
        <Text style={styles.logoutText}>ログアウト</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.dangerButton}
        onPress={() => router.push('/(app)/settings/account')}
      >
        <Text style={styles.dangerText}>アカウントを削除</Text>
      </TouchableOpacity>

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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    backgroundColor: COLORS.surface,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, color: COLORS.text, fontWeight: '400' },
  rowLabelDanger: { color: COLORS.error },
  rowSubtitle: { fontSize: 12, color: COLORS.textWeak, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  rowValue: { fontSize: 14, color: COLORS.textMuted, maxWidth: 140 },
  divider: {
    height: RN.hairlineWidth,
    backgroundColor: COLORS.borderSoft,
    marginLeft: 16,
  },
  logoutButton: { marginTop: 32, paddingVertical: 14, alignItems: 'center' },
  logoutText: { fontSize: 15, color: COLORS.textWeak },
  dangerButton: { paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  dangerText: { fontSize: 14, color: COLORS.error },
});
