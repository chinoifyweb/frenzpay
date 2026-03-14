import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { getCurrencyColor } from '../../lib/utils';
import { mockAccounts, mockWallets } from '../../lib/mockData';
import { formatCurrency } from '../../lib/utils';

function AccountField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldInfo}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
      <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
        <Ionicons name="copy-outline" size={16} color="#00C853" />
      </TouchableOpacity>
    </View>
  );
}

export default function AccountsScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(mockAccounts[0]?.id || null);

  const handleShareAccount = async (account: typeof mockAccounts[0]) => {
    const wallet = mockWallets.find((w) => w.id === account.wallet_id);
    let details = `Frenz Pay ${account.currency} Account\n\n`;
    details += `Account Name: ${account.account_name}\n`;
    details += `Account Number: ${account.account_number}\n`;
    details += `Bank: ${account.bank_name}\n`;
    if (account.routing_number) details += `Routing Number: ${account.routing_number}\n`;
    if (account.sort_code) details += `Sort Code: ${account.sort_code}\n`;
    if (account.iban) details += `IBAN: ${account.iban}\n`;
    if (account.swift_code) details += `SWIFT/BIC: ${account.swift_code}\n`;

    try {
      await Share.share({ message: details, title: `${account.currency} Account Details` });
    } catch (err) {
      // user cancelled
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Virtual Accounts</Text>
          <Text style={styles.subtitle}>
            Share these details to receive international payments
          </Text>
        </View>

        {/* Account Cards */}
        {mockAccounts.map((account) => {
          const wallet = mockWallets.find((w) => w.id === account.wallet_id);
          const isExpanded = expandedId === account.id;
          const color = getCurrencyColor(account.currency);

          return (
            <TouchableOpacity
              key={account.id}
              style={styles.accountCard}
              activeOpacity={0.9}
              onPress={() => setExpandedId(isExpanded ? null : account.id)}
            >
              {/* Card Header */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.currencyDot, { backgroundColor: color }]} />
                  <View>
                    <Text style={styles.currencyLabel}>{account.currency} Account</Text>
                    <Text style={styles.bankName}>{account.bank_name}</Text>
                  </View>
                </View>
                <View style={styles.cardHeaderRight}>
                  {wallet && (
                    <Text style={styles.balanceText}>
                      {formatCurrency(wallet.balance, wallet.currency)}
                    </Text>
                  )}
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="rgba(255,255,255,0.4)"
                  />
                </View>
              </View>

              {/* Status */}
              <View style={styles.statusRow}>
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Active</Text>
                </View>
              </View>

              {/* Expanded Details */}
              {isExpanded && (
                <View style={styles.expandedSection}>
                  <View style={styles.divider} />
                  <AccountField label="Account Name" value={account.account_name} />
                  <AccountField label="Account Number" value={account.account_number} />
                  <AccountField label="Bank Name" value={account.bank_name} />
                  <AccountField label="Routing Number" value={account.routing_number} />
                  <AccountField label="Sort Code" value={account.sort_code} />
                  <AccountField label="IBAN" value={account.iban} />
                  <AccountField label="SWIFT/BIC" value={account.swift_code} />

                  {/* Share Button */}
                  <TouchableOpacity
                    style={[styles.shareButton, { borderColor: color }]}
                    onPress={() => handleShareAccount(account)}
                  >
                    <Ionicons name="share-social-outline" size={18} color={color} />
                    <Text style={[styles.shareButtonText, { color }]}>Share Account Details</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#00C853" />
          <Text style={styles.infoText}>
            Payments received into these accounts are automatically credited to your Frenz Pay wallets. Typical processing time is 1-2 business days.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628' },
  scrollContent: { paddingBottom: 24 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 20 },
  accountCard: {
    marginHorizontal: 20, marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  currencyDot: { width: 10, height: 10, borderRadius: 5 },
  currencyLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  bankName: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  cardHeaderRight: { alignItems: 'flex-end', gap: 4 },
  balanceText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  statusRow: { marginTop: 12 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,200,83,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00C853' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#00C853' },
  expandedSection: { marginTop: 4 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 14 },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  fieldInfo: { flex: 1, marginRight: 12 },
  fieldLabel: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 3 },
  fieldValue: { fontSize: 14, fontWeight: '600', color: '#fff' },
  copyButton: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,200,83,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  shareButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, marginTop: 16,
  },
  shareButtonText: { fontSize: 15, fontWeight: '600' },
  infoCard: {
    flexDirection: 'row', marginHorizontal: 20, marginTop: 8, padding: 16,
    backgroundColor: 'rgba(0,200,83,0.06)', borderRadius: 14, gap: 10,
    borderWidth: 1, borderColor: 'rgba(0,200,83,0.15)',
  },
  infoText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 20 },
});
