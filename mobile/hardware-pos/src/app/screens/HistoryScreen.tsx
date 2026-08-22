import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { PendingHistorySnapshot } from '../../services/pendingHistoryService';
import { PosHeader } from '../components/PosHeader';
import { PosText as Text } from '../components/PosTextScale';

export const HistoryScreen = ({
    snapshot,
    onBack,
    onOpenSyncCenter
}: {
    snapshot: PendingHistorySnapshot | null;
    onBack: () => void;
    onOpenSyncCenter: () => void;
}) => (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 24 }}>
        <PosHeader
            title="Transaction History"
            subtitle="Pending local transactions never appear as fully authoritative synced receipts."
            statusPills={[
                { label: `Pending ${snapshot?.counts.pending ?? 0}`, tone: (snapshot?.counts.pending ?? 0) > 0 ? 'warning' : 'default' },
                { label: `Synced ${snapshot?.counts.synced ?? 0}`, tone: 'success' },
                { label: `Conflict ${snapshot?.counts.conflict ?? 0}`, tone: (snapshot?.counts.conflict ?? 0) > 0 ? 'warning' : 'default' }
            ]}
        />
        <ScrollView contentContainerStyle={{ paddingTop: 20 }}>
            {snapshot?.rows.map((row) => (
                <View key={row.localTransactionId} style={{ backgroundColor: '#FFFFFF', borderRadius: 8, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <Text style={{ fontWeight: '700', color: '#0F172A' }}>{row.localTransactionId}</Text>
                    <Text style={{ marginTop: 4, color: '#475569' }}>{row.statusLabel}</Text>
                    <Text style={{ marginTop: 4, color: row.authoritative ? '#0F766E' : '#B45309' }}>
                        {row.authoritative ? 'Authoritative synced receipt' : 'Pending/local receipt state'}
                    </Text>
                </View>
            ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={onBack} style={{ flex: 1, backgroundColor: '#E2E8F0', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: '#0F172A', fontWeight: '700' }}>Back</Text>
            </Pressable>
            <Pressable onPress={onOpenSyncCenter} style={{ flex: 1, backgroundColor: '#1D4ED8', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Open Sync Center</Text>
            </Pressable>
        </View>
    </View>
);
