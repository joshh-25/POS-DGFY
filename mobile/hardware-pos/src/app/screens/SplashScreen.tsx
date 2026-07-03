import React from 'react';
import { Text, View } from 'react-native';

export const SplashScreen = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: '#0F172A' }}>DGFY Hardware POS</Text>
        <Text style={{ marginTop: 12, fontSize: 14, color: '#475569' }}>Loading local device profile, cashier session, and hardware readiness.</Text>
    </View>
);
