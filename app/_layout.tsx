import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../lib/auth';

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

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootGuard />
    </AuthProvider>
  );
}
