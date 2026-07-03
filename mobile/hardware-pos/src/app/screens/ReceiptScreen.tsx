import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PosHeader } from '../components/PosHeader';

export const ReceiptScreen = ({
    receipt,
    hardwareMessage,
    onBackToCheckout,
    onHistory,
    onPrint,
    onOpenDrawer
}: {
    receipt: {
        localTransactionId: string;
        cashierName: string;
        shiftId: string;
        createdAtLocal: string;
        total: number;
        paymentType: string;
        lines: Array<{ name: string; quantity: number; total: number }>;
        syncState: 'pending_sync' | 'synced';
    } | null;
    hardwareMessage: string;
    onBackToCheckout: () => void;
    onHistory: () => void;
    onPrint: () => void;
    onOpenDrawer: () => void;
}) => (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <PosHeader
            title="Receipt"
            subtitle="Receipt preview follows the web POS meaning: pending local receipts stay visibly pending until sync completes."
            statusPills={[
                { label: receipt?.syncState === 'synced' ? 'Synced Receipt' : 'Pending Sync', tone: receipt?.syncState === 'synced' ? 'success' : 'warning' },
                { label: receipt?.paymentType ? `Payment: ${receipt.paymentType}` : 'Payment: cash' }
            ]}
        />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
            <View style={{ backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', padding: 14, marginBottom: 16 }}>
                <Text style={{ color: '#1E3A8A', fontWeight: '600' }}>{hardwareMessage}</Text>
            </View>
            {receipt ? (
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 18 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>DGFY POS Receipt Preview</Text>
                    <Text style={{ marginTop: 6, color: '#475569' }}>Receipt ID: {receipt.localTransactionId}</Text>
                    <Text style={{ marginTop: 2, color: '#475569' }}>Cashier: {receipt.cashierName}</Text>
                    <Text style={{ marginTop: 2, color: '#475569' }}>Shift: {receipt.shiftId}</Text>
                    <Text style={{ marginTop: 2, color: '#475569' }}>Datetime: {receipt.createdAtLocal}</Text>
                    <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12 }}>
                        {receipt.lines.map((line) => (
                            <View key={`${line.name}-${line.quantity}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                                <View style={{ flex: 1, paddingRight: 12 }}>
                                    <Text style={{ color: '#0F172A', fontWeight: '700' }}>{line.name}</Text>
                                    <Text style={{ color: '#64748B', marginTop: 2 }}>{line.quantity} x item</Text>
                                </View>
                                <Text style={{ color: '#0F172A', fontWeight: '700' }}>PHP {line.total.toFixed(2)}</Text>
                            </View>
                        ))}
                    </View>
                    <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>Total Due</Text>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1D4ED8' }}>PHP {receipt.total.toFixed(2)}</Text>
                        </View>
                    </View>
                </View>
            ) : (
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 18 }}>
                    <Text style={{ color: '#475569' }}>No receipt available yet.</Text>
                </View>
            )}
        </ScrollView>
        <View style={{ padding: 20, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={onBackToCheckout} style={{ flex: 1, backgroundColor: '#E2E8F0', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: '#0F172A', fontWeight: '700' }}>Back to Checkout</Text>
            </Pressable>
            <Pressable onPress={onHistory} style={{ flex: 1, backgroundColor: '#1D4ED8', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Open History</Text>
            </Pressable>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={onPrint} style={{ flex: 1, backgroundColor: '#0F766E', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Print Receipt</Text>
            </Pressable>
            <Pressable onPress={onOpenDrawer} style={{ flex: 1, backgroundColor: '#7C3AED', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Open Drawer</Text>
            </Pressable>
        </View>
    </View>
);
