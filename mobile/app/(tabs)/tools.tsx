import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Modal, Share, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../lib/theme';
import { useUser } from '../../lib/userContext';

type ToolTab = 'invoices' | 'payment-links' | 'reminders';

interface Invoice {
  id: string;
  clientName: string;
  clientEmail: string;
  amount: string;
  currency: string;
  description: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
}

export default function ToolsScreen() {
  const { colors } = useTheme();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<ToolTab>('invoices');
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showCreateLink, setShowCreateLink] = useState(false);
  const [showCreateReminder, setShowCreateReminder] = useState(false);

  // Invoice form
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDesc, setInvoiceDesc] = useState('');
  const [invoiceCurrency, setInvoiceCurrency] = useState('USD');

  // Payment link form
  const [linkTitle, setLinkTitle] = useState('');
  const [linkAmount, setLinkAmount] = useState('');
  const [linkCurrency, setLinkCurrency] = useState('USD');

  // Reminder form
  const [reminderClient, setReminderClient] = useState('');
  const [reminderEmail, setReminderEmail] = useState('');
  const [reminderAmount, setReminderAmount] = useState('');
  const [autoRemind, setAutoRemind] = useState(true);

  // Sample data
  const [invoices] = useState<Invoice[]>([
    { id: 'INV-001', clientName: 'Acme Corp', clientEmail: 'billing@acme.com', amount: '2500', currency: 'USD', description: 'Web Design Project', dueDate: '2026-03-20', status: 'sent' },
    { id: 'INV-002', clientName: 'TechStart Ltd', clientEmail: 'pay@techstart.com', amount: '1800', currency: 'GBP', description: 'API Development', dueDate: '2026-03-15', status: 'paid' },
    { id: 'INV-003', clientName: 'Berlin Digital', clientEmail: 'finance@berlin.de', amount: '3200', currency: 'EUR', description: 'Mobile App Design', dueDate: '2026-03-25', status: 'draft' },
  ]);

  const [paymentLinks] = useState([
    { id: 'PL-001', title: 'Logo Design Service', amount: '500', currency: 'USD', url: 'https://pay.frenzpay.co/l/abc123', views: 12, paid: 3 },
    { id: 'PL-002', title: 'Consultation Fee', amount: '150', currency: 'USD', url: 'https://pay.frenzpay.co/l/def456', views: 8, paid: 5 },
  ]);

  const [reminders] = useState([
    { id: 'REM-001', client: 'Acme Corp', email: 'billing@acme.com', amount: '2500', currency: 'USD', lastSent: '2026-03-12', nextSend: '2026-03-17', auto: true },
    { id: 'REM-002', client: 'StartupXYZ', email: 'pay@startup.xyz', amount: '800', currency: 'USD', lastSent: '2026-03-10', nextSend: '2026-03-15', auto: false },
  ]);

  const tabs: { key: ToolTab; label: string; icon: string }[] = [
    { key: 'invoices', label: 'Invoices', icon: 'document-text' },
    { key: 'payment-links', label: 'Pay Links', icon: 'link' },
    { key: 'reminders', label: 'Reminders', icon: 'alarm' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#00C853';
      case 'sent': return '#1a73e8';
      case 'draft': return colors.textMuted;
      case 'overdue': return '#ef4444';
      default: return colors.textMuted;
    }
  };

  const getCurrencySymbol = (c: string) => c === 'USD' ? '$' : c === 'GBP' ? '£' : '€';

  const handleCreateInvoice = () => {
    if (!clientName || !invoiceAmount) {
      Alert.alert('Error', 'Please fill in client name and amount');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Invoice Created', `Invoice for ${getCurrencySymbol(invoiceCurrency)}${invoiceAmount} sent to ${clientName}`);
    setShowCreateInvoice(false);
    setClientName(''); setClientEmail(''); setInvoiceAmount(''); setInvoiceDesc('');
  };

  const handleCreateLink = () => {
    if (!linkTitle || !linkAmount) {
      Alert.alert('Error', 'Please fill in title and amount');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const url = `https://pay.frenzpay.co/l/${Date.now().toString(36)}`;
    Alert.alert('Payment Link Created', url, [
      { text: 'Copy Link', onPress: () => Clipboard.setStringAsync(url) },
      { text: 'Share', onPress: () => Share.share({ message: `Pay ${getCurrencySymbol(linkCurrency)}${linkAmount} for ${linkTitle}: ${url}` }) },
    ]);
    setShowCreateLink(false);
    setLinkTitle(''); setLinkAmount('');
  };

  const handleCreateReminder = () => {
    if (!reminderClient || !reminderAmount) {
      Alert.alert('Error', 'Please fill in client and amount');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Reminder Set', `Payment reminder for ${getCurrencySymbol('USD')}${reminderAmount} will be sent to ${reminderClient}`);
    setShowCreateReminder(false);
    setReminderClient(''); setReminderEmail(''); setReminderAmount('');
  };

  const handleShareLink = async (url: string, title: string) => {
    await Share.share({ message: `Pay via Frenz Pay: ${url}`, title });
  };

  const handleCopyLink = async (url: string) => {
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Payment link copied to clipboard');
  };

  const s = getStyles(colors);

  const renderFormModal = (
    visible: boolean, onClose: () => void, title: string, onSubmit: () => void, submitLabel: string,
    children: React.ReactNode
  ) => (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.modalOverlay}>
        <View style={[s.modalContent, { backgroundColor: colors.background }]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
          <TouchableOpacity style={s.submitButton} onPress={onSubmit}>
            <Text style={s.submitButtonText}>{submitLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderInput = (label: string, value: string, onChangeText: (t: string) => void, placeholder: string, keyboardType: any = 'default') => (
    <View style={s.formGroup}>
      <Text style={[s.formLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[s.formInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
      />
    </View>
  );

  const renderCurrencyPicker = (selected: string, onSelect: (c: string) => void) => (
    <View style={s.formGroup}>
      <Text style={[s.formLabel, { color: colors.textSecondary }]}>Currency</Text>
      <View style={s.currencyRow}>
        {['USD', 'GBP', 'EUR'].map(c => (
          <TouchableOpacity
            key={c}
            style={[s.currencyOption, selected === c && s.currencyOptionActive, { borderColor: selected === c ? '#00C853' : colors.cardBorder }]}
            onPress={() => onSelect(c)}
          >
            <Text style={[s.currencyOptionText, { color: selected === c ? '#00C853' : colors.textSecondary }]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        <View style={s.header}>
          <Text style={[s.title, { color: colors.text }]}>Freelancer Tools</Text>
          <Text style={[s.subtitle, { color: colors.textSecondary }]}>Manage invoices, payment links & reminders</Text>
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          {tabs.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[s.tab, activeTab === t.key && s.tabActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <Ionicons name={t.icon as any} size={16} color={activeTab === t.key ? '#00C853' : colors.textMuted} />
              <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <>
            <TouchableOpacity style={s.createButton} onPress={() => setShowCreateInvoice(true)}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={s.createButtonText}>Create Invoice</Text>
            </TouchableOpacity>
            {invoices.map(inv => (
              <View key={inv.id} style={[s.itemCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <View style={s.itemRow}>
                  <View style={s.itemLeft}>
                    <Text style={[s.itemId, { color: colors.textMuted }]}>{inv.id}</Text>
                    <Text style={[s.itemTitle, { color: colors.text }]}>{inv.clientName}</Text>
                    <Text style={[s.itemDesc, { color: colors.textSecondary }]}>{inv.description}</Text>
                  </View>
                  <View style={s.itemRight}>
                    <Text style={[s.itemAmount, { color: colors.text }]}>{getCurrencySymbol(inv.currency)}{inv.amount}</Text>
                    <View style={[s.statusBadge, { backgroundColor: `${getStatusColor(inv.status)}15` }]}>
                      <Text style={[s.statusText, { color: getStatusColor(inv.status) }]}>{inv.status}</Text>
                    </View>
                  </View>
                </View>
                <View style={[s.itemFooter, { borderTopColor: colors.divider }]}>
                  <Text style={[s.itemDate, { color: colors.textMuted }]}>Due: {inv.dueDate}</Text>
                  <View style={s.itemActions}>
                    <TouchableOpacity style={s.itemActionBtn} onPress={() => Share.share({ message: `Invoice ${inv.id}: ${getCurrencySymbol(inv.currency)}${inv.amount} for ${inv.description}` })}>
                      <Ionicons name="share-outline" size={16} color="#00C853" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.itemActionBtn} onPress={() => Alert.alert('Resend', `Resend invoice to ${inv.clientEmail}?`)}>
                      <Ionicons name="send-outline" size={16} color="#1a73e8" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Payment Links Tab */}
        {activeTab === 'payment-links' && (
          <>
            <TouchableOpacity style={s.createButton} onPress={() => setShowCreateLink(true)}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={s.createButtonText}>Create Payment Link</Text>
            </TouchableOpacity>
            {paymentLinks.map(link => (
              <View key={link.id} style={[s.itemCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <View style={s.itemRow}>
                  <View style={s.itemLeft}>
                    <Text style={[s.itemTitle, { color: colors.text }]}>{link.title}</Text>
                    <Text style={[s.itemDesc, { color: colors.textMuted }]} numberOfLines={1}>{link.url}</Text>
                  </View>
                  <Text style={[s.itemAmount, { color: colors.text }]}>${link.amount}</Text>
                </View>
                <View style={[s.statsRow, { borderTopColor: colors.divider }]}>
                  <View style={s.stat}>
                    <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
                    <Text style={[s.statText, { color: colors.textSecondary }]}>{link.views} views</Text>
                  </View>
                  <View style={s.stat}>
                    <Ionicons name="checkmark-circle-outline" size={14} color="#00C853" />
                    <Text style={[s.statText, { color: colors.textSecondary }]}>{link.paid} paid</Text>
                  </View>
                </View>
                <View style={s.linkActions}>
                  <TouchableOpacity style={[s.linkBtn, { backgroundColor: colors.accentBg }]} onPress={() => handleCopyLink(link.url)}>
                    <Ionicons name="copy-outline" size={14} color="#00C853" />
                    <Text style={s.linkBtnText}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.linkBtn, { backgroundColor: 'rgba(26,115,232,0.12)' }]} onPress={() => handleShareLink(link.url, link.title)}>
                    <Ionicons name="share-outline" size={14} color="#1a73e8" />
                    <Text style={[s.linkBtnText, { color: '#1a73e8' }]}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Reminders Tab */}
        {activeTab === 'reminders' && (
          <>
            <TouchableOpacity style={s.createButton} onPress={() => setShowCreateReminder(true)}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={s.createButtonText}>Create Reminder</Text>
            </TouchableOpacity>
            {reminders.map(rem => (
              <View key={rem.id} style={[s.itemCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <View style={s.itemRow}>
                  <View style={s.itemLeft}>
                    <Text style={[s.itemTitle, { color: colors.text }]}>{rem.client}</Text>
                    <Text style={[s.itemDesc, { color: colors.textMuted }]}>{rem.email}</Text>
                  </View>
                  <View style={s.itemRight}>
                    <Text style={[s.itemAmount, { color: colors.text }]}>${rem.amount}</Text>
                    <View style={[s.statusBadge, { backgroundColor: rem.auto ? 'rgba(0,200,83,0.12)' : 'rgba(245,158,11,0.12)' }]}>
                      <Text style={[s.statusText, { color: rem.auto ? '#00C853' : '#f59e0b' }]}>{rem.auto ? 'Auto' : 'Manual'}</Text>
                    </View>
                  </View>
                </View>
                <View style={[s.itemFooter, { borderTopColor: colors.divider }]}>
                  <Text style={[s.itemDate, { color: colors.textMuted }]}>Next: {rem.nextSend}</Text>
                  <TouchableOpacity style={s.itemActionBtn} onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Sent', `Payment reminder sent to ${rem.email}`);
                  }}>
                    <Ionicons name="send" size={16} color="#00C853" />
                    <Text style={{ color: '#00C853', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Send Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Create Invoice Modal */}
      {renderFormModal(showCreateInvoice, () => setShowCreateInvoice(false), 'Create Invoice', handleCreateInvoice, 'Send Invoice',
        <>
          {renderInput('Client Name', clientName, setClientName, 'e.g. Acme Corp')}
          {renderInput('Client Email', clientEmail, setClientEmail, 'billing@client.com', 'email-address')}
          {renderCurrencyPicker(invoiceCurrency, setInvoiceCurrency)}
          {renderInput('Amount', invoiceAmount, setInvoiceAmount, '0.00', 'decimal-pad')}
          {renderInput('Description', invoiceDesc, setInvoiceDesc, 'Web design project')}
        </>
      )}

      {/* Create Payment Link Modal */}
      {renderFormModal(showCreateLink, () => setShowCreateLink(false), 'Create Payment Link', handleCreateLink, 'Generate Link',
        <>
          {renderInput('Title', linkTitle, setLinkTitle, 'e.g. Logo Design Service')}
          {renderCurrencyPicker(linkCurrency, setLinkCurrency)}
          {renderInput('Amount', linkAmount, setLinkAmount, '0.00', 'decimal-pad')}
        </>
      )}

      {/* Create Reminder Modal */}
      {renderFormModal(showCreateReminder, () => setShowCreateReminder(false), 'Create Reminder', handleCreateReminder, 'Set Reminder',
        <>
          {renderInput('Client Name', reminderClient, setReminderClient, 'e.g. Acme Corp')}
          {renderInput('Client Email', reminderEmail, setReminderEmail, 'billing@client.com', 'email-address')}
          {renderInput('Amount Owed', reminderAmount, setReminderAmount, '0.00', 'decimal-pad')}
          <View style={[s.formGroup, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <Text style={[s.formLabel, { color: colors.textSecondary, marginBottom: 0 }]}>Auto-remind every 5 days</Text>
            <Switch value={autoRemind} onValueChange={setAutoRemind} trackColor={{ false: colors.inputBg, true: 'rgba(0,200,83,0.4)' }} thumbColor={autoRemind ? '#00C853' : '#666'} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 14 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  tabActive: { backgroundColor: 'rgba(0,200,83,0.1)', borderColor: 'rgba(0,200,83,0.3)' },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#00C853' },
  createButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 16, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#00C853',
  },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  itemCard: {
    marginHorizontal: 20, marginBottom: 12, borderRadius: 16, padding: 16,
    borderWidth: 1,
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemLeft: { flex: 1, marginRight: 12 },
  itemRight: { alignItems: 'flex-end', gap: 6 },
  itemId: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  itemTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  itemDesc: { fontSize: 13 },
  itemAmount: { fontSize: 18, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  itemFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12, paddingTop: 12, borderTopWidth: 1,
  },
  itemDate: { fontSize: 12 },
  itemActions: { flexDirection: 'row', gap: 10 },
  itemActionBtn: { flexDirection: 'row', alignItems: 'center', padding: 6 },
  statsRow: {
    flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12 },
  linkActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  linkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10,
  },
  linkBtnText: { fontSize: 13, fontWeight: '600', color: '#00C853' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  formInput: {
    height: 50, borderRadius: 12, paddingHorizontal: 14, fontSize: 15,
    borderWidth: 1,
  },
  currencyRow: { flexDirection: 'row', gap: 10 },
  currencyOption: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center',
  },
  currencyOptionActive: { backgroundColor: 'rgba(0,200,83,0.08)' },
  currencyOptionText: { fontSize: 14, fontWeight: '700' },
  submitButton: {
    backgroundColor: '#00C853', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 12,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
