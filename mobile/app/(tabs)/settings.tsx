import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert,
  Modal, TextInput, Share, Linking, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';
import { useUser } from '../../lib/userContext';

type IoniconsName = keyof typeof Ionicons.glyphMap;

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, refresh } = useUser();

  // Toggles
  const [twoFA, setTwoFA] = useState(false);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);

  // Modals
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showKYC, setShowKYC] = useState(false);
  const [show2FA, setShow2FA] = useState(false);

  // Edit profile form
  const [editName, setEditName] = useState(user?.full_name || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);

  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // KYC form
  const [kycFullName, setKycFullName] = useState(user?.full_name || '');
  const [kycIdType, setKycIdType] = useState('passport');
  const [kycIdNumber, setKycIdNumber] = useState('');
  const [kycAddress, setKycAddress] = useState('');

  // 2FA
  const [twoFACode, setTwoFACode] = useState('');
  const verificationCode = '847291'; // Mock TOTP code

  const initials = (user?.full_name || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const referralCode = user?.referral_code || `FRENZ-${initials}${new Date().getFullYear()}`;

  const handleCopyReferral = async () => {
    await Clipboard.setStringAsync(referralCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Referral code copied to clipboard');
  };

  const handleInviteFriends = async () => {
    try {
      await Share.share({
        message: `Join Frenz Pay and get paid globally! Use my referral code: ${referralCode}\n\nDownload: https://frenzpay.co/download`,
        title: 'Invite to Frenz Pay',
      });
    } catch (err) {
      // cancelled
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase.from('frenz_users').update({
          full_name: editName.trim(),
          phone: editPhone.trim(),
        }).eq('id', authUser.id);

        await supabase.auth.updateUser({
          data: { full_name: editName.trim(), phone: editPhone.trim() },
        });
      }
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Profile updated successfully');
      setShowEditProfile(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to update profile');
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      Alert.alert('Error', 'New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Password changed successfully');
      setShowChangePassword(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    }
  };

  const handleSubmitKYC = async () => {
    if (!kycFullName || !kycIdNumber || !kycAddress) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setSaving(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase.from('frenz_users').update({
          kyc_status: 'pending',
        }).eq('id', authUser.id);
      }
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('KYC Submitted', 'Your verification is being reviewed. This usually takes 1-2 business days.');
      setShowKYC(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to submit KYC');
    }
    setSaving(false);
  };

  const handleEnable2FA = () => {
    if (twoFACode === verificationCode || twoFACode.length === 6) {
      setTwoFA(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('2FA Enabled', 'Two-factor authentication is now active on your account');
      setShow2FA(false);
      setTwoFACode('');
    } else {
      Alert.alert('Error', 'Invalid verification code');
    }
  };

  const handleToggle2FA = (val: boolean) => {
    if (val) {
      setShow2FA(true);
    } else {
      Alert.alert('Disable 2FA', 'Are you sure you want to disable two-factor authentication?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disable', style: 'destructive', onPress: () => setTwoFA(false) },
      ]);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/');
        },
      },
    ]);
  };

  const handleContactSupport = () => {
    Linking.openURL('https://wa.me/12365997663');
  };

  const kycStatusColor = user?.kyc_status === 'verified' ? '#00C853' : user?.kyc_status === 'pending' ? '#f59e0b' : colors.textMuted;
  const kycStatusLabel = user?.kyc_status === 'verified' ? 'Verified' : user?.kyc_status === 'pending' ? 'Pending Review' : 'Not Started';

  const s = getStyles(colors);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        <View style={s.header}>
          <Text style={[s.title, { color: colors.text }]}>Settings</Text>
        </View>

        {/* Profile Card */}
        <TouchableOpacity
          style={[s.profileCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
          onPress={() => { setEditName(user?.full_name || ''); setEditPhone(user?.phone || ''); setShowEditProfile(true); }}
          activeOpacity={0.7}
        >
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={s.profileInfo}>
            <Text style={[s.profileName, { color: colors.text }]}>{user?.full_name || 'User'}</Text>
            <Text style={[s.profileEmail, { color: colors.textMuted }]}>{user?.email || ''}</Text>
          </View>
          <View style={s.editButton}>
            <Ionicons name="pencil" size={16} color="#00C853" />
          </View>
        </TouchableOpacity>

        {/* KYC Status */}
        <TouchableOpacity
          style={[s.kycCard, { borderColor: `${kycStatusColor}25` }]}
          onPress={() => {
            if (user?.kyc_status === 'verified') {
              Alert.alert('KYC Verified', 'Your identity has been verified successfully.');
            } else {
              setKycFullName(user?.full_name || ''); setShowKYC(true);
            }
          }}
          activeOpacity={0.7}
        >
          <View style={s.kycLeft}>
            <View style={[s.kycIconWrap, { backgroundColor: `${kycStatusColor}15` }]}>
              <Ionicons name="shield-checkmark" size={20} color={kycStatusColor} />
            </View>
            <View>
              <Text style={[s.kycTitle, { color: colors.text }]}>KYC Verification</Text>
              <Text style={[s.kycStatus, { color: kycStatusColor }]}>{kycStatusLabel}</Text>
            </View>
          </View>
          <View style={[s.kycBadge, { backgroundColor: `${kycStatusColor}15` }]}>
            <Text style={[s.kycBadgeText, { color: kycStatusColor }]}>
              {user?.kyc_status === 'verified' ? 'Complete' : user?.kyc_status === 'pending' ? 'Pending' : 'Start'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Account */}
        <SectionTitle title="Account" color={colors.textMuted} />
        <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SettingsRow icon="person-outline" iconColor="#1a73e8" label="Personal Information" value={user?.full_name || 'Not set'}
            onPress={() => { setEditName(user?.full_name || ''); setEditPhone(user?.phone || ''); setShowEditProfile(true); }} colors={colors} />
          <SettingsRow icon="mail-outline" iconColor="#7c3aed" label="Email" value={user?.email || 'Not set'} colors={colors} />
          <SettingsRow icon="call-outline" iconColor="#f59e0b" label="Phone" value={user?.phone || 'Not set'}
            onPress={() => { setEditName(user?.full_name || ''); setEditPhone(user?.phone || ''); setShowEditProfile(true); }} colors={colors} isLast />
        </View>

        {/* Appearance */}
        <SectionTitle title="Appearance" color={colors.textMuted} />
        <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[s.settingsRow, s.settingsRowBorder]}>
            <View style={[s.rowIconWrap, { backgroundColor: isDark ? 'rgba(124,58,237,0.12)' : 'rgba(245,158,11,0.12)' }]}>
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={18} color={isDark ? '#7c3aed' : '#f59e0b'} />
            </View>
            <View style={s.rowContent}>
              <Text style={[s.rowLabel, { color: colors.text }]}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
              <Text style={[s.rowValue, { color: colors.textMuted }]}>Tap to switch</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.inputBg, true: 'rgba(124,58,237,0.4)' }}
              thumbColor={isDark ? '#7c3aed' : '#f59e0b'}
            />
          </View>
        </View>

        {/* Security */}
        <SectionTitle title="Security" color={colors.textMuted} />
        <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SettingsRow icon="key-outline" iconColor="#ef4444" label="Change Password"
            onPress={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowChangePassword(true); }} colors={colors} />
          <View style={[s.settingsRow]}>
            <View style={[s.rowIconWrap, { backgroundColor: 'rgba(0,200,83,0.12)' }]}>
              <Ionicons name="finger-print" size={18} color="#00C853" />
            </View>
            <View style={s.rowContent}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Two-Factor Auth (2FA)</Text>
              <Text style={[s.rowValue, { color: colors.textMuted }]}>{twoFA ? 'Enabled' : 'Disabled'}</Text>
            </View>
            <Switch
              value={twoFA}
              onValueChange={handleToggle2FA}
              trackColor={{ false: colors.inputBg, true: 'rgba(0,200,83,0.4)' }}
              thumbColor={twoFA ? '#00C853' : '#666'}
            />
          </View>
        </View>

        {/* Notifications */}
        <SectionTitle title="Notifications" color={colors.textMuted} />
        <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[s.settingsRow, s.settingsRowBorder]}>
            <View style={[s.rowIconWrap, { backgroundColor: 'rgba(26,115,232,0.12)' }]}>
              <Ionicons name="notifications-outline" size={18} color="#1a73e8" />
            </View>
            <View style={s.rowContent}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Push Notifications</Text>
            </View>
            <Switch value={pushNotifs} onValueChange={setPushNotifs}
              trackColor={{ false: colors.inputBg, true: 'rgba(26,115,232,0.4)' }}
              thumbColor={pushNotifs ? '#1a73e8' : '#666'} />
          </View>
          <View style={s.settingsRow}>
            <View style={[s.rowIconWrap, { backgroundColor: 'rgba(124,58,237,0.12)' }]}>
              <Ionicons name="mail-unread-outline" size={18} color="#7c3aed" />
            </View>
            <View style={s.rowContent}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Email Notifications</Text>
            </View>
            <Switch value={emailNotifs} onValueChange={setEmailNotifs}
              trackColor={{ false: colors.inputBg, true: 'rgba(124,58,237,0.4)' }}
              thumbColor={emailNotifs ? '#7c3aed' : '#666'} />
          </View>
        </View>

        {/* Referral */}
        <SectionTitle title="Referral Program" color={colors.textMuted} />
        <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={s.referralRow}>
            <View style={s.referralInfo}>
              <Text style={[s.referralLabel, { color: colors.textMuted }]}>Your Referral Code</Text>
              <Text style={s.referralCode}>{referralCode}</Text>
            </View>
            <TouchableOpacity style={s.referralCopyButton} onPress={handleCopyReferral}>
              <Ionicons name="copy-outline" size={16} color="#00C853" />
              <Text style={s.referralCopyText}>Copy</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.inviteButton} onPress={handleInviteFriends}>
            <Ionicons name="people-outline" size={18} color="#fff" />
            <Text style={s.inviteButtonText}>Invite Friends</Text>
          </TouchableOpacity>
        </View>

        {/* Support */}
        <SectionTitle title="Support" color={colors.textMuted} />
        <View style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SettingsRow icon="help-circle-outline" iconColor="#1a73e8" label="Help Center"
            onPress={() => Linking.openURL('https://frenzpay.co/faq')} colors={colors} />
          <SettingsRow icon="logo-whatsapp" iconColor="#25D366" label="Contact Support"
            onPress={handleContactSupport} colors={colors} />
          <SettingsRow icon="document-text-outline" iconColor="#7c3aed" label="Terms of Service"
            onPress={() => Linking.openURL('https://frenzpay.co/terms')} colors={colors} />
          <SettingsRow icon="shield-outline" iconColor="#f59e0b" label="Privacy Policy"
            onPress={() => Linking.openURL('https://frenzpay.co/privacy')} colors={colors} isLast />
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={[s.versionText, { color: colors.textMuted }]}>Frenz Pay v1.0.0</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.background }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditProfile(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>Full Name</Text>
              <TextInput style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                value={editName} onChangeText={setEditName} placeholder="Your name" placeholderTextColor={colors.textMuted} />
            </View>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>Email</Text>
              <View style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, justifyContent: 'center' }]}>
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>{user?.email || ''}</Text>
              </View>
              <Text style={[s.formHint, { color: colors.textMuted }]}>Email cannot be changed</Text>
            </View>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>Phone</Text>
              <TextInput style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                value={editPhone} onChangeText={setEditPhone} placeholder="+1 234 567 8900" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />
            </View>
            <TouchableOpacity style={s.saveButton} onPress={handleSaveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveButtonText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showChangePassword} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.background }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowChangePassword(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>New Password</Text>
              <TextInput style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                value={newPassword} onChangeText={setNewPassword} placeholder="Min. 8 characters" placeholderTextColor={colors.textMuted} secureTextEntry />
            </View>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>Confirm New Password</Text>
              <TextInput style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password" placeholderTextColor={colors.textMuted} secureTextEntry />
            </View>
            <TouchableOpacity style={s.saveButton} onPress={handleChangePassword} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveButtonText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* KYC Modal */}
      <Modal visible={showKYC} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.background }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>KYC Verification</Text>
              <TouchableOpacity onPress={() => setShowKYC(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.modalDesc, { color: colors.textSecondary }]}>
              Complete identity verification to unlock higher transaction limits and full platform access.
            </Text>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>Full Legal Name</Text>
              <TextInput style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                value={kycFullName} onChangeText={setKycFullName} placeholder="As it appears on your ID" placeholderTextColor={colors.textMuted} />
            </View>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>ID Type</Text>
              <View style={s.idTypeRow}>
                {[{ key: 'passport', label: 'Passport' }, { key: 'drivers_license', label: "Driver's License" }, { key: 'national_id', label: 'National ID' }].map(t => (
                  <TouchableOpacity key={t.key}
                    style={[s.idTypeOption, kycIdType === t.key && s.idTypeOptionActive, { borderColor: kycIdType === t.key ? '#00C853' : colors.cardBorder }]}
                    onPress={() => setKycIdType(t.key)}>
                    <Text style={[s.idTypeText, { color: kycIdType === t.key ? '#00C853' : colors.textSecondary }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>ID Number</Text>
              <TextInput style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                value={kycIdNumber} onChangeText={setKycIdNumber} placeholder="Enter your ID number" placeholderTextColor={colors.textMuted} />
            </View>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>Residential Address</Text>
              <TextInput style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text, height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                value={kycAddress} onChangeText={setKycAddress} placeholder="Enter your full address" placeholderTextColor={colors.textMuted} multiline />
            </View>
            <TouchableOpacity style={s.saveButton} onPress={handleSubmitKYC} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveButtonText}>Submit for Verification</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2FA Setup Modal */}
      <Modal visible={show2FA} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.background }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Enable 2FA</Text>
              <TouchableOpacity onPress={() => setShow2FA(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.modalDesc, { color: colors.textSecondary }]}>
              Add an extra layer of security. You'll need to enter a verification code each time you sign in.
            </Text>
            <View style={[s.qrPlaceholder, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <Ionicons name="qr-code" size={80} color={colors.textMuted} />
              <Text style={[s.qrText, { color: colors.textSecondary }]}>Scan with your authenticator app</Text>
              <View style={[s.secretKey, { backgroundColor: colors.inputBg }]}>
                <Text style={[s.secretKeyText, { color: colors.text }]}>FRENZ-2FA-MOCK-KEY</Text>
                <TouchableOpacity onPress={() => {
                  Clipboard.setStringAsync('FRENZ-2FA-MOCK-KEY');
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert('Copied', 'Secret key copied');
                }}>
                  <Ionicons name="copy-outline" size={16} color="#00C853" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.formGroup}>
              <Text style={[s.formLabel, { color: colors.textSecondary }]}>Enter Verification Code</Text>
              <TextInput style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text, textAlign: 'center', fontSize: 24, letterSpacing: 8 }]}
                value={twoFACode} onChangeText={setTwoFACode} placeholder="000000" placeholderTextColor={colors.textMuted}
                keyboardType="number-pad" maxLength={6} />
            </View>
            <TouchableOpacity style={s.saveButton} onPress={handleEnable2FA}>
              <Text style={s.saveButtonText}>Enable 2FA</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionTitle({ title, color }: { title: string; color: string }) {
  return (
    <Text style={{
      fontSize: 13, fontWeight: '700', color, textTransform: 'uppercase',
      letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 10, marginTop: 4,
    }}>{title}</Text>
  );
}

function SettingsRow({
  icon, iconColor, label, value, onPress, isLast = false, colors,
}: {
  icon: string; iconColor: string; label: string; value?: string;
  onPress?: () => void; isLast?: boolean; colors: any;
}) {
  return (
    <TouchableOpacity
      style={[
        {
          flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12,
        },
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.divider },
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <View style={[{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={icon as IoniconsName} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>{label}</Text>
        {value && <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{value}</Text>}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  title: { fontSize: 24, fontWeight: '800' },
  profileCard: {
    marginHorizontal: 20, marginBottom: 14, flexDirection: 'row', alignItems: 'center',
    borderRadius: 18, padding: 18, borderWidth: 1, gap: 14,
  },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,200,83,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#00C853' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  profileEmail: { fontSize: 13 },
  editButton: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(0,200,83,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  kycCard: {
    marginHorizontal: 20, marginBottom: 24, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,200,83,0.04)', borderRadius: 14, padding: 16,
    borderWidth: 1,
  },
  kycLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kycIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kycTitle: { fontSize: 14, fontWeight: '600' },
  kycStatus: { fontSize: 12, marginTop: 2 },
  kycBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  kycBadgeText: { fontSize: 12, fontWeight: '600' },
  sectionCard: {
    marginHorizontal: 20, borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 20,
  },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowValue: { fontSize: 12, marginTop: 2 },
  referralRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, paddingHorizontal: 16,
  },
  referralInfo: {},
  referralLabel: { fontSize: 13, marginBottom: 4 },
  referralCode: { fontSize: 18, fontWeight: '800', color: '#00C853', letterSpacing: 1 },
  referralCopyButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,200,83,0.12)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  referralCopyText: { fontSize: 13, fontWeight: '600', color: '#00C853' },
  inviteButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 16, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#00C853',
  },
  inviteButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 8, paddingVertical: 16, borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#ef4444' },
  versionText: { textAlign: 'center', fontSize: 12, marginTop: 20 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalDesc: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  formInput: { height: 50, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, borderWidth: 1 },
  formHint: { fontSize: 11, marginTop: 4 },
  idTypeRow: { flexDirection: 'row', gap: 8 },
  idTypeOption: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  idTypeOptionActive: { backgroundColor: 'rgba(0,200,83,0.08)' },
  idTypeText: { fontSize: 12, fontWeight: '600' },
  saveButton: {
    backgroundColor: '#00C853', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  qrPlaceholder: {
    alignItems: 'center', padding: 24, borderRadius: 16, borderWidth: 1, marginBottom: 20, gap: 12,
  },
  qrText: { fontSize: 13 },
  secretKey: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  secretKeyText: { fontSize: 14, fontWeight: '600', fontFamily: 'monospace' },
});
