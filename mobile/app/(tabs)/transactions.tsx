import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDate, getCurrencyColor } from '../../lib/utils';
import { mockTransactions } from '../../lib/mockData';
import { useTheme } from '../../lib/theme';
import type { Transaction } from '../../lib/types';

type FilterType = 'all' | 'credit' | 'debit';

export default function TransactionsScreen() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const { colors } = useTheme();

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
      <TouchableOpacity
        style={[styles.txCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
        onPress={() => setSelectedTx(item)}
        activeOpacity={0.7}
      >
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
            <Text style={[styles.txDesc, { color: colors.text }]} numberOfLines={1}>{item.description}</Text>
            <View style={styles.txMeta}>
              <Text style={[styles.txDate, { color: colors.textMuted }]}>{formatDate(item.created_at)}</Text>
              {item.sender_name && (
                <>
                  <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
                  <Text style={[styles.txSender, { color: colors.textMuted }]} numberOfLines={1}>{item.sender_name}</Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.txRight}>
            <Text style={[styles.txAmount, { color: isCredit ? '#00C853' : '#ef4444' }]}>
              {isCredit ? '+' : '-'}{formatCurrency(item.amount, item.currency)}
            </Text>
            <View style={styles.txBottomRow}>
              <View style={[styles.currencyTag, { backgroundColor: `${getCurrencyColor(item.currency)}20` }]}>
                <Text style={[styles.currencyTagText, { color: getCurrencyColor(item.currency) }]}>{item.currency}</Text>
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
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Transactions</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterButton, { backgroundColor: colors.surface, borderColor: colors.cardBorder },
              filter === f.key && styles.filterButtonActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, { color: colors.textMuted }, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredTransactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No transactions</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {filter === 'all' ? 'Your transaction history will appear here.' : `No ${filter} transactions found.`}
            </Text>
          </View>
        }
      />

      {/* Transaction Detail Modal */}
      <Modal visible={!!selectedTx} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            {selectedTx && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Transaction Details</Text>
                  <TouchableOpacity onPress={() => setSelectedTx(null)}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Amount display */}
                <View style={styles.detailAmountSection}>
                  <View style={[styles.detailIcon, {
                    backgroundColor: selectedTx.type === 'credit' ? 'rgba(0,200,83,0.15)' : 'rgba(239,68,68,0.15)',
                  }]}>
                    <Ionicons
                      name={selectedTx.type === 'credit' ? 'arrow-down' : 'arrow-up'}
                      size={28}
                      color={selectedTx.type === 'credit' ? '#00C853' : '#ef4444'}
                    />
                  </View>
                  <Text style={[styles.detailAmount, { color: selectedTx.type === 'credit' ? '#00C853' : '#ef4444' }]}>
                    {selectedTx.type === 'credit' ? '+' : '-'}{formatCurrency(selectedTx.amount, selectedTx.currency)}
                  </Text>
                  <View style={[styles.detailStatusBadge, {
                    backgroundColor: selectedTx.status === 'completed' ? 'rgba(0,200,83,0.12)' :
                      selectedTx.status === 'pending' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                  }]}>
                    <Text style={{
                      color: selectedTx.status === 'completed' ? '#00C853' :
                        selectedTx.status === 'pending' ? '#f59e0b' : '#ef4444',
                      fontSize: 13, fontWeight: '700', textTransform: 'capitalize',
                    }}>{selectedTx.status}</Text>
                  </View>
                </View>

                {/* Detail rows */}
                <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                  <DetailRow label="Description" value={selectedTx.description} colors={colors} />
                  <DetailRow label="Type" value={selectedTx.type === 'credit' ? 'Credit (Received)' : 'Debit (Sent)'} colors={colors} />
                  <DetailRow label="Currency" value={selectedTx.currency} colors={colors} />
                  <DetailRow label="Date" value={formatDate(selectedTx.created_at)} colors={colors} />
                  <DetailRow label="Time" value={new Date(selectedTx.created_at).toLocaleTimeString()} colors={colors} />
                  {selectedTx.sender_name && <DetailRow label="From" value={selectedTx.sender_name} colors={colors} />}
                  {selectedTx.fee > 0 && <DetailRow label="Fee" value={formatCurrency(selectedTx.fee, selectedTx.currency)} colors={colors} />}
                  {selectedTx.fee > 0 && <DetailRow label="Net Amount" value={formatCurrency(selectedTx.net_amount, selectedTx.currency)} colors={colors} />}
                  <DetailRow label="Reference" value={selectedTx.reference} colors={colors} mono isLast />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, colors, mono, isLast }: {
  label: string; value: string; colors: any; mono?: boolean; isLast?: boolean;
}) {
  return (
    <View style={[
      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16 },
      !isLast && { borderBottomWidth: 1, borderBottomColor: colors.divider },
    ]}>
      <Text style={{ fontSize: 14, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, ...(mono ? { fontFamily: 'monospace' } : {}) }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 14 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  filterButton: {
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, borderWidth: 1,
  },
  filterButtonActive: { backgroundColor: 'rgba(0,200,83,0.15)', borderColor: 'rgba(0,200,83,0.3)' },
  filterText: { fontSize: 14, fontWeight: '600' },
  filterTextActive: { color: '#00C853' },
  listContent: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  txCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  txRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  txIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  txMiddle: { flex: 1 },
  txDesc: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  txMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txDate: { fontSize: 12 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  txSender: { fontSize: 12, flexShrink: 1 },
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
  emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  detailAmountSection: { alignItems: 'center', marginBottom: 24, gap: 12 },
  detailIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  detailAmount: { fontSize: 32, fontWeight: '800' },
  detailStatusBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12 },
  detailCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
});
