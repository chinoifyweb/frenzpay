import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';

type IoniconsName = keyof typeof Ionicons.glyphMap;

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // On Android, the system navigation bar overlaps our tab bar.
  // We need to add extra bottom padding to push our tabs above it.
  // If the device has gesture navigation (insets.bottom > 0), use that.
  // If it has software buttons (insets.bottom = 0), add manual padding.
  const bottomPadding = Platform.OS === 'ios'
    ? Math.max(insets.bottom, 20)
    : Math.max(insets.bottom, 16); // At least 16px above device nav on Android

  const tabBarHeight = Platform.OS === 'ios'
    ? 54 + bottomPadding
    : 58 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#00C853',
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.tabBarBorder,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          height: tabBarHeight,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name={'home' as IoniconsName} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          tabBarLabel: 'Accounts',
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name={'card' as IoniconsName} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="withdraw"
        options={{
          tabBarLabel: 'Withdraw',
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name={'arrow-up-circle' as IoniconsName} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          tabBarLabel: 'Activity',
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name={'swap-vertical' as IoniconsName} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          tabBarLabel: 'Tools',
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name={'construct' as IoniconsName} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name={'settings' as IoniconsName} size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
