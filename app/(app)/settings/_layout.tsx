import { Stack } from 'expo-router';
import { COLORS } from '../../../lib/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600', color: COLORS.text, fontSize: 16 },
        headerTintColor: COLORS.primary,
        headerBackTitle: '設定',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ title: 'アカウント' }} />
      <Stack.Screen name="partner" options={{ title: 'パートナー連携' }} />
      <Stack.Screen name="notifications" options={{ title: '通知' }} />
      <Stack.Screen name="ai" options={{ title: 'AIアシスタント' }} />
    </Stack>
  );
}
