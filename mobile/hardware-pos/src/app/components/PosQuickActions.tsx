import React from 'react';
import { Pressable, ScrollView } from 'react-native';
import { PosText as Text } from './PosTextScale';

export const PosQuickActions = ({
    onCheckout,
    onHistory,
    onReceipt,
    onShift,
    onCloseShift,
    onSyncCenter,
    onAccountManagement,
    onScan,
    onRefresh,
    onLock
}: {
    onCheckout: () => void;
    onHistory: () => void;
    onReceipt: () => void;
    onShift: () => void;
    onCloseShift: () => void;
    onSyncCenter: () => void;
    onAccountManagement: () => void;
    onScan: () => void;
    onRefresh: () => void;
    onLock: () => void;
}) => {
    const actions = [
        { label: 'Checkout', onPress: onCheckout },
        { label: 'Scan', onPress: onScan },
        { label: 'Refresh', onPress: onRefresh },
        { label: 'History', onPress: onHistory },
        { label: 'Receipt', onPress: onReceipt },
        { label: 'Shift', onPress: onShift },
        { label: 'Close Shift', onPress: onCloseShift },
        { label: 'Sync Center', onPress: onSyncCenter },
        { label: 'Accounts', onPress: onAccountManagement },
        { label: 'Lock', onPress: onLock }
    ];

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 10 }}
            style={{ backgroundColor: '#FFFFFF' }}
        >
            {actions.map((action) => (
                <Pressable
                    key={action.label}
                    onPress={action.onPress}
                    style={{
                        backgroundColor: '#F8FAFC',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 10
                    }}
                >
                    <Text style={{ color: '#0F172A', fontWeight: '700' }}>{action.label}</Text>
                </Pressable>
            ))}
        </ScrollView>
    );
};
