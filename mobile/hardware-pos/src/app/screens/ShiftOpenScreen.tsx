import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { PosHeader } from '../components/PosHeader';

export const ShiftOpenScreen = ({
    cashierName,
    connectivityMode,
    storageMode,
    hardwareMessage,
    onOpenShift
}: {
    cashierName: string;
    connectivityMode: 'offline_local' | 'online_live' | 'syncing' | 'degraded';
    storageMode: 'memory' | 'sqlite';
    hardwareMessage: string;
    onOpenShift: (openingCash: number) => void | Promise<void>;
}) => {
    const [openingCash, setOpeningCash] = useState('0');
    const modeLabel = useMemo(() => {
        if (connectivityMode === 'online_live') return 'Live backend available';
        if (connectivityMode === 'syncing') return 'Sync in progress';
        if (connectivityMode === 'degraded') return 'Using cached offline data';
        return 'Offline local mode';
    }, [connectivityMode]);

    return (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            <PosHeader
                title="Open Shift"
                subtitle={`Cashier ${cashierName || 'Cashier'} must open a local shift before selling.`}
                statusPills={[
                    { label: modeLabel, tone: connectivityMode === 'online_live' ? 'success' : 'warning' },
                    { label: storageMode === 'sqlite' ? 'SQLite runtime' : 'Memory fallback', tone: storageMode === 'sqlite' ? 'success' : 'warning' }
                ]}
            />
            <View style={{ padding: 24 }}>
                <View style={{ backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', padding: 14 }}>
                    <Text style={{ color: '#1E3A8A', fontWeight: '600' }}>{hardwareMessage}</Text>
                    <Text style={{ marginTop: 6, color: '#1E3A8A' }}>
                        The shift is always recorded locally first. If the device is offline, the cashier flow still continues in this app.
                    </Text>
                </View>
                <Text style={{ marginTop: 20, fontSize: 15, fontWeight: '700', color: '#0F172A' }}>Opening Cash</Text>
                <TextInput
                    value={openingCash}
                    onChangeText={setOpeningCash}
                    keyboardType="numeric"
                    placeholder="Opening cash"
                    style={{
                        marginTop: 12,
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        backgroundColor: '#FFFFFF'
                    }}
                />
                <Text style={{ marginTop: 8, color: '#64748B' }}>
                    Use the same starting float the cashier has in the drawer. You can sync the day’s state later if the backend is unavailable now.
                </Text>
                <Pressable
                    onPress={() => onOpenShift(Number(openingCash || 0))}
                    style={{ marginTop: 20, backgroundColor: '#0F766E', borderRadius: 10, paddingVertical: 15, alignItems: 'center' }}
                >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Start Shift</Text>
                </Pressable>
            </View>
        </View>
    );
};
