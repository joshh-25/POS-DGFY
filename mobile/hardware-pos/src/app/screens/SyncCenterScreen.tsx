import React from 'react';
import { Pressable, View } from 'react-native';
import type { PendingHistorySnapshot } from '../../services/pendingHistoryService';
import { PosHeader } from '../components/PosHeader';
import { PosText as Text } from '../components/PosTextScale';

export const SyncCenterScreen = ({
    snapshot,
    syncStatusLabel,
    lastSyncMessage,
    syncBusy,
    connectivityMode,
    hardwareMessage,
    hardwareDiagnostics,
    onRunSync,
    onLoadDiagnostics,
    onBack
}: {
    snapshot: PendingHistorySnapshot | null;
    syncStatusLabel: string;
    lastSyncMessage: string;
    syncBusy: boolean;
    connectivityMode: 'offline_local' | 'online_live' | 'syncing' | 'degraded';
    hardwareMessage: string;
    hardwareDiagnostics: Record<string, unknown> | null;
    onRunSync: () => void;
    onLoadDiagnostics: () => void;
    onBack: () => void;
}) => (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 24 }}>
        <PosHeader
            title="Sync Center"
            subtitle={lastSyncMessage}
            statusPills={[
                { label: `Daily allowance ${syncStatusLabel}`, tone: syncStatusLabel === '2/2' ? 'warning' : 'success' },
                { label: `Pending ${snapshot?.counts.pending ?? 0}` },
                { label: `Conflict ${snapshot?.counts.conflict ?? 0}`, tone: (snapshot?.counts.conflict ?? 0) > 0 ? 'warning' : 'default' },
                {
                    label: connectivityMode === 'online_live'
                        ? 'Live backend'
                        : connectivityMode === 'syncing'
                            ? 'Syncing'
                            : connectivityMode === 'degraded'
                                ? 'Cached offline'
                                : 'Offline local',
                    tone: connectivityMode === 'online_live' ? 'success' : 'warning'
                }
            ]}
        />
        <View style={{ marginTop: 16, backgroundColor: '#EFF6FF', borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE', padding: 14 }}>
            <Text style={{ color: '#1E3A8A', fontWeight: '600' }}>{hardwareMessage}</Text>
            {snapshot?.lastSyncRun ? (
                <Text style={{ marginTop: 8, color: '#1E3A8A' }}>
                    Last run: {snapshot.lastSyncRun.outcome} | started {snapshot.lastSyncRun.startedAt}
                </Text>
            ) : null}
            {hardwareDiagnostics ? (
                <Text style={{ marginTop: 8, color: '#1E3A8A' }}>
                    Printer connected: {String(hardwareDiagnostics.printerServiceConnected ?? 'n/a')} | Last connection: {String(hardwareDiagnostics.lastConnectionEvent ?? 'n/a')}
                </Text>
            ) : null}
        </View>
        <Pressable onPress={onRunSync} style={{ marginTop: 20, backgroundColor: '#1D4ED8', borderRadius: 8, paddingVertical: 14, alignItems: 'center', opacity: syncBusy ? 0.7 : 1 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{syncBusy ? 'Syncing...' : 'Run Manual Sync'}</Text>
        </Pressable>
        <Pressable onPress={onLoadDiagnostics} style={{ marginTop: 12, backgroundColor: '#0F766E', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Load Hardware Diagnostics</Text>
        </Pressable>
        <Pressable onPress={onBack} style={{ marginTop: 12, backgroundColor: '#E2E8F0', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: '#0F172A', fontWeight: '700' }}>Back to Sell Screen</Text>
        </Pressable>
    </View>
);
