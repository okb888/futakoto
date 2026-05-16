import { useRef, useState } from 'react';
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
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { firebaseErrorMessage } from '../lib/errors';
import { COLORS } from '../lib/theme';
import {
  signInWithApple,
  signInWithGoogle,
  isGoogleSignInConfigured,
} from '../lib/auth-providers';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(
    null
  );
  const socialInFlightRef = useRef(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    try {
      if (isRegister) {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(user).catch(() => {});
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e: any) {
      Alert.alert('エラー', firebaseErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    if (socialInFlightRef.current || loading) return;
    socialInFlightRef.current = true;
    setSocialLoading('apple');
    try {
      await signInWithApple();
    } finally {
      socialInFlightRef.current = false;
      setSocialLoading(null);
    }
  }

  async function handleGoogle() {
    if (socialInFlightRef.current || loading) return;
    socialInFlightRef.current = true;
    setSocialLoading('google');
    try {
      await signInWithGoogle();
    } finally {
      socialInFlightRef.current = false;
      setSocialLoading(null);
    }
  }

  const showApple = Platform.OS === 'ios';
  const showGoogle = isGoogleSignInConfigured();
  const showSocialBlock = showApple || showGoogle;
  const anyBusy = loading || socialLoading !== null;

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
          style={[styles.button, anyBusy && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={anyBusy}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.buttonText}>
              {isRegister ? 'アカウントを作成' : 'ログイン'}
            </Text>
          )}
        </TouchableOpacity>

        {showSocialBlock && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>または</Text>
              <View style={styles.dividerLine} />
            </View>

            {showApple && (
              <View
                style={[
                  anyBusy && socialLoading !== 'apple' && styles.buttonDisabled,
                ]}
                pointerEvents={anyBusy ? 'none' : 'auto'}
              >
                {socialLoading === 'apple' ? (
                  <View style={styles.appleLoadingButton}>
                    <ActivityIndicator color={COLORS.surface} />
                  </View>
                ) : (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={
                      AppleAuthentication.AppleAuthenticationButtonType
                        .SIGN_IN
                    }
                    buttonStyle={
                      AppleAuthentication.AppleAuthenticationButtonStyle
                        .BLACK
                    }
                    cornerRadius={12}
                    style={styles.appleNativeButton}
                    onPress={handleApple}
                  />
                )}
              </View>
            )}

            {showGoogle && (
              <TouchableOpacity
                style={[styles.googleButton, anyBusy && styles.buttonDisabled]}
                onPress={handleGoogle}
                disabled={anyBusy}
                activeOpacity={0.8}
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator color={COLORS.text} />
                ) : (
                  <View style={styles.socialInner}>
                    <Text style={styles.googleLogo}>G</Text>
                    <Text style={styles.googleButtonText}>
                      Googleでログイン
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity onPress={() => setIsRegister(!isRegister)} disabled={anyBusy}>
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
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 48,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginHorizontal: 12,
  },
  appleLoadingButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
    height: 50,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  appleNativeButton: {
    width: '100%',
    height: 50,
    marginBottom: 10,
  },
  socialInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  googleButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DADCE0',
    marginBottom: 24,
    minHeight: 50,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  googleLogo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
    marginRight: 10,
  },
  googleButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  toggle: {
    color: COLORS.primary,
    fontSize: 13,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: 8,
  },
});
