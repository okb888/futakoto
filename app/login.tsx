import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { COLORS } from '../lib/theme';
import {
  signInWithApple,
  signInWithGoogle,
  isGoogleSignInConfigured,
} from '../lib/auth-providers';

export default function LoginScreen() {
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(
    null
  );

  async function handleApple() {
    if (socialLoading) return;
    setSocialLoading('apple');
    try {
      await signInWithApple();
    } finally {
      setSocialLoading(null);
    }
  }

  async function handleGoogle() {
    if (socialLoading) return;
    setSocialLoading('google');
    try {
      await signInWithGoogle();
    } finally {
      setSocialLoading(null);
    }
  }

  const showApple = Platform.OS === 'ios';
  const showGoogle = isGoogleSignInConfigured();
  const anyBusy = socialLoading !== null;

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.logo}>ふたこと</Text>
        <Text style={styles.tagline}>一言を、ふたりで。</Text>

        {showApple ? (
          <View
            style={[styles.appleButton, anyBusy && styles.buttonDisabled]}
            pointerEvents={anyBusy ? 'none' : 'auto'}
          >
            {socialLoading === 'apple' ? (
              <ActivityIndicator color={COLORS.surface} />
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={styles.appleNativeButton}
                onPress={handleApple}
              />
            )}
          </View>
        ) : null}

        {showGoogle ? (
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
                <Text style={styles.googleButtonText}>Googleでログイン</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : null}

        {!showApple && !showGoogle ? (
          <Text style={styles.unavailableText}>
            この端末ではログイン方法を準備できませんでした
          </Text>
        ) : null}
      </View>
    </View>
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
  buttonDisabled: {
    opacity: 0.5,
  },
  appleButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
    minHeight: 50,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  appleNativeButton: {
    width: '100%',
    height: 50,
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
    marginBottom: 10,
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
    fontSize: 15,
    fontWeight: '600',
  },
  unavailableText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
