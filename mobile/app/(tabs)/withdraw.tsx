import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { formatCurrency, getCurrencyColor, truncateAddress } from '../../lib/utils';
import { mockWallets } from '../../lib/mockData';
import { useTheme } from '../../lib/theme';
import type { Currency, USDTNetwork } from '../../lib/types';

type Step = 1 | 2 | 3;

const WITHDRAWAL_FEE_PERCENT = 0.5;
const USDT_RATE: Record<Currency, number> = { USD: 1.0, GBP: 1.27, EUR: 1.08 };
const networks: { key: USDTNetwork; label: string; desc: string }[] = [
  { key: 'TRC-20', label: 'TRC-20', desc: 'Tron network - Lower fees (~$1)' },
  { key: 'ERC-20', label: 'ERC-20', desc: 'Ethereum network - Higher fees (~$5-15)' },
];

export default function WithdrawScreen() {
  const [step, setStep] = useState<Step>(1);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('USD');
  const [amount, setAmount] = useState('');
  const [network, setNetwork] = useState<USDTNetwork>('TRC-20');
  const [walletAddress, setWalletAddress] = useState('');

  const selectedWallet = mockWallets.find((w) => w.currency === selectedCurrency);
  const numericAmount = parseFloat(amount) || 0;
  const fee = numericAmount * (WITHDRAWAL_FEE_PERCENT / 100);
  const netAmount = numericAmount - fee;
  const usdtAmount = netAmount * (USDT_RATE[selectedCurrency] || 1);
  const canProceedStep1 = numericAmount > 0 && numericAmount <= (selectedWallet?.available_balance || 0);
  const canProceedStep2 = walletAddress.length >= 20;

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Withdrawal Submitted',
      `Your withdrawal of ${formatCurrency(numericAmount, selectedCurrency)} as ~${usdtAmount.toFixed(2)} USDT has been submitted. You'll receive a notification once it's processed.`,
      [{ text: 'OK', onPress: () => { setStep(1); setAmount(''); setWalletAddress(''); } }]
    );
  };

  const renderStepIndicator = () => (
    <View style={styles.stepRow}>
      {[1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          <View style={[styles.stepCircle, step >= s && styles.stepCircleActive]}>
            {step > s ? (
              <Ionicons name="checkmark" size={14} color="#fff" />
            ) : (
              <Text style={[styles.stepNumber, step >= s && styles.stepNumberActive]}>{s}</Text>
            )}
          </View>
          {s < 3 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
        </React.Fragment>
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Select Wallet & Amount</Text>
      <Text style={styles.stepDesc}>Choose which wallet to withdraw from</Text>

      {/* Wallet selector */}
      <View style={styles.walletSelector}>
        {mockWallets.map((wallet) => (
          <TouchableOpacity
            key={wallet.id}
            style={[
              styles.walletOption,
              selectedCurrency === wallet.currency && styles.walletOptionActive,
              selectedCurrency === wallet.currency && { borderColor: getCurrencyColor(wallet.currency) },
            ]}
            onPress={() => { setSelectedCurrency(wallet.currency); Haptics.selectionAsync(); }}
          >
            <View style={[styles.walletDot, { backgroundColor: getCurrencyColor(wallet.currency) }]} />
            <View>
              <Text style={styles.walletCurrency}>{wallet.currency}</Text>
              <Text style={styles.walletBal}>{formatCurrency(wallet.balance, wallet.currency)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Amount Input */}
      <Text style={styles.inputLabel}>Amount</Text>
      <View style={styles.amountInputRow}>
        <Text style={styles.amountPrefix}>
          {selectedCurrency === 'USD' ? '$' : selectedCurrency === 'GBP' ? '\u00a3' : '\u20ac'}
        </Text>
        <TextInput
          style={styles.amountInput}
          placeholder="0.00"
          placeholderTextColor="rgba(255,255,255,0.2)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
      </View>
      {selectedWallet && (
        <Text style={styles.availableText}>
          Available: {formatCurrency(selectedWallet.available_balance, selectedCurrency)}
        </Text>
      )}

      {/* Fee Preview */}
      {numericAmount > 0 && (
        <View style={styles.feePreview}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Amount</Text>
            <Text style={styles.feeValue}>{formatCurrency(numericAmount, selectedCurrency)}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Fee ({WITHDRAWAL_FEE_PERCENT}%)</Text>
            <Text style={styles.feeValue}>-{formatCurrency(fee, selectedCurrency)}</Text>
          </View>
          <View style={styles.feeDivider} />
          <View style={styles.feeRow}>
            <Text style={styles.feeLabelBold}>You receive (est.)</Text>
            <Text style={styles.feeValueBold}>~{usdtAmount.toFixed(2)} USDT</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.nextButton, !canProceedStep1 && styles.nextButtonDisabled]}
        disabled={!canProceedStep1}
        onPress={() => setStep(2)}
      >
        <Text style={styles.nextButtonText}>Continue</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Withdrawal Details</Text>
      <Text style={styles.stepDesc}>Select network and enter your USDT wallet address</Text>

      {/* Network Selector */}
      <Text style={styles.inputLabel}>Network</Text>
      <View style={styles.networkSelector}>
        {networks.map((n) => (
          <TouchableOpacity
            key={n.key}
            style={[styles.networkOption, network === n.key && styles.networkOptionActive]}
            onPress={() => { setNetwork(n.key); Haptics.selectionAsync(); }}
          >
            <View style={styles.networkHeader}>
              <View style={[styles.radioOuter, network === n.key && styles.radioOuterActive]}>
                {network === n.key && <View style={styles.radioInner} />}
              </View>
              <Text style={[styles.networkLabel, network === n.key && styles.networkLabelActive]}>
                {n.label}
              </Text>
            </View>
            <Text style={styles.networkDesc}>{n.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Wallet Address */}
      <Text style={styles.inputLabel}>USDT Wallet Address</Text>
      <View style={styles.addressInputWrapper}>
        <TextInput
          style={styles.addressInput}
          placeholder="Enter your USDT wallet address"
          placeholderTextColor="rgba(255,255,255,0.2)"
          value={walletAddress}
          onChangeText={setWalletAddress}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.warningCard}>
        <Ionicons name="warning-outline" size={18} color="#f59e0b" />
        <Text style={styles.warningText}>
          Please double-check the wallet address and network. Sending to the wrong address or network will result in permanent loss of funds.
        </Text>
      </View>

      <View style={styles.stepButtons}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, styles.nextButtonFlex, !canProceedStep2 && styles.nextButtonDisabled]}
          disabled={!canProceedStep2}
          onPress={() => setStep(3)}
        >
          <Text style={styles.nextButtonText}>Review</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Review & Confirm</Text>
      <Text style={styles.stepDesc}>Please review your withdrawal details</Text>

      <View style={styles.reviewCard}>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>From</Text>
          <Text style={styles.reviewValue}>{selectedCurrency} Wallet</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Amount</Text>
          <Text style={styles.reviewValue}>{formatCurrency(numericAmount, selectedCurrency)}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Fee ({WITHDRAWAL_FEE_PERCENT}%)</Text>
          <Text style={styles.reviewValue}>{formatCurrency(fee, selectedCurrency)}</Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabelBold}>You receive</Text>
          <Text style={styles.reviewValueBold}>~{usdtAmount.toFixed(2)} USDT</Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Network</Text>
          <Text style={styles.reviewValue}>{network}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Wallet</Text>
          <Text style={styles.reviewValueMono}>{truncateAddress(walletAddress)}</Text>
        </View>
      </View>

      <View style={styles.stepButtons}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(2)}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmButton, styles.nextButtonFlex]}
          onPress={handleConfirm}
        >
          <Ionicons name="shield-checkmark" size={18} color="#fff" />
          <Text style={styles.nextButtonText}>Confirm Withdrawal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Withdraw to USDT</Text>
          </View>

          {renderStepIndicator()}

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628' },
  scrollContent: { paddingBottom: 32 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, marginBottom: 28,
  },
  stepCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepCircleActive: { backgroundColor: '#00C853', borderColor: '#00C853' },
  stepNumber: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.3)' },
  stepNumberActive: { color: '#fff' },
  stepLine: {
    flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 8,
  },
  stepLineActive: { backgroundColor: '#00C853' },
  stepContent: { paddingHorizontal: 20 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 6 },
  stepDesc: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 20 },
  walletSelector: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  walletOption: {
    flex: 1, padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)', gap: 8,
  },
  walletOptionActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  walletDot: { width: 8, height: 8, borderRadius: 4 },
  walletCurrency: { fontSize: 14, fontWeight: '700', color: '#fff' },
  walletBal: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 10 },
  amountInputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16, height: 60,
  },
  amountPrefix: { fontSize: 24, fontWeight: '700', color: 'rgba(255,255,255,0.4)', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 24, fontWeight: '700', color: '#fff' },
  availableText: { fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 8, marginBottom: 20 },
  feePreview: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 24,
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  feeLabel: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
  feeValue: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  feeDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 8 },
  feeLabelBold: { fontSize: 15, fontWeight: '700', color: '#fff' },
  feeValueBold: { fontSize: 15, fontWeight: '700', color: '#00C853' },
  nextButton: {
    backgroundColor: '#00C853', borderRadius: 14, height: 54,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#00C853', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  nextButtonFlex: { flex: 1 },
  nextButtonDisabled: { opacity: 0.4, shadowOpacity: 0 },
  nextButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  networkSelector: { gap: 10, marginBottom: 24 },
  networkOption: {
    padding: 16, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)',
  },
  networkOptionActive: { borderColor: 'rgba(0,200,83,0.4)', backgroundColor: 'rgba(0,200,83,0.06)' },
  networkHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: '#00C853' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00C853' },
  networkLabel: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  networkLabelActive: { color: '#fff' },
  networkDesc: { fontSize: 13, color: 'rgba(255,255,255,0.35)', marginLeft: 30 },
  addressInputWrapper: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 16,
    height: 54, justifyContent: 'center', marginBottom: 16,
  },
  addressInput: { fontSize: 15, color: '#fff' },
  warningCard: {
    flexDirection: 'row', padding: 14, backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    marginBottom: 24,
  },
  warningText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 19 },
  stepButtons: { flexDirection: 'row', gap: 12 },
  backButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 20, height: 54, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  confirmButton: {
    backgroundColor: '#00C853', borderRadius: 14, height: 54,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#00C853', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 24,
  },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  reviewLabel: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
  reviewValue: { fontSize: 14, fontWeight: '600', color: '#fff' },
  reviewDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 6 },
  reviewLabelBold: { fontSize: 15, fontWeight: '700', color: '#fff' },
  reviewValueBold: { fontSize: 16, fontWeight: '800', color: '#00C853' },
  reviewValueMono: { fontSize: 13, fontWeight: '600', color: '#fff', fontFamily: 'monospace' },
});
