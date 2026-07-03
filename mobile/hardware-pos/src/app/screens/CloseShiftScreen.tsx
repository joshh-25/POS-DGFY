import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { PosHeader } from '../components/PosHeader';

export const CloseShiftScreen = ({
    shiftId,
    syncStatusLabel,
    hardwareMessage,
    onConfirmClose,
    onCancel
}: {
    shiftId: string | null;
    syncStatusLabel: string;
    hardwareMessage: string;
    onConfirmClose: () => void;
    onCancel: () => void;
}) => (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <PosHeader
            title="Close Shift"
            subtitle="Closeout happens locally first so the cashier can end the shift even if connectivity is unstable."
            statusPills={[
                { label: shiftId ? `Active Shift ${shiftId}` : 'No Active Shift', tone: shiftId ? 'success' : 'warning' },
                { label: `Daily Sync ${syncStatusLabel}`, tone: syncStatusLabel === '2/2' ? 'warning' : 'default' }
            ]}
        />
        <View style={{ padding: 20 }}>
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 16 }}>
                <Text style={{ color: '#92400E', fontWeight: '700' }}>Close this shift now?</Text>
                <Text style={{ color: '#92400E', marginTop: 6 }}>
                    The app will lock the cashier session and keep the shift closeout on-device. Sync can follow later without blocking the end-of-shift flow.
                </Text>
            </View>
            <View style={{ marginTop: 16, backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', padding: 14 }}>
                <Text style={{ color: '#1E3A8A', fontWeight: '600' }}>{hardwareMessage}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: '#E2E8F0', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                    <Text style={{ color: '#0F172A', fontWeight: '700' }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={onConfirmClose} style={{ flex: 1, backgroundColor: '#1D4ED8', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Close Shift</Text>
                </Pressable>
            </View>
        </View>
    </View>
);
