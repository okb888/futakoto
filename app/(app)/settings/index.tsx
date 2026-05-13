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
import { ArrowRight } from 'phosphor-react-native';
import { signOut } from 'firebase/auth';
import Constants from 'expo-constants';
import { auth } from '../../../lib/firebase';
import { useSettingsProfile } from '../../../hooks/useSettingsProfile';
import { DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE } from '../../../lib/notifications';
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
  label: string;
  value?: string;
  showChevron?: boolean;
  danger?: boolean;
  onPress?: () => void;
};

function SettingRow({ label, value, showChevron = true, danger = false, onPress }: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* アカウント */}
      <Text style={styles.sectionLabel}>アカウント</Text>
      <View style={styles.section}>
        <SettingRow
          label="表示名"
          value={profile?.displayName ?? '未設定'}
          onPress={() => router.push('/(app)/settings/account')}
        />
        <SectionDivider />
        <SettingRow
          label="パスワード・データ管理"
          onPress={() => router.push('/(app)/settings/account')}
        />
      </View>

      {/* パートナー連携 */}
      <Text style={styles.sectionLabel}>パートナー連携</Text>
      <View style={styles.section}>
        <SettingRow
          label="連携状況"
          value={profile?.partnerUid
            ? `❤ ${partnerProfile?.displayName ?? '連携中'}`
            : '未連携'}
          onPress={() => router.push('/(app)/settings/partner')}
        />
        <SectionDivider />
        <SettingRow
          label="招待コード"
          onPress={() => router.push('/(app)/settings/partner')}
        />
      </View>

      {/* 通知 */}
      <Text style={styles.sectionLabel}>通知</Text>
      <View style={styles.section}>
        <SettingRow
          label="毎日のリマインダー"
          value={reminderOn ? reminderTime : 'OFF'}
          onPress={() => router.push('/(app)/settings/notifications')}
        />
        <SectionDivider />
        <SettingRow
          label="パートナー投稿通知"
          value={partnerNotifOn ? 'ON' : 'OFF'}
          onPress={() => router.push('/(app)/settings/notifications')}
        />
      </View>

      {/* AI */}
      <Text style={styles.sectionLabel}>AIアシスタント</Text>
      <View style={styles.section}>
        <SettingRow
          label="話し方スタイル"
          value={persona}
          onPress={() => router.push('/(app)/settings/ai')}
        />
        <SectionDivider />
        <SettingRow
          label="AI利用量・プレミアム"
          onPress={() => router.push('/(app)/settings/ai')}
        />
      </View>

      {/* その他 */}
      <Text style={styles.sectionLabel}>その他</Text>
      <View style={styles.section}>
        <SettingRow
          label="プライバシーポリシー"
          onPress={() => Linking.openURL('https://futakoto.jp/privacy')}
        />
        <SectionDivider />
        <SettingRow
          label="利用規約"
          onPress={() => Linking.openURL('https://futakoto.jp/terms')}
        />
        <SectionDivider />
        <SettingRow
          label="バージョン"
          value={Constants.expoConfig?.version ?? '—'}
          showChevron={false}
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
  rowLabel: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '400' },
  rowLabelDanger: { color: COLORS.error },
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
