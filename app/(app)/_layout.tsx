import { Tabs } from 'expo-router';
import { House, CalendarBlank, GearSix, Sparkle } from 'phosphor-react-native';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#7B9E87',
        tabBarInactiveTintColor: '#BBB',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#F0F0F0',
          height: 84,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarLabelStyle: { fontSize: 11 },
        headerStyle: { backgroundColor: '#FAFAF8' },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600', color: '#2D2D2D', fontSize: 16 },
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
            color: '#2D2D2D',
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
