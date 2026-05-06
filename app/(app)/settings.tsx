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
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Heart } from 'phosphor-react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import {
  createUserProfile,
  getUserProfile,
  pairWithCode,
  unpairPartner,
  updateDisplayName,
  UserProfile,
} from '../../lib/db';

export default function SettingsScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    if (!user) return;
    const p = await createUserProfile(user.uid, user.email ?? '');
    setProfile(p);
    setNameInput(p.displayName ?? '');
    if (p?.partnerUid) {
      const pp = await getUserProfile(p.partnerUid);
      setPartnerProfile(pp);
    } else {
      setPartnerProfile(null);
    }
  }

  useEffect(() => { load(); }, [user]);

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

  async function handlePair() {
    if (!user || !inputCode.trim()) return;
    setLoading(true);
    try {
      await pairWithCode(user.uid, inputCode.trim().toUpperCase());
      await load();
      setInputCode('');
      Alert.alert('ペアリング完了', 'パートナーと繋がりました');
    } catch (e: any) {
      Alert.alert('エラー', e.message);
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
          await unpairPartner(user.uid, profile.partnerUid!);
          await load();
        },
      },
    ]);
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

      <View style={styles.divider} />

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => signOut(auth)}
      >
        <Text style={styles.logoutText}>ログアウト</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { padding: 24, paddingBottom: 64 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', marginTop: 28, marginBottom: 8, letterSpacing: 1 },
  hint: { fontSize: 12, color: '#BBB', marginBottom: 10 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  rowValue: { fontSize: 15, color: '#2D2D2D' },
  editText: { fontSize: 12, color: '#7B9E87', fontWeight: '600' },
  nameEditRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  smallButton: {
    backgroundColor: '#7B9E87',
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
    borderColor: '#E0E0E0',
  },
  codeText: { fontSize: 32, color: '#2D2D2D', fontFamily: 'Courier', letterSpacing: 6, fontWeight: '600' },
  codeButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  copyButton: {
    flex: 1,
    backgroundColor: '#7B9E87',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  copyButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  shareButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#7B9E87',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  shareButtonText: { color: '#7B9E87', fontSize: 13, fontWeight: '600' },
  pairedBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8D5D5',
    gap: 12,
  },
  pairedInfo: { flex: 1 },
  pairedLabel: { fontSize: 13, fontWeight: '600', color: '#7B9E87' },
  pairedEmail: { fontSize: 12, color: '#AAA', marginTop: 2 },
  unpairText: { fontSize: 12, color: '#E57373' },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2D2D2D',
  },
  codeInput: { textAlign: 'center', fontSize: 18, letterSpacing: 4, fontFamily: 'Courier' },
  pairButton: {
    backgroundColor: '#7B9E87',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  pairButtonDisabled: { backgroundColor: '#C8D8CC' },
  pairButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginTop: 32, marginBottom: 8 },
  logoutButton: { paddingVertical: 16, alignItems: 'center' },
  logoutText: { fontSize: 14, color: '#AAA' },
});
