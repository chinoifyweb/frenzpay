import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Dimensions, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { formatCurrency, getCurrencyColor } from '../../lib/utils';
import { mockWallets, mockTransactions } from '../../lib/mockData';
import { useTheme } from '../../lib/theme';
import { useUser } from '../../lib/userContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 48;

export default function DashboardScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useTheme();
  const { user } = useUser();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  const totalBalance = mockWallets.reduce((sum, w) => sum + w.balance, 0);
  const recentTransactions = mockTransactions.slice(0, 5);
  const firstName = (user?.full_name || 'User').split(' ')[0];

  const handleInvite = async () => {
    const code = user?.referral_code || 'FRENZ2026';
    try {
      await Share.share({
        message: `Join Frenz Pay and get paid globally! Use my referral code: ${code}\n\nDownload: https://frenzpay.co/download`,
        title: 'Invite to Frenz Pay',
      });
    } catch (err) {
      // cancelled
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C853" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>Welcome back</Text>
            <Text style={[styles.name, { color: colors.text }]}>{firstName}</Text>
          </View>
          <TouchableOpacity style={[styles.notifButton, { backgroundColor: colors.surfaceLight }]}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            <View style={styles.notifDot} />
          </TouchableOpacity>
        </View>

        {/* Total Balance */}
        <View style={[styles.totalBalanceCard]}>
          <Text style={styles.totalLabel}>Total Balance (est.)</Text>
          <Text style={styles.totalAmount}>{formatCurrency(totalBalance, 'USD')}</Text>
          <View style={styles.totalRow}>
            <View style={styles.trendBadge}>
              <Ionicons name="trending-up" size={14} color="#00C853" />
              <Text style={styles.trendText}>+12.5%</Text>
            </View>
            <Text style={styles.trendPeriod}>this month</Text>
          </View>
        </View>

        {/* Wallet Cards */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Wallets</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.walletsScroll}
          snapToInterval={CARD_WIDTH * 0.78 + 12}
          decelerationRate="fast"
        >
          {mockWallets.map((wallet) => (
            <View
              key={wallet.id}
              style={[styles.walletCard, { borderLeftColor: getCurrencyColor(wallet.currency), backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
            >
              <View style={styles.walletHeader}>
                <View style={[styles.currencyBadge, { backgroundColor: getCurrencyColor(wallet.currency) }]}>
                  <Text style={styles.currencyBadgeText}>{wallet.currency}</Text>
                </View>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
              </View>
              <Text style={[styles.walletBalance, { color: colors.text }]}>
                {formatCurrency(wallet.balance, wallet.currency)}
              </Text>
              <Text style={[styles.walletAvailable, { color: colors.textMuted }]}>
                Available: {formatCurrency(wallet.available_balance, wallet.currency)}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} onPress={() => router.push('/(tabs)/withdraw')}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(0,200,83,0.15)' }]}>
              <Ionicons name="arrow-up-circle" size={24} color="#00C853" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Withdraw</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} onPress={() => router.push('/(tabs)/accounts')}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(26,115,232,0.15)' }]}>
              <Ionicons name="share-outline" size={24} color="#1a73e8" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Share{'\n'}Account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} onPress={handleInvite}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(124,58,237,0.15)' }]}>
              <Ionicons name="people-outline" size={24} color="#7c3aed" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Invite{'\n'}Friends</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} onPress={() => router.push('/(tabs)/transactions')}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
              <Ionicons name="receipt-outline" size={24} color="#f59e0b" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>View{'\n'}History</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Transactions */}
        <View style={styles.recentHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.transactionsCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {recentTransactions.map((tx, index) => (
            <TouchableOpacity
              key={tx.id}
              style={[styles.txRow, index < recentTransactions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
              onPress={() => Alert.alert(
                tx.description,
                `Amount: ${tx.type === 'credit' ? '+' : '-'}${formatCurrency(tx.amount, tx.currency)}\nStatus: ${tx.status}\nDate: ${new Date(tx.created_at).toLocaleDateString()}\nRef: ${tx.reference}${tx.fee > 0 ? `\nFee: ${formatCurrency(tx.fee, tx.currency)}` : ''}${tx.sender_name ? `\nFrom: ${tx.sender_name}` : ''}`
              )}
              activeOpacity={0.7}
            >
              <View style={[
                styles.txIcon,
                { backgroundColor: tx.type === 'credit' ? 'rgba(0,200,83,0.12)' : 'rgba(239,68,68,0.12)' },
              ]}>
                <Ionicons
                  name={tx.type === 'credit' ? 'arrow-down' : 'arrow-up'}
                  size={18}
                  color={tx.type === 'credit' ? '#00C853' : '#ef4444'}
                />
              </View>
              <View style={styles.txInfo}>
                <Text style={[styles.txDesc, { color: colors.text }]} numberOfLines={1}>{tx.description}</Text>
                <Text style={[styles.txDate, { color: colors.textMuted }]}>
                  {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {tx.sender_name ? ` · ${tx.sender_name}` : ''}
                </Text>
              </View>
              <View style={styles.txAmountCol}>
                <Text style={[styles.txAmount, { color: tx.type === 'credit' ? '#00C853' : '#ef4444' }]}>
                  {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                </Text>
                <View style={[
                  styles.statusBadge,
                  tx.status === 'completed' && styles.statusCompleted,
                  tx.status === 'pending' && styles.statusPending,
                ]}>
                  <Text style={[
                    styles.statusText,
                    tx.status === 'completed' && styles.statusTextCompleted,
                    tx.status === 'pending' && styles.statusTextPending,
                  ]}>{tx.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20,
  },
  greeting: { fontSize: 14, marginBottom: 4 },
  name: { fontSize: 22, fontWeight: '700' },
  notifButton: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute', top: 10, right: 12, width: 8, height: 8,
    borderRadius: 4, backgroundColor: '#ef4444',
  },
  totalBalanceCard: {
    marginHorizontal: 20, padding: 24, borderRadius: 20,
    backgroundColor: 'rgba(0,200,83,0.08)', borderWidth: 1, borderColor: 'rgba(0,200,83,0.2)',
    marginBottom: 28,
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  totalAmount: { fontSize: 34, fontWeight: '800', color: '#fff', marginBottom: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trendBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,200,83,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  trendText: { fontSize: 13, fontWeight: '600', color: '#00C853' },
  trendPeriod: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  sectionTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: 20, marginBottom: 14 },
  walletsScroll: { paddingHorizontal: 20, gap: 12, paddingBottom: 4 },
  walletCard: {
    width: CARD_WIDTH * 0.78, borderRadius: 16, padding: 20, borderLeftWidth: 4, borderWidth: 1,
  },
  walletHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  currencyBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  currencyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  walletBalance: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  walletAvailable: { fontSize: 13 },
  actionsGrid: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 28 },
  actionCard: {
    flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 10, borderWidth: 1,
  },
  actionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  recentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingRight: 20, marginBottom: 0,
  },
  seeAll: { fontSize: 14, color: '#00C853', fontWeight: '600' },
  transactionsCard: {
    marginHorizontal: 20, borderRadius: 16, borderWidth: 1, overflow: 'hidden',
  },
  txRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  txDate: { fontSize: 12 },
  txAmountCol: { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontSize: 14, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusCompleted: { backgroundColor: 'rgba(0,200,83,0.12)' },
  statusPending: { backgroundColor: 'rgba(245,158,11,0.12)' },
  statusText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  statusTextCompleted: { color: '#00C853' },
  statusTextPending: { color: '#f59e0b' },
});
