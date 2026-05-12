import { useEffect, useState } from 'react';
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
import Constants from 'expo-constants';
import { Bell, Clock, DownloadSimple, EnvelopeSimple, Heart, Sparkle } from 'phosphor-react-native';
import {
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import { TimePickerSheet } from '../../components/TimePickerSheet';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import {
  getUserExportData,
  updateDisplayName,
  updateNotificationSettings,
  updateCommunicationStyle,
  updateAiPersona,
  AI_FREE_MONTHLY_LIMIT,
  type AiPersona,
  type NotificationSettings,
} from '../../lib/db';
import { PaywallModal } from '../../components/PaywallModal';
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
import { useSettingsProfile } from '../../hooks/useSettingsProfile';

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

// ローディング状態を1オブジェクトにまとめる
type LoadingState = {
  pair: boolean;
  notification: boolean;
  regenerate: boolean;
  delete: boolean;
  export: boolean;
  verification: boolean;
};

const LOADING_INITIAL: LoadingState = {
  pair: false, notification: false, regenerate: false,
  delete: false, export: false, verification: false,
};

export default function SettingsScreen() {
  const { user } = useAuth();

  // プロフィール・パートナー取得（カスタムhookに分離）
  const { profile, setProfile, partnerProfile, load } = useSettingsProfile();

  // フォーム入力値
  const [nameInput, setNameInput] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [styleInput, setStyleInput] = useState('');

  // 通知設定
  const [notificationSettings, setNotificationSettings] = useState(withDefaults());

  // ローディング（6フラグ → 1オブジェクト）
  const [isLoading, setIsLoading] = useState<LoadingState>(LOADING_INITIAL);
  const setLoad = (key: keyof LoadingState, value: boolean) =>
    setIsLoading(s => ({ ...s, [key]: value }));

  // 時刻ピッカー（2変数 → 1オブジェクト）
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [pickerTime, setPickerTime] = useState({ hour: DEFAULT_REMINDER_HOUR, minute: DEFAULT_REMINDER_MINUTE });

  // 削除モーダル（2変数 → 1オブジェクト）
  const [deleteModal, setDeleteModal] = useState({ open: false, password: '' });

  // UI フラグ
  const [editingName, setEditingName] = useState(false);
  const [copied, setCopied] = useState(false);
  const [styleSaved, setStyleSaved] = useState(false);
  const [emailVerified, setEmailVerified] = useState(user?.emailVerified ?? true);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // プロフィールが更新されたら派生フォームを同期
  useEffect(() => {
    if (!profile) return;
    setNotificationSettings(withDefaults(profile.notificationSettings));
    setNameInput(profile.displayName ?? '');
    setStyleInput(profile.communicationStyle ?? '');
  }, [profile]);

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
    if (!user || isLoading.regenerate) return;
    Alert.alert(
      'コードを作り直しますか？',
      '今の招待コードは使えなくなります。すでに連携中のパートナーとの接続は変わりません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '作り直す',
          style: 'destructive',
          onPress: async () => {
            setLoad('regenerate', true);
            try {
              const result = await regenerateInviteCode();
              setProfile(current => current ? { ...current, inviteCode: result.inviteCode } : current);
              setCopied(false);
              Alert.alert('新しいコードを作りました', '古いコードは使えなくなりました');
            } catch (e: any) {
              Alert.alert('エラー', firebaseErrorMessage(e));
            } finally {
              setLoad('regenerate', false);
            }
          },
        },
      ]
    );
  }

  async function handlePair() {
    if (!user || !inputCode.trim()) return;
    setLoad('pair', true);
    try {
      await pairWithCode(inputCode.trim().toUpperCase());
      await load();
      setInputCode('');
      Alert.alert('ペアリング完了', 'パートナーと繋がりました');
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setLoad('pair', false);
    }
  }

  async function handleUnpair() {
    if (!user || !profile?.partnerUid) return;
    Alert.alert(
      'パートナー接続を解除しますか？',
      '解除すると、これまで「ふたりへ」で共有した投稿は相手から見えなくなります。あなたの投稿データはこの端末・アカウントに残ります。\n\n再びつなぎ直すには、新しい招待コードでもう一度ペア設定が必要です。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除する',
          style: 'destructive',
          onPress: async () => {
            try {
              await unpairPartner();
              await load();
            } catch (e: any) {
              Alert.alert('エラー', firebaseErrorMessage(e));
            }
          },
        },
      ]
    );
  }

  async function handleSaveStyle() {
    if (!user) return;
    await updateCommunicationStyle(user.uid, styleInput.trim());
    setStyleSaved(true);
    setTimeout(() => setStyleSaved(false), 2000);
  }

  async function handleSelectPersona(persona: AiPersona) {
    if (!user) return;
    setProfile(current => current ? { ...current, aiPersona: persona } : current);
    await updateAiPersona(user.uid, persona);
  }

  async function handleSaveName() {
    if (!user || !nameInput.trim()) {
      Alert.alert('名前を入力してください');
      return;
    }
    await updateDisplayName(user.uid, nameInput.trim());
    setEditingName(false);
    await load();
  }

  async function saveNotificationSettings(next: Required<NotificationSettings>) {
    if (!user) return;
    setNotificationSettings(next);
    await updateNotificationSettings(user.uid, next);
    setProfile(current => current ? { ...current, notificationSettings: next } : current);
  }

  async function toggleDailyReminder(enabled: boolean) {
    if (!user) return;
    setLoad('notification', true);
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
      setLoad('notification', false);
    }
  }

  function openReminderTimePicker() {
    setPickerTime({
      hour: notificationSettings.dailyReminderHour,
      minute: notificationSettings.dailyReminderMinute,
    });
    setTimePickerOpen(true);
  }

  async function saveReminderTime() {
    if (!user || isLoading.notification) return;
    setLoad('notification', true);
    const next = {
      ...notificationSettings,
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
      setLoad('notification', false);
    }
  }

  async function handleDeleteAccount() {
    if (!user || isLoading.delete) return;
    const providerId = user.providerData[0]?.providerId ?? 'password';

    if (providerId === 'password' && !deleteModal.password.trim()) {
      Alert.alert('パスワードを入力してください');
      return;
    }

    setLoad('delete', true);
    try {
      if (providerId === 'password') {
        const credential = EmailAuthProvider.credential(user.email!, deleteModal.password);
        await reauthenticateWithCredential(user, credential);
      }
      await deleteAccount();
      await signOut(auth).catch(() => {});
    } catch (e: any) {
      const isWrongPassword =
        e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential';
      Alert.alert(
        isWrongPassword ? 'パスワードが違います' : '削除に失敗しました',
        isWrongPassword ? 'もう一度確認してください' : e.message
      );
      setLoad('delete', false);
      setDeleteModal(d => ({ ...d, password: '' }));
    }
  }

  async function handleResendVerification() {
    const currentUser = auth.currentUser;
    if (!currentUser || isLoading.verification) return;
    setLoad('verification', true);
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
      setLoad('verification', false);
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
    if (!user || isLoading.export) return;
    setLoad('export', true);
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
      setLoad('export', false);
    }
  }

  async function toggleSharedPostNotifications(enabled: boolean) {
    if (!user) return;
    setLoad('notification', true);
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
      setLoad('notification', false);
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
        style={[styles.regenerateButton, isLoading.regenerate && { opacity: 0.6 }]}
        onPress={handleRegenerateInviteCode}
        disabled={!profile?.inviteCode || isLoading.regenerate}
      >
        {isLoading.regenerate ? (
          <ActivityIndicator color={COLORS.primary} size="small" />
        ) : (
          <Text style={styles.regenerateButtonText}>コードを作り直す</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>パートナー</Text>
      {profile?.partnerUid ? (
        <View style={styles.pairedBox}>
          <Heart size={24} color={COLORS.partner} weight="fill" />
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
              disabled={isLoading.pair || inputCode.length !== 6}
              accessibilityLabel="パートナーと繋がる"
              accessibilityRole="button"
            >
              {isLoading.pair ? (
                <ActivityIndicator color={COLORS.surface} size="small" />
              ) : (
                <Text style={styles.pairButtonText}>繋がる</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>壁打ちAIの話し方</Text>
      <Text style={styles.hint}>壁打ち中のAIがどんなスタイルで話すかを選べます</Text>
      {(
        [
          { key: 'soft', label: 'ソフト', desc: 'そっと聞く・問いかけは必要なときだけ' },
          { key: 'friendly', label: 'フレンドリー', desc: 'タメ口で、気の置けない友人のように' },
          { key: 'logical', label: 'ロジカル', desc: '感情と事実を分けて、状況を構造化する' },
        ] as { key: AiPersona; label: string; desc: string }[]
      ).map(({ key, label, desc }) => {
        const selected = (profile?.aiPersona ?? 'soft') === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.personaOption, selected && styles.personaOptionSelected]}
            onPress={() => handleSelectPersona(key)}
            activeOpacity={0.7}
          >
            <View style={[styles.personaRadio, selected && styles.personaRadioSelected]}>
              {selected && <View style={styles.personaRadioDot} />}
            </View>
            <View style={styles.personaTextBlock}>
              <Text style={[styles.personaLabel, selected && styles.personaLabelSelected]}>{label}</Text>
              <Text style={styles.personaDesc}>{desc}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

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
      {profile?.premium ? (
        <View style={styles.aiUsageBox}>
          <View style={styles.notificationIconBox}>
            <Sparkle size={22} color={COLORS.ai} weight="fill" />
          </View>
          <View style={styles.aiUsageContent}>
            <Text style={styles.notificationTitle}>プレミアム加入中</Text>
            <Text style={styles.notificationSub}>AI機能は無制限でお使いいただけます</Text>
          </View>
        </View>
      ) : (() => {
        const used = profile?.aiCreditsUsed ?? 0;
        const limit = AI_FREE_MONTHLY_LIMIT;
        const remaining = Math.max(0, limit - used);
        const ratio = Math.min(100, (used / limit) * 100);
        return (
          <View style={styles.aiUsageBox}>
            <View style={styles.notificationIconBox}>
              <Sparkle size={22} color={COLORS.ai} weight="fill" />
            </View>
            <View style={styles.aiUsageContent}>
              <View style={styles.aiUsageHeader}>
                <Text style={styles.notificationTitle}>今月の無料分</Text>
                <Text style={styles.aiUsageCount}>残り {remaining}/{limit}</Text>
              </View>
              <View style={styles.aiUsageTrack}>
                <View style={[styles.aiUsageFill, { width: `${ratio}%` }]} />
              </View>
              <Text style={styles.notificationSub}>
                {remaining === 0
                  ? '無料分を使い切りました。プレミアムで無制限に使えます'
                  : '初回利用から30日でリセットされます'}
              </Text>
              <TouchableOpacity
                style={styles.premiumCta}
                onPress={() => setPaywallOpen(true)}
                activeOpacity={0.85}
              >
                <Sparkle size={14} color={COLORS.surface} weight="fill" />
                <Text style={styles.premiumCtaText}>プレミアムを試す</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      <Text style={styles.sectionTitle}>通知</Text>
      <View style={[styles.notificationBox, styles.notificationBoxStack]}>
        <View style={styles.notificationHeaderRow}>
          <View style={styles.notificationIconBox}>
            <Bell size={22} color={COLORS.primary} weight="fill" />
          </View>
          <View style={styles.notificationContent}>
            <Text style={styles.notificationTitle}>毎日の記録リマインダー</Text>
            <Text style={styles.notificationSub}>毎日、そっと記録を促します</Text>
          </View>
          <Switch
            value={notificationSettings.dailyReminderEnabled}
            onValueChange={toggleDailyReminder}
            disabled={isLoading.notification}
            trackColor={{ false: COLORS.border, true: COLORS.primaryDim }}
            thumbColor={notificationSettings.dailyReminderEnabled ? COLORS.primary : COLORS.surface}
          />
        </View>
        <TouchableOpacity
          style={styles.reminderTimeArea}
          onPress={openReminderTimePicker}
          activeOpacity={0.7}
        >
          <View style={styles.reminderTimeLabelRow}>
            <View style={styles.reminderTimeIcon}>
              <Clock size={14} color={COLORS.primary} weight="bold" />
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
          <Heart size={22} color={COLORS.partner} weight="fill" />
        </View>
        <View style={styles.notificationContent}>
          <Text style={styles.notificationTitle}>相手の共有投稿</Text>
          <Text style={styles.notificationSub}>本文は出さず、届いたことだけ知らせます</Text>
        </View>
        <Switch
          value={notificationSettings.sharedPostNotificationsEnabled}
          onValueChange={toggleSharedPostNotifications}
          disabled={isLoading.notification}
          trackColor={{ false: COLORS.border, true: COLORS.partnerBorder }}
          thumbColor={notificationSettings.sharedPostNotificationsEnabled ? COLORS.partner : COLORS.surface}
        />
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>アカウント</Text>
      {!emailVerified && user?.providerData[0]?.providerId === 'password' && (
        <View style={styles.verificationBanner}>
          <Text style={styles.verificationBannerText}>メールアドレスが未認証です</Text>
          <TouchableOpacity
            style={[styles.verificationResendButton, isLoading.verification && { opacity: 0.6 }]}
            onPress={handleResendVerification}
            disabled={isLoading.verification}
          >
            {isLoading.verification ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <Text style={styles.verificationResendText}>認証メールを再送</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {user?.providerData[0]?.providerId === 'password' ? (
        <TouchableOpacity style={styles.accountActionButton} onPress={handleSendPasswordReset}>
          <EnvelopeSimple size={17} color={COLORS.primary} weight="bold" />
          <Text style={styles.accountActionText}>パスワード再設定メールを送る</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.accountActionButton, isLoading.export && { opacity: 0.6 }]}
        onPress={handleExportData}
        disabled={isLoading.export}
      >
        {isLoading.export ? (
          <ActivityIndicator color={COLORS.primary} size="small" />
        ) : (
          <DownloadSimple size={17} color={COLORS.primary} weight="bold" />
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

      <Text style={styles.versionText}>バージョン {Constants.expoConfig?.version ?? '—'}</Text>

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
        onPress={() => setDeleteModal(d => ({ ...d, open: true }))}
      >
        <Text style={styles.deleteButtonText}>アカウントを削除</Text>
      </TouchableOpacity>

      <Modal
        visible={deleteModal.open}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!isLoading.delete) setDeleteModal({ open: false, password: '' }); }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              if (!isLoading.delete) setDeleteModal({ open: false, password: '' });
            }}
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
                  value={deleteModal.password}
                  onChangeText={p => setDeleteModal(d => ({ ...d, password: p }))}
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
              style={[styles.deleteConfirmButton, isLoading.delete && { opacity: 0.6 }]}
              onPress={handleDeleteAccount}
              disabled={isLoading.delete}
            >
              {isLoading.delete ? (
                <ActivityIndicator color={COLORS.surface} />
              ) : (
                <Text style={styles.deleteConfirmText}>削除する（取り消せません）</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteCancelButton}
              onPress={() => setDeleteModal({ open: false, password: '' })}
              disabled={isLoading.delete}
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
        hour={pickerTime.hour}
        minute={pickerTime.minute}
        saving={isLoading.notification}
        onChangeHour={h => setPickerTime(t => ({ ...t, hour: h }))}
        onChangeMinute={m => setPickerTime(t => ({ ...t, minute: m }))}
        onCancel={() => setTimePickerOpen(false)}
        onSave={saveReminderTime}
      />

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
  content: { padding: 24, paddingBottom: 64 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginTop: 28, marginBottom: 8, letterSpacing: 1 },
  hint: { fontSize: 12, color: COLORS.placeholder, marginBottom: 10 },
  row: {
    backgroundColor: COLORS.surface,
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
  smallButtonText: { color: COLORS.surface, fontSize: 13, fontWeight: '600' },
  codeBox: {
    backgroundColor: COLORS.surface,
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
  copyButtonText: { color: COLORS.surface, fontSize: 13, fontWeight: '600' },
  shareButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  shareButtonText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  regenerateButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  regenerateButtonText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  pairedBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.partnerBorder,
    gap: 12,
  },
  notificationBox: {
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
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
  premiumCta: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.ai,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  premiumCtaText: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '700',
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
    backgroundColor: COLORS.surface,
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
  pairButtonText: { color: COLORS.surface, fontSize: 13, fontWeight: '600' },
  styleCharCount: { fontSize: 11, color: COLORS.placeholder, textAlign: 'right', marginTop: 4 },
  personaOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  personaOptionSelected: {
    borderColor: COLORS.ai,
    backgroundColor: COLORS.aiBg,
  },
  personaRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.disabled,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  personaRadioSelected: {
    borderColor: COLORS.ai,
  },
  personaRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.ai,
  },
  personaTextBlock: { flex: 1 },
  personaLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  personaLabelSelected: { color: COLORS.ai },
  personaDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 17 },
  divider: { height: 1, backgroundColor: COLORS.borderSoft, marginTop: 32, marginBottom: 8 },
  accountActionButton: {
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
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
  deleteConfirmText: { color: COLORS.surface, fontSize: 14, fontWeight: '700' },
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
  versionText: { fontSize: 12, color: COLORS.disabled, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  verificationBanner: {
    backgroundColor: COLORS.warningBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  verificationBannerText: { fontSize: 13, color: COLORS.warningText },
  verificationResendButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  verificationResendText: { fontSize: 12, color: COLORS.primaryDeep, fontWeight: '600' },
});
