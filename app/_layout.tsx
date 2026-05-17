import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { COLORS } from '../lib/theme';

Sentry.init({
  // Sentry DSN: https://sentry.io でプロジェクト作成後、EXPO_PUBLIC_SENTRY_DSN に設定
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
});

function RootGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inApp = segments[0] === '(app)';
    if (!user && inApp) {
      router.replace('/login');
    } else if (user && !inApp) {
      router.replace('/(app)');
    }
  }, [user, loading, segments]);

  useEffect(() => {
    // cold-start: アプリが閉じている状態で通知タップした場合
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationResponse(response);
    });

    // foreground/background: アプリが起動中・バックグラウンドで通知タップ
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);

  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data as Record<string, string> | undefined;
    if (!data) return;
    if (data.kind === 'sharedEntry') {
      router.push('/(app)/');
    } else if (data.kind === 'dailyReminder') {
      router.push('/(app)/post');
    }
  }

  // 認証状態が確定する前、または未認証で保護領域にいる場合は中身を描画しない
  // （起動直後・サインアウト直後に (app) 画面が一瞬見える問題を防ぐ）
  const inApp = segments[0] === '(app)';
  if (loading || (!user && inApp)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootGuard />
    </AuthProvider>
  );
}
