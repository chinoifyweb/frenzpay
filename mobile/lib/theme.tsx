import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceLight: string;
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentBg: string;
  error: string;
  warning: string;
  tabBar: string;
  tabBarBorder: string;
  inputBg: string;
  inputBorder: string;
  divider: string;
}

export const darkColors: ThemeColors = {
  background: '#0A1628',
  surface: 'rgba(255,255,255,0.05)',
  surfaceLight: 'rgba(255,255,255,0.08)',
  card: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.06)',
  text: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.35)',
  accent: '#00C853',
  accentBg: 'rgba(0,200,83,0.12)',
  error: '#ef4444',
  warning: '#f59e0b',
  tabBar: '#0D1B2A',
  tabBarBorder: 'rgba(255,255,255,0.06)',
  inputBg: 'rgba(255,255,255,0.06)',
  inputBorder: 'rgba(255,255,255,0.1)',
  divider: 'rgba(255,255,255,0.06)',
};

export const lightColors: ThemeColors = {
  background: '#F5F7FA',
  surface: '#ffffff',
  surfaceLight: '#f0f2f5',
  card: '#ffffff',
  cardBorder: '#e5e7eb',
  text: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  accent: '#00C853',
  accentBg: 'rgba(0,200,83,0.1)',
  error: '#ef4444',
  warning: '#f59e0b',
  tabBar: '#ffffff',
  tabBarBorder: '#e5e7eb',
  inputBg: '#f3f4f6',
  inputBorder: '#d1d5db',
  divider: '#e5e7eb',
};

interface ThemeContextType {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  colors: darkColors,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('theme_mode').then((val) => {
      if (val === 'light') setIsDark(false);
    });
  }, []);

  const toggleTheme = async () => {
    const newMode = !isDark;
    setIsDark(newMode);
    await AsyncStorage.setItem('theme_mode', newMode ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ isDark, colors: isDark ? darkColors : lightColors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
