import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  OAuthProvider,
  GoogleAuthProvider,
  signInWithCredential,
  linkWithCredential,
} from 'firebase/auth';

import { auth } from './firebase';
import { classifyError, firebaseErrorMessage } from './errors';

// ---------------------------------------------------------------------------
// 共通ヘルパー
// ---------------------------------------------------------------------------

function showError(e: any, fallbackTitle = 'ログインエラー') {
  try {
    const c = classifyError(e);
    Alert.alert(c.title || fallbackTitle, c.message);
  } catch {
    Alert.alert(fallbackTitle, firebaseErrorMessage(e));
  }
}

function isUserCancelled(e: any): boolean {
  const code = e?.code;
  const message = e?.message ?? '';
  // Apple
  if (
    code === 'ERR_REQUEST_CANCELED' ||
    code === 'ERR_CANCELED' ||
    code === 'ERR_REQUEST_IN_PROGRESS' ||
    /already.*progress|request.*progress|authorization.*progress/i.test(message)
  ) {
    return true;
  }
  // Google
  if (
    code === statusCodes?.SIGN_IN_CANCELLED ||
    code === statusCodes?.IN_PROGRESS
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Apple Sign-in
// ---------------------------------------------------------------------------

/**
 * Apple Sign-in → Firebase Auth ログイン
 * iOS のみで利用可能（usesAppleSignIn: true 必須）。
 */
export async function signInWithApple(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    Alert.alert('未対応', 'Apple Sign-inはiOSのみで利用できます。');
    return false;
  }

  try {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      Alert.alert(
        'Apple Sign-in未対応',
        'この端末では Apple Sign-in が利用できません。'
      );
      return false;
    }

    // nonce: 平文を Apple に渡し、SHA256 ハッシュを Apple に署名させる
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error('Apple Sign-in: identityToken が取得できませんでした。');
    }

    const provider = new OAuthProvider('apple.com');
    const oauthCredential = provider.credential({
      idToken: credential.identityToken,
      rawNonce, // Firebase 側で hashedNonce と照合
    });

    await signInWithCredential(auth, oauthCredential);
    return true;
  } catch (e: any) {
    if (isUserCancelled(e)) return false;
    showError(e, 'Apple Sign-inエラー');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Google Sign-in
// ---------------------------------------------------------------------------

let googleConfigured = false;

function getGoogleConfig(): { iosClientId?: string; webClientId?: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as any;
  return extra.google ?? {};
}

function isPlaceholder(v?: string): boolean {
  return !v || v.startsWith('PLACEHOLDER_');
}

function ensureGoogleConfigured(): boolean {
  if (googleConfigured) return true;

  const { iosClientId, webClientId } = getGoogleConfig();

  // iOS Client ID は必須。webClientId は Firebase の idToken 発行用に推奨。
  if (isPlaceholder(iosClientId)) {
    console.warn(
      '[auth-providers] Google iosClientId が未設定です。app.json の extra.google.iosClientId を設定してください。'
    );
    return false;
  }

  GoogleSignin.configure({
    iosClientId,
    // webClientId は Firebase Auth で idToken を扱うために設定推奨。
    webClientId: isPlaceholder(webClientId) ? undefined : webClientId,
  });
  googleConfigured = true;
  return true;
}

/**
 * Google Sign-in → Firebase Auth ログイン
 * 本番では app.json の extra.google.iosClientId / webClientId を設定。
 */
export async function signInWithGoogle(): Promise<boolean> {
  if (!ensureGoogleConfigured()) {
    Alert.alert(
      '設定が必要',
      'Google Sign-inの設定が未完了です。アプリ管理者にお問い合わせください。'
    );
    return false;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result: any = await GoogleSignin.signIn();

    // v15+ では { type: 'success', data: { idToken, ... } }、旧版では直接 idToken。
    const idToken: string | undefined =
      result?.data?.idToken ?? result?.idToken;

    if (!idToken) {
      throw new Error('Google Sign-in: idToken が取得できませんでした。');
    }

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
    return true;
  } catch (e: any) {
    if (isUserCancelled(e)) return false;
    showError(e, 'Google Sign-inエラー');
    return false;
  }
}

/** UI 表示判定: Google ボタンを出すか（client id が設定されているか） */
export function isGoogleSignInConfigured(): boolean {
  const { iosClientId } = getGoogleConfig();
  return !isPlaceholder(iosClientId);
}

// ---------------------------------------------------------------------------
// アカウント連携
// ---------------------------------------------------------------------------

/** 現在のユーザーに連携済みのプロバイダーID一覧（例: ['password', 'google.com']） */
export function getLinkedProviderIds(): string[] {
  return auth.currentUser?.providerData.map(p => p.providerId) ?? [];
}

/** 現在ログイン中のアカウントに Google を連携する */
export async function linkGoogleToCurrentUser(): Promise<boolean> {
  if (!auth.currentUser) {
    Alert.alert('エラー', 'ログインが必要です');
    return false;
  }
  if (!ensureGoogleConfigured()) {
    Alert.alert('設定が必要', 'Google Sign-inの設定が未完了です。アプリ管理者にお問い合わせください。');
    return false;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result: any = await GoogleSignin.signIn();
    const idToken: string | undefined = result?.data?.idToken ?? result?.idToken;
    if (!idToken) throw new Error('Google Sign-in: idToken が取得できませんでした。');

    const credential = GoogleAuthProvider.credential(idToken);
    await linkWithCredential(auth.currentUser, credential);
    return true;
  } catch (e: any) {
    if (isUserCancelled(e)) return false;
    if (e?.code === 'auth/credential-already-in-use') {
      Alert.alert('連携できません', 'このGoogleアカウントはすでに別のふたことアカウントに連携されています。');
      return false;
    }
    if (e?.code === 'auth/provider-already-linked') {
      Alert.alert('すでに連携済み', 'このアカウントはすでにGoogleと連携されています。');
      return false;
    }
    showError(e, 'Google連携エラー');
    return false;
  }
}

/** 現在ログイン中のアカウントに Apple ID を連携する（iOS のみ） */
export async function linkAppleToCurrentUser(): Promise<boolean> {
  if (!auth.currentUser) {
    Alert.alert('エラー', 'ログインが必要です');
    return false;
  }
  if (Platform.OS !== 'ios') {
    Alert.alert('未対応', 'Apple Sign-inはiOSのみで利用できます。');
    return false;
  }

  try {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      Alert.alert('Apple Sign-in未対応', 'この端末では Apple Sign-in が利用できません。');
      return false;
    }

    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error('Apple Sign-in: identityToken が取得できませんでした。');
    }

    const provider = new OAuthProvider('apple.com');
    const oauthCredential = provider.credential({
      idToken: credential.identityToken,
      rawNonce,
    });

    await linkWithCredential(auth.currentUser, oauthCredential);
    return true;
  } catch (e: any) {
    if (isUserCancelled(e)) return false;
    if (e?.code === 'auth/credential-already-in-use') {
      Alert.alert('連携できません', 'このApple IDはすでに別のふたことアカウントに連携されています。');
      return false;
    }
    if (e?.code === 'auth/provider-already-linked') {
      Alert.alert('すでに連携済み', 'このアカウントはすでにApple IDと連携されています。');
      return false;
    }
    showError(e, 'Apple連携エラー');
    return false;
  }
}
