import { useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
        <Image source={require('../assets/icon.png')} style={styles.appIcon} />
        <Text style={styles.logo}>ふたこと</Text>
        <Text style={styles.tagline}>一言を、ふたりで。</Text>

        {showApple ? (
          socialLoading === 'apple' ? (
            <View style={styles.appleLoadingButton}>
              <ActivityIndicator color={COLORS.text} />
            </View>
          ) : (
            <View style={[styles.nativeAppleWrap, anyBusy && styles.buttonDisabled]} pointerEvents={anyBusy ? 'none' : 'auto'}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
                cornerRadius={12}
                style={styles.nativeAppleButton}
                onPress={handleApple}
              />
            </View>
          )
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
                <Text style={styles.googleButtonText}>Googleではじめる</Text>
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
  appIcon: {
    width: 80,
    height: 80,
    alignSelf: 'center',
    marginBottom: 16,
    borderRadius: 18,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  nativeAppleWrap: {
    marginBottom: 10,
  },
  nativeAppleButton: {
    width: '100%',
    height: 50,
  },
  appleLoadingButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 10,
    minHeight: 50,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  socialInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#000',
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
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  unavailableText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
