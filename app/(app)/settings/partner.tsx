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
  Share,
} from 'react-native';
import { Heart } from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../../lib/auth';
import { pairWithCode, unpairPartner, regenerateInviteCode } from '../../../lib/ai';
import { firebaseErrorMessage } from '../../../lib/errors';
import { useSettingsProfile } from '../../../hooks/useSettingsProfile';
import { COLORS } from '../../../lib/theme';

export default function PartnerScreen() {
  const { user } = useAuth();
  const { profile, partnerProfile, load } = useSettingsProfile();

  const [inputCode, setInputCode] = useState('');
  const [loadingPair, setLoadingPair] = useState(false);
  const [loadingRegenerate, setLoadingRegenerate] = useState(false);
  const [copied, setCopied] = useState(false);

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
    } catch (_) {}
  }

  function handleRegenerateInviteCode() {
    if (!user || loadingRegenerate) return;
    Alert.alert(
      'コードを作り直しますか？',
      '今の招待コードは使えなくなります。すでに連携中のパートナーとの接続は変わりません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '作り直す',
          style: 'destructive',
          onPress: async () => {
            setLoadingRegenerate(true);
            try {
              const result = await regenerateInviteCode();
              await load(undefined, { ...profile!, inviteCode: result.inviteCode });
              setCopied(false);
              Alert.alert('新しいコードを作りました', '古いコードは使えなくなりました');
            } catch (e: any) {
              Alert.alert('エラー', firebaseErrorMessage(e));
            } finally {
              setLoadingRegenerate(false);
            }
          },
        },
      ]
    );
  }

  async function handlePair() {
    if (!user || !inputCode.trim()) return;
    setLoadingPair(true);
    try {
      await pairWithCode(inputCode.trim().toUpperCase());
      await load();
      setInputCode('');
      Alert.alert('ペアリング完了', 'パートナーと繋がりました');
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setLoadingPair(false);
    }
  }

  async function handleUnpair() {
    if (!user || !profile?.partnerUid) return;
    Alert.alert(
      'パートナー接続を解除しますか？',
      '解除すると、これまで「ふたりへ」で共有した投稿は相手から見えなくなります。\n\n再びつなぎ直すには、新しい招待コードでもう一度ペア設定が必要です。',
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* 自分の招待コード */}
      <Text style={styles.sectionLabel}>自分の招待コード</Text>
      <View style={styles.section}>
        <Text style={styles.hint}>このコードをパートナーに送って</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{profile?.inviteCode ?? '...'}</Text>
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
          style={[styles.regenerateButton, loadingRegenerate && { opacity: 0.6 }]}
          onPress={handleRegenerateInviteCode}
          disabled={!profile?.inviteCode || loadingRegenerate}
        >
          {loadingRegenerate ? (
            <ActivityIndicator color={COLORS.textMuted} size="small" />
          ) : (
            <Text style={styles.regenerateText}>コードを作り直す</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* パートナー連携 */}
      <Text style={styles.sectionLabel}>パートナー</Text>
      {profile?.partnerUid ? (
        <View style={styles.section}>
          <View style={styles.pairedBox}>
            <Heart size={24} color={COLORS.partner} weight="fill" />
            <View style={styles.pairedInfo}>
              <Text style={styles.pairedLabel}>連携中</Text>
              <Text style={styles.pairedName}>
                {partnerProfile?.displayName ?? partnerProfile?.email ?? ''}
              </Text>
            </View>
            <TouchableOpacity onPress={handleUnpair}>
              <Text style={styles.unpairText}>解除</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.inputSection}>
            <Text style={styles.hint}>パートナーの6桁コードを入力</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.codeInput}
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
                disabled={loadingPair || inputCode.length !== 6}
              >
                {loadingPair ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.pairButtonText}>繋がる</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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
  hint: { fontSize: 12, color: COLORS.placeholder, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  codeBox: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  codeText: { fontSize: 32, color: COLORS.text, fontFamily: 'Courier', letterSpacing: 6, fontWeight: '600' },
  codeButtons: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  shareButtonText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  regenerateButton: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  regenerateText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  pairedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  pairedInfo: { flex: 1 },
  pairedLabel: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  pairedName: { fontSize: 12, color: COLORS.textWeak, marginTop: 2 },
  unpairText: { fontSize: 12, color: COLORS.error },
  inputSection: { padding: 16, gap: 12 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  codeInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 4,
    fontFamily: 'Courier',
  },
  pairButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  pairButtonDisabled: { backgroundColor: COLORS.primaryDim },
  pairButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
