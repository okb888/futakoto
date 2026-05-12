import { Tabs } from 'expo-router';
import { House, CalendarBlank, GearSix, Sparkle } from 'phosphor-react-native';
import { COLORS } from '../../lib/theme';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.placeholder,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.borderSoft,
          height: 84,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarLabelStyle: { fontSize: 11 },
        headerStyle: { backgroundColor: COLORS.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600', color: COLORS.text, fontSize: 16 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          headerShown: true,
          headerTitle: 'ふたこと',
          headerTitleStyle: {
            fontWeight: '700',
            color: COLORS.text,
            fontSize: 18,
            letterSpacing: 3,
          },
          tabBarIcon: ({ color, focused }) => (
            <House size={24} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="consult"
        options={{
          title: '相談',
          tabBarIcon: ({ color, focused }) => (
            <Sparkle size={24} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: '振り返り',
          tabBarIcon: ({ color, focused }) => (
            <CalendarBlank size={24} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: ({ color, focused }) => (
            <GearSix size={24} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen name="post" options={{ href: null, headerShown: true, title: '記録する' }} />
      <Tabs.Screen name="favorites" options={{ href: null, headerShown: true, title: 'お気に入り' }} />
    </Tabs>
  );
}
