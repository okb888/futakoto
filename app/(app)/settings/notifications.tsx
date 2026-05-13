import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { Bell, Clock, Heart } from 'phosphor-react-native';
import { useAuth } from '../../../lib/auth';
import { updateNotificationSettings, type NotificationSettings } from '../../../lib/db';
import {
  cancelDailyReminder,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  getExpoProjectId,
  registerPushToken,
  scheduleDailyReminder,
} from '../../../lib/notifications';
import { firebaseErrorMessage } from '../../../lib/errors';
import { useSettingsProfile } from '../../../hooks/useSettingsProfile';
import { TimePickerSheet } from '../../../components/TimePickerSheet';
import { COLORS } from '../../../lib/theme';

function withDefaults(settings?: NotificationSettings): Required<NotificationSettings> {
  return {
    dailyReminderEnabled: settings?.dailyReminderEnabled ?? false,
    dailyReminderHour: settings?.dailyReminderHour ?? DEFAULT_REMINDER_HOUR,
    dailyReminderMinute: settings?.dailyReminderMinute ?? DEFAULT_REMINDER_MINUTE,
    sharedPostNotificationsEnabled: settings?.sharedPostNotificationsEnabled ?? false,
  };
}

function formatTime(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { profile, setProfile } = useSettingsProfile();

  const notif = withDefaults(profile?.notificationSettings);
  const [loading, setLoading] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [pickerTime, setPickerTime] = useState({
    hour: notif.dailyReminderHour,
    minute: notif.dailyReminderMinute,
  });

  async function saveNotificationSettings(next: Required<NotificationSettings>) {
    if (!user) return;
    await updateNotificationSettings(user.uid, next);
    setProfile(current => current ? { ...current, notificationSettings: next } : current);
  }

  async function toggleDailyReminder(enabled: boolean) {
    if (!user) return;
    setLoading(true);
    try {
      const next = { ...notif, dailyReminderEnabled: enabled };
      if (enabled) {
        const ok = await scheduleDailyReminder(notif.dailyReminderHour, notif.dailyReminderMinute);
        if (!ok) {
          Alert.alert('通知を有効にできませんでした', '端末の通知許可を確認してください');
          return;
        }
      } else {
        await cancelDailyReminder();
      }
      await saveNotificationSettings(next);
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function toggleSharedPostNotifications(enabled: boolean) {
    if (!user) return;
    setLoading(true);
    try {
      const next = { ...notif, sharedPostNotificationsEnabled: enabled };
      if (enabled) {
        const token = await registerPushToken(user.uid);
        if (!token) {
          const message = getExpoProjectId()
            ? '実機の通知許可を確認してください'
            : 'EAS projectId が設定された開発ビルド、または本番ビルドで有効にできます';
          Alert.alert('通知を有効にできませんでした', message);
          return;
        }
      }
      await saveNotificationSettings(next);
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveReminderTime() {
    if (!user || loading) return;
    setLoading(true);
    const next = {
      ...notif,
      dailyReminderHour: pickerTime.hour,
      dailyReminderMinute: pickerTime.minute,
    };
    try {
      if (next.dailyReminderEnabled) {
        const ok = await scheduleDailyReminder(next.dailyReminderHour, next.dailyReminderMinute);
        if (!ok) {
          Alert.alert('通知を更新できませんでした', '端末の通知許可を確認してください');
          return;
        }
      }
      await saveNotificationSettings(next);
      setTimePickerOpen(false);
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <Text style={styles.sectionLabel}>毎日のリマインダー</Text>
      <View style={styles.section}>
        <View style={styles.notifRow}>
          <View style={styles.iconBox}>
            <Bell size={20} color={COLORS.primary} weight="fill" />
          </View>
          <View style={styles.notifContent}>
            <Text style={styles.notifTitle}>毎日の記録リマインダー</Text>
            <Text style={styles.notifSub}>毎日、そっと記録を促します</Text>
          </View>
          <Switch
            value={notif.dailyReminderEnabled}
            onValueChange={toggleDailyReminder}
            disabled={loading}
            trackColor={{ false: COLORS.border, true: COLORS.primaryDim }}
            thumbColor={notif.dailyReminderEnabled ? COLORS.primary : COLORS.surface}
          />
        </View>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.timeRow}
          onPress={() => {
            setPickerTime({ hour: notif.dailyReminderHour, minute: notif.dailyReminderMinute });
            setTimePickerOpen(true);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.timeIcon}>
            <Clock size={14} color={COLORS.primary} weight="bold" />
          </View>
          <View style={styles.timeLabelBlock}>
            <Text style={styles.timeLabel}>リマインダー時刻</Text>
            <Text style={styles.timeHint}>好きな時間に変更できます</Text>
          </View>
          <View style={styles.timeChip}>
            <Text style={styles.timeText}>
              {formatTime(notif.dailyReminderHour, notif.dailyReminderMinute)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>パートナー投稿通知</Text>
      <View style={styles.section}>
        <View style={styles.notifRow}>
          <View style={[styles.iconBox, { backgroundColor: COLORS.partnerBgSoft }]}>
            <Heart size={20} color={COLORS.partner} weight="fill" />
          </View>
          <View style={styles.notifContent}>
            <Text style={styles.notifTitle}>相手の共有投稿</Text>
            <Text style={styles.notifSub}>本文は出さず、届いたことだけ知らせます</Text>
          </View>
          <Switch
            value={notif.sharedPostNotificationsEnabled}
            onValueChange={toggleSharedPostNotifications}
            disabled={loading}
            trackColor={{ false: COLORS.border, true: COLORS.partnerBorder }}
            thumbColor={notif.sharedPostNotificationsEnabled ? COLORS.partner : COLORS.surface}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : null}

      <TimePickerSheet
        visible={timePickerOpen}
        title="リマインダー時刻"
        previewLabel="この時間に通知します"
        hour={pickerTime.hour}
        minute={pickerTime.minute}
        saving={loading}
        onChangeHour={h => setPickerTime(t => ({ ...t, hour: h }))}
        onChangeMinute={m => setPickerTime(t => ({ ...t, minute: m }))}
        onCancel={() => setTimePickerOpen(false)}
        onSave={saveReminderTime}
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
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  notifSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 3, lineHeight: 16 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.borderSoft,
    marginLeft: 16,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingLeft: 16,
    gap: 12,
  },
  timeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeLabelBlock: { flex: 1 },
  timeLabel: { color: COLORS.textSubtle, fontSize: 13, fontWeight: '700' },
  timeHint: { color: COLORS.textWeak, fontSize: 11, marginTop: 2 },
  timeChip: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  timeText: { fontSize: 15, fontWeight: '700', color: COLORS.primaryDeep },
});
