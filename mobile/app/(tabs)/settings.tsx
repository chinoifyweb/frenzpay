import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

type IoniconsName = keyof typeof Ionicons.glyphMap;

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function SettingsRow({
  icon, iconColor, label, value, onPress, showArrow = true, isLast = false,
}: {
  icon: string; iconColor: string; label: string; value?: string;
  onPress?: () => void; showArrow?: boolean; isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.settingsRow, !isLast && styles.settingsRowBorder]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={icon as IoniconsName} size={18} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value && <Text style={styles.rowValue}>{value}</Text>}
      </View>
      {showArrow && onPress && (
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
      )}
    </TouchableOpacity>
  );
}

function SettingsToggle({
  icon, iconColor, label, value, onToggle, isLast = false,
}: {
  icon: string; iconColor: string; label: string; value: boolean;
  onToggle: (v: boolean) => void; isLast?: boolean;
}) {
  return (
    <View style={[styles.settingsRow, !isLast && styles.settingsRowBorder]}>
      <View style={[styles.rowIconWrap, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={icon as IoniconsName} size={18} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(0,200,83,0.4)' }}
        thumbColor={value ? '#00C853' : '#666'}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [twoFA, setTwoFA] = useState(false);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);

  const referralCode = 'FRENZ-JD2024';

  const handleCopyReferral = async () => {
    await Clipboard.setStringAsync(referralCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Referral code copied to clipboard');
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>JD</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>John Doe</Text>
            <Text style={styles.profileEmail}>john@example.com</Text>
          </View>
          <TouchableOpacity style={styles.editButton}>
            <Ionicons name="pencil" size={16} color="#00C853" />
          </TouchableOpacity>
        </View>

        {/* KYC Status */}
        <View style={styles.kycCard}>
          <View style={styles.kycLeft}>
            <View style={styles.kycIconWrap}>
              <Ionicons name="shield-checkmark" size={20} color="#00C853" />
            </View>
            <View>
              <Text style={styles.kycTitle}>KYC Verification</Text>
              <Text style={styles.kycStatus}>Verified</Text>
            </View>
          </View>
          <View style={styles.kycBadge}>
            <Text style={styles.kycBadgeText}>Complete</Text>
          </View>
        </View>

        {/* Account */}
        <SettingsSection title="Account">
          <SettingsRow
            icon="person-outline"
            iconColor="#1a73e8"
            label="Personal Information"
            value="John Doe"
            onPress={() => {}}
          />
          <SettingsRow
            icon="mail-outline"
            iconColor="#7c3aed"
            label="Email"
            value="john@example.com"
            onPress={() => {}}
          />
          <SettingsRow
            icon="call-outline"
            iconColor="#f59e0b"
            label="Phone"
            value="+234 800 000 0000"
            onPress={() => {}}
            isLast
          />
        </SettingsSection>

        {/* Security */}
        <SettingsSection title="Security">
          <SettingsRow
            icon="key-outline"
            iconColor="#ef4444"
            label="Change Password"
            onPress={() => {}}
          />
          <SettingsToggle
            icon="finger-print"
            iconColor="#00C853"
            label="Two-Factor Auth (2FA)"
            value={twoFA}
            onToggle={setTwoFA}
            isLast
          />
        </SettingsSection>

        {/* Notifications */}
        <SettingsSection title="Notifications">
          <SettingsToggle
            icon="notifications-outline"
            iconColor="#1a73e8"
            label="Push Notifications"
            value={pushNotifs}
            onToggle={setPushNotifs}
          />
          <SettingsToggle
            icon="mail-unread-outline"
            iconColor="#7c3aed"
            label="Email Notifications"
            value={emailNotifs}
            onToggle={setEmailNotifs}
            isLast
          />
        </SettingsSection>

        {/* Referral */}
        <SettingsSection title="Referral Program">
          <View style={styles.referralRow}>
            <View style={styles.referralInfo}>
              <Text style={styles.referralLabel}>Your Referral Code</Text>
              <Text style={styles.referralCode}>{referralCode}</Text>
            </View>
            <TouchableOpacity style={styles.referralCopyButton} onPress={handleCopyReferral}>
              <Ionicons name="copy-outline" size={16} color="#00C853" />
              <Text style={styles.referralCopyText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </SettingsSection>

        {/* Support */}
        <SettingsSection title="Support">
          <SettingsRow
            icon="help-circle-outline"
            iconColor="#1a73e8"
            label="Help Center"
            onPress={() => {}}
          />
          <SettingsRow
            icon="chatbubble-outline"
            iconColor="#00C853"
            label="Contact Support"
            onPress={() => {}}
          />
          <SettingsRow
            icon="document-text-outline"
            iconColor="#7c3aed"
            label="Terms of Service"
            onPress={() => {}}
          />
          <SettingsRow
            icon="shield-outline"
            iconColor="#f59e0b"
            label="Privacy Policy"
            onPress={() => {}}
            isLast
          />
        </SettingsSection>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.versionText}>Frenz Pay v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628' },
  scrollContent: { paddingBottom: 40 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  profileCard: {
    marginHorizontal: 20, marginBottom: 14, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 14,
  },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,200,83,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#00C853' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 2 },
  profileEmail: { fontSize: 13, color: 'rgba(255,255,255,0.45)' },
  editButton: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(0,200,83,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  kycCard: {
    marginHorizontal: 20, marginBottom: 24, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,200,83,0.06)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(0,200,83,0.15)',
  },
  kycLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kycIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,200,83,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  kycTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  kycStatus: { fontSize: 12, color: '#00C853', marginTop: 2 },
  kycBadge: {
    backgroundColor: 'rgba(0,200,83,0.15)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
  },
  kycBadgeText: { fontSize: 12, fontWeight: '600', color: '#00C853' },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 10,
  },
  sectionCard: {
    marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12,
  },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  rowIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: '#fff' },
  rowValue: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  referralRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, paddingHorizontal: 16,
  },
  referralInfo: {},
  referralLabel: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 4 },
  referralCode: { fontSize: 18, fontWeight: '800', color: '#00C853', letterSpacing: 1 },
  referralCopyButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,200,83,0.12)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  referralCopyText: { fontSize: 13, fontWeight: '600', color: '#00C853' },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 8, paddingVertical: 16, borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#ef4444' },
  versionText: {
    textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 20,
  },
});
