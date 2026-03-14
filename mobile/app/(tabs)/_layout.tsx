import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

type IoniconsName = keyof typeof Ionicons.glyphMap;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#00C853',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.35)',
        tabBarStyle: {
          backgroundColor: '#0D1B2A',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.06)',
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 88 : 64,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name={'home' as IoniconsName} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          tabBarLabel: 'Accounts',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name={'card' as IoniconsName} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          tabBarLabel: 'Activity',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name={'swap-vertical' as IoniconsName} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="withdraw"
        options={{
          tabBarLabel: 'Withdraw',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name={'arrow-up-circle' as IoniconsName} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name={'settings' as IoniconsName} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
