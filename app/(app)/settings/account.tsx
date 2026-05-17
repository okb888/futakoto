import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { DownloadSimple, EnvelopeSimple } from 'phosphor-react-native';
import {
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import { Share } from 'react-native';
import { auth } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { updateDisplayName, getUserExportData } from '../../../lib/db';
import { deleteAccount } from '../../../lib/ai';
import { firebaseErrorMessage } from '../../../lib/errors';
import {
  linkGoogleToCurrentUser,
  linkAppleToCurrentUser,
  isGoogleSignInConfigured,
} from '../../../lib/auth-providers';
import { useSettingsProfile } from '../../../hooks/useSettingsProfile';
import { COLORS } from '../../../lib/theme';

function normalizeForExport(value: any): any {
  if (!value) return value;
  if (value.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeForExport);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalizeForExport(v)])
    );
  }
  return value;
}

export default function AccountScreen() {
  const { user } = useAuth();
  const { profile, load } = useSettingsProfile();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [emailVerified, setEmailVerified] = useState(user?.emailVerified ?? true);
  const [deleteModal, setDeleteModal] = useState({ open: false, password: '' });
  const [loadingExport, setLoadingExport] = useState(false);
  const [loadingVerification, setLoadingVerification] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<'google' | 'apple' | null>(null);

  const providerId = user?.providerData[0]?.providerId ?? 'password';
  const linkedProviderIds = user?.providerData.map(p => p.providerId) ?? [];
  const showGoogleLink = isGoogleSignInConfigured();
  const showAppleLink = Platform.OS === 'ios';

  async function handleSaveName() {
    if (!user || !nameInput.trim()) {
      Alert.alert('名前を入力してください');
      return;
    }
    await updateDisplayName(user.uid, nameInput.trim());
    setEditingName(false);
    await load();
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

  async function handleResendVerification() {
    const currentUser = auth.currentUser;
    if (!currentUser || loadingVerification) return;
    setLoadingVerification(true);
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
      setLoadingVerification(false);
    }
  }

  async function handleLinkGoogle() {
    if (linkingProvider) return;
    setLinkingProvider('google');
    try {
      const ok = await linkGoogleToCurrentUser();
      if (ok) Alert.alert('連携完了', 'Googleアカウントと連携しました。次回からGoogleでもログインできます。');
    } finally {
      setLinkingProvider(null);
    }
  }

  async function handleLinkApple() {
    if (linkingProvider) return;
    setLinkingProvider('apple');
    try {
      const ok = await linkAppleToCurrentUser();
      if (ok) Alert.alert('連携完了', 'Apple IDと連携しました。次回からApple IDでもログインできます。');
    } finally {
      setLinkingProvider(null);
    }
  }

  async function handleExportData() {
    if (!user || loadingExport) return;
    setLoadingExport(true);
    try {
      const data = await getUserExportData(user.uid);
      const payload = {
        exportedAt: new Date().toISOString(),
        app: 'futakoto',
        data: normalizeForExport(data),
      };
      await Share.share({ message: JSON.stringify(payload, null, 2) });
    } catch (e: any) {
      Alert.alert('エクスポートに失敗しました', firebaseErrorMessage(e));
    } finally {
      setLoadingExport(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user || loadingDelete) return;
    if (providerId === 'password' && !deleteModal.password.trim()) {
      Alert.alert('パスワードを入力してください');
      return;
    }
    setLoadingDelete(true);
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
      setLoadingDelete(false);
      setDeleteModal(d => ({ ...d, password: '' }));
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <Text style={styles.sectionLabel}>表示名</Text>
      <View style={styles.section}>
        {editingName ? (
          <View style={styles.editRow}>
            <TextInput
              style={styles.input}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="名前"
              placeholderTextColor="#999"
              maxLength={20}
              autoFocus
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveName}>
              <Text style={styles.saveButtonText}>保存</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              setNameInput(profile?.displayName ?? '');
              setEditingName(true);
            }}
          >
            <Text style={styles.rowLabel}>表示名</Text>
            <Text style={styles.rowValue}>{profile?.displayName ?? '未設定'}</Text>
            <Text style={styles.editChip}>編集</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionLabel}>メールアドレス</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>メールアドレス</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{user?.email ?? '—'}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>ログイン方法</Text>
      <View style={styles.section}>
        {/* メール/パスワード は常に表示 */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>メール / パスワード</Text>
          <View style={styles.linkedBadge}><Text style={styles.linkedBadgeText}>連携中</Text></View>
        </View>

        {/* Google 連携 */}
        {showGoogleLink && (
          <>
            <View style={styles.divider} />
            {linkedProviderIds.includes('google.com') ? (
              <View style={styles.row}>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.rowLabel}>Google</Text>
                <View style={styles.linkedBadge}><Text style={styles.linkedBadgeText}>連携中</Text></View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.row, !!linkingProvider && { opacity: 0.6 }]}
                onPress={handleLinkGoogle}
                disabled={!!linkingProvider}
              >
                {linkingProvider === 'google' ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Text style={styles.googleG}>G</Text>
                )}
                <Text style={[styles.rowLabel, styles.rowLabelAction]}>Googleで連携する</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Apple 連携（iOS のみ） */}
        {showAppleLink && (
          <>
            <View style={styles.divider} />
            {linkedProviderIds.includes('apple.com') ? (
              <View style={styles.row}>
                <Text style={styles.appleIcon}></Text>
                <Text style={styles.rowLabel}>Apple ID</Text>
                <View style={styles.linkedBadge}><Text style={styles.linkedBadgeText}>連携中</Text></View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.row, !!linkingProvider && { opacity: 0.6 }]}
                onPress={handleLinkApple}
                disabled={!!linkingProvider}
              >
                {linkingProvider === 'apple' ? (
                  <ActivityIndicator size="small" color={COLORS.text} />
                ) : (
                  <Text style={styles.appleIcon}></Text>
                )}
                <Text style={[styles.rowLabel, styles.rowLabelAction]}>Apple IDで連携する</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {!emailVerified && providerId === 'password' && (
        <View style={styles.verificationBanner}>
          <Text style={styles.verificationText}>メールアドレスが未認証です</Text>
          <TouchableOpacity
            style={[styles.verificationButton, loadingVerification && { opacity: 0.6 }]}
            onPress={handleResendVerification}
            disabled={loadingVerification}
          >
            {loadingVerification ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <Text style={styles.verificationButtonText}>認証メールを再送</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionLabel}>セキュリティ・データ</Text>
      <View style={styles.section}>
        {providerId === 'password' ? (
          <>
            <TouchableOpacity style={styles.row} onPress={handleSendPasswordReset}>
              <EnvelopeSimple size={17} color={COLORS.primary} weight="bold" />
              <Text style={[styles.rowLabel, styles.rowLabelAction]}>パスワード再設定メールを送る</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
          </>
        ) : null}
        <TouchableOpacity
          style={[styles.row, loadingExport && { opacity: 0.6 }]}
          onPress={handleExportData}
          disabled={loadingExport}
        >
          {loadingExport ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <DownloadSimple size={17} color={COLORS.primary} weight="bold" />
          )}
          <Text style={[styles.rowLabel, styles.rowLabelAction]}>データを書き出す</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dangerZone}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => setDeleteModal(d => ({ ...d, open: true }))}
        >
          <Text style={styles.deleteButtonText}>アカウントを削除</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={deleteModal.open}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!loadingDelete) setDeleteModal({ open: false, password: '' }); }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => { if (!loadingDelete) setDeleteModal({ open: false, password: '' }); }}
          />
          <View style={styles.deleteSheet}>
            <Text style={styles.deleteSheetTitle}>アカウントを削除</Text>
            <Text style={styles.deleteSheetBody}>
              すべての記録・相談・お気に入りが完全に削除されます。この操作は取り消せません。
            </Text>
            {providerId === 'password' ? (
              <>
                <Text style={styles.deleteSheetLabel}>パスワードを入力して確認</Text>
                <TextInput
                  style={styles.deleteInput}
                  value={deleteModal.password}
                  onChangeText={p => setDeleteModal(d => ({ ...d, password: p }))}
                  placeholder="パスワード"
                  placeholderTextColor="#999"
                  secureTextEntry
                  autoFocus
                />
              </>
            ) : (
              <View style={styles.providerNote}>
                <Text style={styles.providerNoteText}>
                  {providerId === 'google.com' ? 'Google' : 'Apple'}
                  アカウントで認証済みとして削除します。
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.deleteConfirmButton, loadingDelete && { opacity: 0.6 }]}
              onPress={handleDeleteAccount}
              disabled={loadingDelete}
            >
              {loadingDelete ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.deleteConfirmText}>削除する（取り消せません）</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteCancelButton}
              onPress={() => setDeleteModal({ open: false, password: '' })}
              disabled={loadingDelete}
            >
              <Text style={styles.deleteCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    gap: 10,
  },
  rowLabel: { flex: 1, fontSize: 15, color: COLORS.text },
  rowLabelAction: { color: COLORS.primary, fontWeight: '600' },
  rowValue: { fontSize: 14, color: COLORS.textMuted, maxWidth: 160 },
  editChip: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.text,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  saveButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.borderSoft,
    marginLeft: 16,
  },
  verificationBanner: {
    backgroundColor: COLORS.warningBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  verificationText: { fontSize: 13, color: COLORS.warningText },
  verificationButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  verificationButtonText: { fontSize: 12, color: COLORS.primaryDeep, fontWeight: '600' },
  dangerZone: { marginTop: 40, alignItems: 'center' },
  deleteButton: { paddingVertical: 12 },
  deleteButtonText: { fontSize: 14, color: COLORS.error },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(45,45,45,0.24)',
  },
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
  providerNote: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
  },
  providerNoteText: { fontSize: 13, color: COLORS.errorText, lineHeight: 19 },
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
  linkedBadge: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  linkedBadgeText: { fontSize: 11, color: COLORS.primaryDeep, fontWeight: '600' },
  googleG: { fontSize: 15, fontWeight: '700', color: '#4285F4', width: 20, textAlign: 'center' },
  appleIcon: { fontSize: 15, color: COLORS.text, width: 20, textAlign: 'center' },
});
