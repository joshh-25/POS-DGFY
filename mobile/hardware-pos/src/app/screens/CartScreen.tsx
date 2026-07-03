import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { PosHeader } from '../components/PosHeader';

export const CartScreen = ({
    cart,
    onBack,
    onCheckout
}: {
    cart: Array<{ name: string; quantity: number; price: number }>;
    onBack: () => void;
    onCheckout: () => void;
}) => {
    const total = cart.reduce((sum, line) => sum + (line.price * line.quantity), 0);

    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 24 }}>
            <PosHeader
                title="Checkout"
                subtitle="Review cart, VAT, and total before checkout."
                statusPills={[
                    { label: `${cart.length} item${cart.length === 1 ? '' : 's'} in this sale` }
                ]}
            />
            {cart.map((line) => (
                <View key={line.name} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
                    <Text style={{ fontWeight: '700', color: '#0F172A' }}>{line.name}</Text>
                    <Text style={{ marginTop: 4, color: '#475569' }}>{line.quantity} x PHP {line.price.toFixed(2)}</Text>
                </View>
            ))}
            <Text style={{ marginTop: 20, fontSize: 18, fontWeight: '700', color: '#0F766E' }}>Total: PHP {total.toFixed(2)}</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                <Pressable onPress={onBack} style={{ flex: 1, backgroundColor: '#E2E8F0', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                    <Text style={{ color: '#0F172A', fontWeight: '700' }}>Back</Text>
                </Pressable>
                <Pressable onPress={onCheckout} style={{ flex: 1, backgroundColor: '#1D4ED8', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Confirm</Text>
                </Pressable>
            </View>
        </View>
    );
};
