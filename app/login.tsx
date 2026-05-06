import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>ふたこと</Text>
        <Text style={styles.tagline}>一言を、ふたりで。</Text>

        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          placeholderTextColor="#AAA"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード（6文字以上）"
          placeholderTextColor="#AAA"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isRegister ? 'アカウントを作成' : 'ログイン'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
          <Text style={styles.toggle}>
            {isRegister
              ? 'すでにアカウントをお持ちの方はこちら'
              : 'アカウントをお持ちでない方はこちら'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    fontSize: 40,
    fontWeight: '700',
    color: '#2D2D2D',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 48,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#2D2D2D',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#7B9E87',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggle: {
    color: '#7B9E87',
    fontSize: 13,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
