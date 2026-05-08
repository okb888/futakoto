import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Share,
  Switch,
  Modal,
  Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Bell, Clock, DownloadSimple, EnvelopeSimple, Heart, Sparkle } from 'phosphor-react-native';
import {
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import { useFocusEffect } from 'expo-router';
import { TimePickerSheet } from '../../components/TimePickerSheet';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import {
  getUserProfile,
  getUserExportData,
  updateDisplayName,
  updateNotificationSettings,
  updateCommunicationStyle,
  NotificationSettings,
  UserProfile,
} from '../../lib/db';
import { pairWithCode, unpairPartner, deleteAccount, regenerateInviteCode } from '../../lib/ai';
import {
  cancelDailyReminder,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  getExpoProjectId,
  registerPushToken,
  scheduleDailyReminder,
} from '../../lib/notifications';
import { firebaseErrorMessage } from '../../lib/errors';
import { COLORS } from '../../lib/theme';

function withDefaults(settings?: NotificationSettings): Required<NotificationSettings> {
  return {
    dailyReminderEnabled: settings?.dailyReminderEnabled ?? false,
    dailyReminderHour: settings?.dailyReminderHour ?? DEFAULT_REMINDER_HOUR,
    dailyReminderMinute: settings?.dailyReminderMinute ?? DEFAULT_REMINDER_MINUTE,
    sharedPostNotificationsEnabled: settings?.sharedPostNotificationsEnabled ?? false,
  };
}

function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeForExport(value: any): any {
  if (!value) return value;
  if (value.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeForExport);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeForExport(item)]));
  }
  return value;
}

export default function SettingsScreen() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [notificationSettings, setNotificationSettings] = useState(withDefaults());
  const [loading, setLoading] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [pickerHour, setPickerHour] = useState(DEFAULT_REMINDER_HOUR);
  const [pickerMinute, setPickerMinute] = useState(DEFAULT_REMINDER_MINUTE);
  const [copied, setCopied] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [styleInput, setStyleInput] = useState('');
  const [styleSaved, setStyleSaved] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [emailVerified, setEmailVerified] = useState(user?.emailVerified ?? true);

  async function load(
    isCancelled: () => boolean = () => false,
    profileOverride?: UserProfile | null
  ) {
    if (!user) return;
    const p = profileOverride ?? await getUserProfile(user.uid) ?? authProfile ?? await refreshProfile();
    if (isCancelled() || !p) return;
    setProfile(p);
    setNotificationSettings(withDefaults(p.notificationSettings));
    setNameInput(p.displayName ?? '');
    setStyleInput(p.communicationStyle ?? '');
    if (p?.partnerUid) {
      const pp = await getUserProfile(p.partnerUid);
      if (isCancelled()) return;
      setPartnerProfile(pp);
    } else {
      setPartnerProfile(null);
    }
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [user, authProfile]));

  async function handleCopy() {
    if (!profile?.inviteCode) return;
    await Clipboard.setStringAsync(profile.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!profile?.inviteCode) return;
    const message = `「ふたこと」というアプリで気持ちを共有しよう。\n\n招待コード: ${profile.inviteCode}\n\n設定画面でこのコードを入力してね。`;
    try {
      await Share.share({ message });
    } catch (e) {}
  }

  function handleRegenerateInviteCode() {
    if (!user || regeneratingCode) return;
    Alert.alert(
      'コードを作り直しますか？',
      '今の招待コードは使えなくなります。すでに連携中のパートナーとの接続は変わりません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '作り直す',
          style: 'destructive',
          onPress: async () => {
            setRegeneratingCode(true);
            try {
              const result = await regenerateInviteCode();
              setProfile((current) => current ? { ...current, inviteCode: result.inviteCode } : current);
              await refreshProfile();
              setCopied(false);
              Alert.alert('新しいコードを作りました', '古いコードは使えなくなりました');
            } catch (e: any) {
              Alert.alert('エラー', firebaseErrorMessage(e));
            } finally {
              setRegeneratingCode(false);
            }
          },
        },
      ]
    );
  }

  async function handlePair() {
    if (!user || !inputCode.trim()) return;
    setLoading(true);
    try {
      await pairWithCode(inputCode.trim().toUpperCase());
      const nextProfile = await refreshProfile();
      await load(() => false, nextProfile);
      setInputCode('');
      Alert.alert('ペアリング完了', 'パートナーと繋がりました');
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleUnpair() {
    if (!user || !profile?.partnerUid) return;
    Alert.alert('解除しますか？', 'パートナーとの接続を解除します。自分の投稿は残ります', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '解除する',
        style: 'destructive',
        onPress: async () => {
          await unpairPartner();
          const nextProfile = await refreshProfile();
          await load(() => false, nextProfile);
        },
      },
    ]);
  }

  async function handleSaveStyle() {
    if (!user) return;
    await updateCommunicationStyle(user.uid, styleInput.trim());
    await refreshProfile();
    setStyleSaved(true);
    setTimeout(() => setStyleSaved(false), 2000);
  }

  async function handleSaveName() {
    if (!user || !nameInput.trim()) {
      Alert.alert('名前を入力してください');
      return;
    }
    await updateDisplayName(user.uid, nameInput.trim());
    setEditingName(false);
    const nextProfile = await refreshProfile();
    await load(() => false, nextProfile);
  }

  async function saveNotificationSettings(next: Required<NotificationSettings>) {
    if (!user) return;
    setNotificationSettings(next);
    await updateNotificationSettings(user.uid, next);
    setProfile((current) => current ? { ...current, notificationSettings: next } : current);
  }

  async function toggleDailyReminder(enabled: boolean) {
    if (!user) return;
    setNotificationLoading(true);
    try {
      const next = { ...notificationSettings, dailyReminderEnabled: enabled };
      if (enabled) {
        const ok = await scheduleDailyReminder(
          notificationSettings.dailyReminderHour,
          notificationSettings.dailyReminderMinute
        );
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
      setNotificationLoading(false);
    }
  }

  function openReminderTimePicker() {
    setPickerHour(notificationSettings.dailyReminderHour);
    setPickerMinute(notificationSettings.dailyReminderMinute);
    setTimePickerOpen(true);
  }

  async function saveReminderTime() {
    if (!user || notificationLoading) return;
    setNotificationLoading(true);
    const next = {
      ...notificationSettings,
      dailyReminderHour: pickerHour,
      dailyReminderMinute: pickerMinute,
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
      setNotificationLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user || deleteLoading) return;
    const providerId = user.providerData[0]?.providerId ?? 'password';

    if (providerId === 'password' && !deletePassword.trim()) {
      Alert.alert('パスワードを入力してください');
      return;
    }

    setDeleteLoading(true);
    try {
      if (providerId === 'password') {
        const credential = EmailAuthProvider.credential(user.email!, deletePassword);
        await reauthenticateWithCredential(user, credential);
      }
      // Google / Apple 再認証はプロバイダ実装時に追加
      await deleteAccount();
      await signOut(auth).catch(() => {});
    } catch (e: any) {
      const isWrongPassword =
        e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential';
      Alert.alert(
        isWrongPassword ? 'パスワードが違います' : '削除に失敗しました',
        isWrongPassword ? 'もう一度確認してください' : e.message
      );
      setDeleteLoading(false);
      setDeletePassword('');
    }
  }

  async function handleResendVerification() {
    const currentUser = auth.currentUser;
    if (!currentUser || sendingVerification) return;
    setSendingVerification(true);
    try {
      await reload(currentUser);
      if (currentUser.emailVerified) {
        setEmailVerified(true);
        Alert.alert('認証済みです', 'メールアドレスはすでに認証されています');
        return;
      }
      await sendEmailVerification(currentUser);
      Alert.alert('メールを送信しました', '届いた確認メールのリンクをタップしてください');
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setSendingVerification(false);
    }
  }

  async function handleSendPasswordReset() {
    if (!user?.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      Alert.alert('メールを送信しました', 'パスワード再設定用のメールを確認してください');
    } catch (e: any) {
      Alert.alert('送信に失敗しました', firebaseErrorMessage(e));
    }
  }

  async function handleExportData() {
    if (!user || exporting) return;
    setExporting(true);
    try {
      const data = await getUserExportData(user.uid);
      const payload = {
        exportedAt: new Date().toISOString(),
        app: 'futakoto',
        data: normalizeForExport(data),
      };
      await Share.share({
        message: JSON.stringify(payload, null, 2),
      });
    } catch (e: any) {
      Alert.alert('エクスポートに失敗しました', firebaseErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  async function toggleSharedPostNotifications(enabled: boolean) {
    if (!user) return;
    setNotificationLoading(true);
    try {
      const next = { ...notificationSettings, sharedPostNotificationsEnabled: enabled };
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
      setNotificationLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <Text style={styles.sectionTitle}>表示名</Text>
      {editingName ? (
        <View style={styles.nameEditRow}>
          <TextInput
            style={styles.input}
            value={nameInput}
            onChangeText={setNameInput}
            placeholder="名前"
            placeholderTextColor="#BBB"
            maxLength={20}
            autoFocus
          />
          <TouchableOpacity style={styles.smallButton} onPress={handleSaveName}>
            <Text style={styles.smallButtonText}>保存</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.row} onPress={() => setEditingName(true)}>
          <Text style={styles.rowValue}>{profile?.displayName ?? '未設定'}</Text>
          <Text style={styles.editText}>編集</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>自分の招待コード</Text>
      <Text style={styles.hint}>このコードをパートナーに送って</Text>
      <View style={styles.codeBox}>
        <Text style={styles.codeText}>
          {profile?.inviteCode ?? '...'}
        </Text>
      </View>
      <View style={styles.codeButtons}>
        <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
          <Text style={styles.copyButtonText}>{copied ? '✓ コピー済み' : 'コピー'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>共有</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.regenerateButton, regeneratingCode && { opacity: 0.6 }]}
        onPress={handleRegenerateInviteCode}
        disabled={!profile?.inviteCode || regeneratingCode}
      >
        {regeneratingCode ? (
          <ActivityIndicator color="#7B9E87" size="small" />
        ) : (
          <Text style={styles.regenerateButtonText}>コードを作り直す</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>パートナー</Text>
      {profile?.partnerUid ? (
        <View style={styles.pairedBox}>
          <Heart size={24} color="#E58B8B" weight="fill" />
          <View style={styles.pairedInfo}>
            <Text style={styles.pairedLabel}>連携中</Text>
            <Text style={styles.pairedEmail}>
              {partnerProfile?.displayName ?? partnerProfile?.email ?? ''}
            </Text>
          </View>
          <TouchableOpacity onPress={handleUnpair}>
            <Text style={styles.unpairText}>解除</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <Text style={styles.hint}>パートナーの6桁コードを入力</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="ABCDEF"
              placeholderTextColor="#CCC"
              value={inputCode}
              onChangeText={(t) => setInputCode(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.pairButton, inputCode.length !== 6 && styles.pairButtonDisabled]}
              onPress={handlePair}
              disabled={loading || inputCode.length !== 6}
              accessibilityLabel="パートナーと繋がる"
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.pairButtonText}>繋がる</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>パートナーへの伝え方</Text>
      <Text style={styles.hint}>AIが文案を作るときの文体や雰囲気を指定できます（例: タメ口でやわらかく）</Text>
      <View style={styles.nameEditRow}>
        <TextInput
          style={styles.input}
          value={styleInput}
          onChangeText={setStyleInput}
          placeholder="タメ口でやわらかく、など（任意）"
          placeholderTextColor="#BBB"
          maxLength={50}
        />
        <TouchableOpacity style={styles.smallButton} onPress={handleSaveStyle}>
          <Text style={styles.smallButtonText}>{styleSaved ? '✓' : '保存'}</Text>
        </TouchableOpacity>
      </View>
      {styleInput.length > 0 && (
        <Text style={styles.styleCharCount}>{styleInput.length}/50</Text>
      )}

      <Text style={styles.sectionTitle}>AI利用量</Text>
      <View style={styles.aiUsageBox}>
        <View style={styles.notificationIconBox}>
          <Sparkle size={22} color="#7C5BB7" weight="fill" />
        </View>
        <View style={styles.aiUsageContent}>
          <View style={styles.aiUsageHeader}>
            <Text style={styles.notificationTitle}>今月のAI利用</Text>
            <Text style={styles.aiUsageCount}>
              {profile?.aiCreditsMonth === currentMonthKey() ? (profile.aiCreditsUsed ?? 0) : 0}
              /{profile?.aiCreditsLimit ?? 500}
            </Text>
          </View>
          <View style={styles.aiUsageTrack}>
            <View
              style={[
                styles.aiUsageFill,
                {
                  width: `${Math.min(
                    100,
                    (((profile?.aiCreditsMonth === currentMonthKey() ? (profile.aiCreditsUsed ?? 0) : 0)
                      / (profile?.aiCreditsLimit ?? 500)) * 100)
                  )}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.notificationSub}>月が変わると自動でリセットされます</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>通知</Text>
      <View style={[styles.notificationBox, styles.notificationBoxStack]}>
        <View style={styles.notificationHeaderRow}>
          <View style={styles.notificationIconBox}>
            <Bell size={22} color="#7B9E87" weight="fill" />
          </View>
          <View style={styles.notificationContent}>
            <Text style={styles.notificationTitle}>毎日の記録リマインダー</Text>
            <Text style={styles.notificationSub}>毎日、そっと記録を促します</Text>
          </View>
          <Switch
            value={notificationSettings.dailyReminderEnabled}
            onValueChange={toggleDailyReminder}
            disabled={notificationLoading}
            trackColor={{ false: COLORS.border, true: COLORS.primaryDim }}
            thumbColor={notificationSettings.dailyReminderEnabled ? COLORS.primary : '#fff'}
          />
        </View>
        <TouchableOpacity
          style={styles.reminderTimeArea}
          onPress={openReminderTimePicker}
          activeOpacity={0.7}
        >
          <View style={styles.reminderTimeLabelRow}>
            <View style={styles.reminderTimeIcon}>
              <Clock size={14} color="#7B9E87" weight="bold" />
            </View>
            <View>
              <Text style={styles.reminderTimeLabel}>リマインダー時刻</Text>
              <Text style={styles.reminderTimeHint}>好きな時間に変更できます</Text>
            </View>
          </View>
          <View style={styles.reminderTimeChip}>
            <Text style={styles.reminderTimeText}>
              {formatReminderTime(
                notificationSettings.dailyReminderHour,
                notificationSettings.dailyReminderMinute
              )}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
      <View style={styles.notificationBox}>
        <View style={styles.notificationIconBox}>
          <Heart size={22} color="#E58B8B" weight="fill" />
        </View>
        <View style={styles.notificationContent}>
          <Text style={styles.notificationTitle}>相手の共有投稿</Text>
          <Text style={styles.notificationSub}>本文は出さず、届いたことだけ知らせます</Text>
        </View>
        <Switch
          value={notificationSettings.sharedPostNotificationsEnabled}
          onValueChange={toggleSharedPostNotifications}
          disabled={notificationLoading}
          trackColor={{ false: COLORS.border, true: COLORS.partnerBorder }}
          thumbColor={notificationSettings.sharedPostNotificationsEnabled ? COLORS.partner : '#fff'}
        />
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>アカウント</Text>
      {!emailVerified && user?.providerData[0]?.providerId === 'password' && (
        <View style={styles.verificationBanner}>
          <Text style={styles.verificationBannerText}>メールアドレスが未認証です</Text>
          <TouchableOpacity
            style={[styles.verificationResendButton, sendingVerification && { opacity: 0.6 }]}
            onPress={handleResendVerification}
            disabled={sendingVerification}
          >
            {sendingVerification ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <Text style={styles.verificationResendText}>認証メールを再送</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {user?.providerData[0]?.providerId === 'password' ? (
        <TouchableOpacity style={styles.accountActionButton} onPress={handleSendPasswordReset}>
          <EnvelopeSimple size={17} color="#7B9E87" weight="bold" />
          <Text style={styles.accountActionText}>パスワード再設定メールを送る</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.accountActionButton, exporting && { opacity: 0.6 }]}
        onPress={handleExportData}
        disabled={exporting}
      >
        {exporting ? (
          <ActivityIndicator color="#7B9E87" size="small" />
        ) : (
          <DownloadSimple size={17} color="#7B9E87" weight="bold" />
        )}
        <Text style={styles.accountActionText}>データを書き出す</Text>
      </TouchableOpacity>

      <View style={styles.legalLinks}>
        <TouchableOpacity onPress={() => Linking.openURL('https://futakoto.jp/privacy')}>
          <Text style={styles.legalLinkText}>プライバシーポリシー</Text>
        </TouchableOpacity>
        <Text style={styles.legalSep}>·</Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://futakoto.jp/terms')}>
          <Text style={styles.legalLinkText}>利用規約</Text>
        </TouchableOpacity>
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
        style={styles.deleteButton}
        onPress={() => setDeleteModalOpen(true)}
      >
        <Text style={styles.deleteButtonText}>アカウントを削除</Text>
      </TouchableOpacity>

      <Modal
        visible={deleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!deleteLoading) setDeleteModalOpen(false); }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => { if (!deleteLoading) { setDeleteModalOpen(false); setDeletePassword(''); } }}
          />
          <View style={styles.deleteSheet}>
            <Text style={styles.deleteSheetTitle}>アカウントを削除</Text>
            <Text style={styles.deleteSheetBody}>
              すべての記録・壁打ち・お気に入りが完全に削除されます。この操作は取り消せません。
            </Text>
            {user?.providerData[0]?.providerId === 'password' ? (
              <>
                <Text style={styles.deleteSheetLabel}>パスワードを入力して確認</Text>
                <TextInput
                  style={styles.deleteInput}
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  placeholder="パスワード"
                  placeholderTextColor="#CCC"
                  secureTextEntry
                  autoFocus
                />
              </>
            ) : (
              <View style={styles.deleteProviderNote}>
                <Text style={styles.deleteProviderNoteText}>
                  {user?.providerData[0]?.providerId === 'google.com' ? 'Google' : 'Apple'}
                  アカウントで認証済みとして削除します。
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.deleteConfirmButton, deleteLoading && { opacity: 0.6 }]}
              onPress={handleDeleteAccount}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.deleteConfirmText}>削除する（取り消せません）</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteCancelButton}
              onPress={() => { setDeleteModalOpen(false); setDeletePassword(''); }}
              disabled={deleteLoading}
            >
              <Text style={styles.deleteCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <TimePickerSheet
        visible={timePickerOpen}
        title="リマインダー時刻"
        previewLabel="この時間に通知します"
        hour={pickerHour}
        minute={pickerMinute}
        saving={notificationLoading}
        onChangeHour={setPickerHour}
        onChangeMinute={setPickerMinute}
        onCancel={() => setTimePickerOpen(false)}
        onSave={saveReminderTime}
      />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24, paddingBottom: 64 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginTop: 28, marginBottom: 8, letterSpacing: 1 },
  hint: { fontSize: 12, color: COLORS.placeholder, marginBottom: 10 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowValue: { fontSize: 15, color: COLORS.text },
  editText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  nameEditRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  smallButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  smallButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  codeBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  codeText: { fontSize: 32, color: COLORS.text, fontFamily: 'Courier', letterSpacing: 6, fontWeight: '600' },
  codeButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  copyButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  copyButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  shareButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  shareButtonText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  regenerateButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  regenerateButtonText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  pairedBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.partnerBorder,
    gap: 12,
  },
  notificationBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    marginBottom: 10,
  },
  notificationBoxStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  notificationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationContent: { flex: 1 },
  notificationTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  notificationSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 3, lineHeight: 16 },
  aiUsageBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.aiBorder,
    gap: 12,
  },
  aiUsageContent: { flex: 1 },
  aiUsageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  aiUsageCount: { fontSize: 13, color: COLORS.ai, fontWeight: '700' },
  aiUsageTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.aiBg,
    overflow: 'hidden',
    marginTop: 9,
  },
  aiUsageFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.ai,
  },
  reminderTimeArea: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    paddingTop: 12,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reminderTimeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  reminderTimeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderTimeLabel: { color: COLORS.textSubtle, fontSize: 13, fontWeight: '700' },
  reminderTimeHint: { color: COLORS.textWeak, fontSize: 11, marginTop: 2 },
  reminderTimeChip: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reminderTimeText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primaryDeep,
    letterSpacing: 0,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(45,45,45,0.24)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  pairedInfo: { flex: 1 },
  pairedLabel: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  pairedEmail: { fontSize: 12, color: COLORS.textWeak, marginTop: 2 },
  unpairText: { fontSize: 12, color: COLORS.error },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  codeInput: { textAlign: 'center', fontSize: 18, letterSpacing: 4, fontFamily: 'Courier' },
  pairButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  pairButtonDisabled: { backgroundColor: COLORS.primaryDim },
  pairButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  styleCharCount: { fontSize: 11, color: COLORS.placeholder, textAlign: 'right', marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.borderSoft, marginTop: 32, marginBottom: 8 },
  accountActionButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  accountActionText: { flex: 1, fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  logoutButton: { paddingVertical: 16, alignItems: 'center' },
  logoutText: { fontSize: 14, color: COLORS.textWeak },
  deleteButton: { paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  deleteButtonText: { fontSize: 13, color: COLORS.error },
  deleteSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 12,
  },
  deleteSheetTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  deleteSheetBody: { fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },
  deleteSheetLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSubtle, marginTop: 4 },
  deleteInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  deleteProviderNote: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
  },
  deleteProviderNoteText: { fontSize: 13, color: COLORS.errorText, lineHeight: 19 },
  deleteConfirmButton: {
    backgroundColor: COLORS.error,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteConfirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  deleteCancelButton: { paddingVertical: 10, alignItems: 'center' },
  deleteCancelText: { fontSize: 14, color: COLORS.textWeak },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  legalLinkText: { fontSize: 12, color: COLORS.textMuted, textDecorationLine: 'underline' },
  legalSep: { fontSize: 12, color: COLORS.disabled },
  verificationBanner: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F5D67A',
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  verificationBannerText: { fontSize: 13, color: '#7A5C00' },
  verificationResendButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  verificationResendText: { fontSize: 12, color: COLORS.primaryDeep, fontWeight: '600' },
});
