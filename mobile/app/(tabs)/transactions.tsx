import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDate, getCurrencyColor } from '../../lib/utils';
import { mockTransactions } from '../../lib/mockData';
import type { Transaction, TransactionType } from '../../lib/types';

type FilterType = 'all' | 'credit' | 'debit';

export default function TransactionsScreen() {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredTransactions = mockTransactions.filter((tx) => {
    if (filter === 'all') return true;
    return tx.type === filter;
  });

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'credit', label: 'Credits' },
    { key: 'debit', label: 'Debits' },
  ];

  const renderTransaction = ({ item, index }: { item: Transaction; index: number }) => {
    const isCredit = item.type === 'credit';
    return (
      <View style={[styles.txCard, index === 0 && { marginTop: 0 }]}>
        <View style={styles.txRow}>
          <View style={[
            styles.txIcon,
            { backgroundColor: isCredit ? 'rgba(0,200,83,0.12)' : 'rgba(239,68,68,0.12)' },
          ]}>
            <Ionicons
              name={isCredit ? 'arrow-down' : 'arrow-up'}
              size={20}
              color={isCredit ? '#00C853' : '#ef4444'}
            />
          </View>

          <View style={styles.txMiddle}>
            <Text style={styles.txDesc} numberOfLines={1}>{item.description}</Text>
            <View style={styles.txMeta}>
              <Text style={styles.txDate}>{formatDate(item.created_at)}</Text>
              {item.sender_name && (
                <>
                  <View style={styles.dot} />
                  <Text style={styles.txSender} numberOfLines={1}>{item.sender_name}</Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.txRight}>
            <Text style={[styles.txAmount, { color: isCredit ? '#00C853' : '#ef4444' }]}>
              {isCredit ? '+' : '-'}{formatCurrency(item.amount, item.currency)}
            </Text>
            <View style={styles.txBottomRow}>
              <View style={[
                styles.currencyTag,
                { backgroundColor: `${getCurrencyColor(item.currency)}20` },
              ]}>
                <Text style={[styles.currencyTagText, { color: getCurrencyColor(item.currency) }]}>
                  {item.currency}
                </Text>
              </View>
              <View style={[
                styles.statusTag,
                item.status === 'completed' && styles.statusCompleted,
                item.status === 'pending' && styles.statusPending,
                item.status === 'failed' && styles.statusFailed,
              ]}>
                <Text style={[
                  styles.statusTagText,
                  item.status === 'completed' && { color: '#00C853' },
                  item.status === 'pending' && { color: '#f59e0b' },
                  item.status === 'failed' && { color: '#ef4444' },
                ]}>{item.status}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Fee row for debits */}
        {item.fee > 0 && (
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Fee</Text>
            <Text style={styles.feeValue}>{formatCurrency(item.fee, item.currency)}</Text>
          </View>
        )}

        {/* Reference */}
        <View style={styles.refRow}>
          <Text style={styles.refLabel}>Ref:</Text>
          <Text style={styles.refValue}>{item.reference}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
        <Text style={styles.subtitle}>
          {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterButton, filter === f.key && styles.filterButtonActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Transaction List */}
      <FlatList
        data={filteredTransactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>No transactions</Text>
            <Text style={styles.emptyText}>
              {filter === 'all'
                ? 'Your transaction history will appear here.'
                : `No ${filter} transactions found.`}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(0,200,83,0.15)', borderColor: 'rgba(0,200,83,0.3)',
  },
  filterText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  filterTextActive: { color: '#00C853' },
  listContent: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  txCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  txRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  txIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  txMiddle: { flex: 1 },
  txDesc: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 4 },
  txMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txDate: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.25)' },
  txSender: { fontSize: 12, color: 'rgba(255,255,255,0.4)', flexShrink: 1 },
  txRight: { alignItems: 'flex-end', gap: 6 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  txBottomRow: { flexDirection: 'row', gap: 6 },
  currencyTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  currencyTagText: { fontSize: 10, fontWeight: '700' },
  statusTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusCompleted: { backgroundColor: 'rgba(0,200,83,0.12)' },
  statusPending: { backgroundColor: 'rgba(245,158,11,0.12)' },
  statusFailed: { backgroundColor: 'rgba(239,68,68,0.12)' },
  statusTagText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  feeRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  feeLabel: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
  feeValue: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  refRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6,
  },
  refLabel: { fontSize: 11, color: 'rgba(255,255,255,0.25)' },
  refValue: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  emptyText: { fontSize: 14, color: 'rgba(255,255,255,0.35)', textAlign: 'center' },
});
