import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import Constants from 'expo-constants';

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as { firebase?: Partial<FirebaseConfig> };
const firebaseExtra = extra.firebase ?? {};

function requiredConfigValue(key: keyof FirebaseConfig, envKey: string): string {
  const value = process.env[envKey] ?? firebaseExtra[key];
  if (!value) {
    throw new Error(`Firebase config is missing: ${key}`);
  }
  return value;
}

const firebaseConfig: FirebaseConfig = {
  apiKey: requiredConfigValue('apiKey', 'EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requiredConfigValue('authDomain', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: requiredConfigValue('projectId', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: requiredConfigValue('storageBucket', 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredConfigValue(
    'messagingSenderId',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'
  ),
  appId: requiredConfigValue('appId', 'EXPO_PUBLIC_FIREBASE_APP_ID'),
};

export const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
auth.languageCode = 'ja';

export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-northeast1');
