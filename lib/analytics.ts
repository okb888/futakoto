import * as Sentry from '@sentry/react-native';

// Firebase Analytics は Web SDK では React Native で制限あり。
// measurementId が設定されている場合のみ有効化される。
let analyticsInstance: ReturnType<typeof import('firebase/analytics').getAnalytics> | null = null;

export async function initAnalytics(app: import('firebase/app').FirebaseApp, measurementId?: string) {
  if (!measurementId) return;
  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) {
      analyticsInstance = getAnalytics(app);
    }
  } catch {
    // React Native 環境では isSupported() が false を返す場合がある。無視してよい。
  }
}

type EventParams = Record<string, string | number | boolean | undefined>;

export function track(eventName: string, params?: EventParams) {
  // Sentry にもパンくずとして残す（クラッシュ前後のユーザー行動を追跡）
  Sentry.addBreadcrumb({ category: 'analytics', message: eventName, data: params, level: 'info' });

  if (!analyticsInstance) return;
  try {
    // 動的 import 済みのため同期的に使えるが、型を合わせるために try/catch
    const { logEvent } = require('firebase/analytics');
    logEvent(analyticsInstance, eventName, params);
  } catch {
    // 計測失敗はサイレントに握り潰す
  }
}

// --- イベント定義 ---

export function trackLogin(method: 'apple' | 'google' | 'email') {
  track('login', { method });
}

export function trackSignUp(method: 'apple' | 'google' | 'email') {
  track('sign_up', { method });
}

export function trackEntryCreated(params: { mood: number; visibility: 'shared' | 'private' }) {
  track('entry_created', params);
}

export function trackAiFeatureUsed(feature: 'rewrite' | 'consult' | 'interpret' | 'summary') {
  track('ai_feature_used', { feature });
}

export function trackAiQuotaExceeded(feature: string) {
  track('ai_quota_exceeded', { feature });
}

export function trackPairCompleted() {
  track('pair_completed');
}

export function trackPaywallShown(reason: string) {
  track('paywall_shown', { reason });
}

export function trackPurchaseStarted() {
  track('purchase_started');
}

export function trackPurchaseCompleted() {
  track('purchase_completed');
}

export function trackPurchaseFailed(error: string) {
  track('purchase_failed', { error });
}

export function trackRestoreCompleted(success: boolean) {
  track('purchase_restored', { success });
}
