import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export const LoginUnlockScreen = ({
    baseUrl,
    email,
    loading,
    offlineAuthAvailable,
    offlineCashierLabel,
    hardwareMessage,
    onUnlock,
    onOfflineUnlock
}: {
    baseUrl: string;
    email: string;
    loading: boolean;
    offlineAuthAvailable: boolean;
    offlineCashierLabel: string;
    hardwareMessage: string;
    onUnlock: (input: {
        baseUrl: string;
        email: string;
        password: string;
        offlinePin?: string;
    }) => Promise<void>;
    onOfflineUnlock: (input: {
        email: string;
        offlinePin: string;
    }) => Promise<void>;
}) => {
    const [baseUrlValue, setBaseUrlValue] = useState(baseUrl || '');
    const [emailValue, setEmailValue] = useState(email || '');
    const [passwordValue, setPasswordValue] = useState('');
    const [offlinePinValue, setOfflinePinValue] = useState('');

    useEffect(() => {
        setBaseUrlValue(baseUrl || '');
    }, [baseUrl]);

    return (
        <View style={{ flex: 1, padding: 24, backgroundColor: '#FFFFFF', justifyContent: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: '#0F172A' }}>Cashier Login / Unlock</Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: '#475569' }}>
                Sign in with DGFY account credentials only. The app resolves the company internally and caches the last successful company on this device.
            </Text>
            <View style={{ marginTop: 16, backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE', padding: 12 }}>
                <Text style={{ color: '#1E3A8A' }}>{hardwareMessage}</Text>
            </View>
            <TextInput
                value={baseUrlValue}
                onChangeText={setBaseUrlValue}
                placeholder="Server base URL"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                    marginTop: 20,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    backgroundColor: '#F8FAFC'
                }}
            />
            <Text style={{ marginTop: 8, color: '#64748B' }}>
                Use a backend URL reachable by this device, for example `http://192.168.1.10:5000`.
            </Text>
            <View style={{ marginTop: 10, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F8FAFC' }}>
                <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>Server Mode</Text>
                <Text style={{ marginTop: 4, color: '#0F172A', fontWeight: '700' }}>
                    {String(baseUrlValue || '').includes('localhost') || String(baseUrlValue || '').includes('10.0.2.2')
                        ? 'DGFY Local Emulator'
                        : 'DGFY Device / Live'}
                </Text>
            </View>
            <TextInput
                value={emailValue}
                onChangeText={setEmailValue}
                placeholder="DGFY email"
                autoCapitalize="none"
                style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    paddingVertical: 12
                }}
            />
            <TextInput
                value={passwordValue}
                onChangeText={setPasswordValue}
                placeholder="DGFY password"
                secureTextEntry
                style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    paddingVertical: 12
                }}
            />
            <TextInput
                value={offlinePinValue}
                onChangeText={setOfflinePinValue}
                placeholder="Offline unlock PIN (min 4 chars)"
                secureTextEntry
                style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    paddingVertical: 12
                }}
            />
            <Text style={{ marginTop: 8, color: '#64748B' }}>
                If you enter a PIN during online login, this device can unlock the same cashier offline later.
            </Text>
            <Pressable
                disabled={loading}
                onPress={() => void onUnlock({
                    baseUrl: baseUrlValue,
                    email: emailValue,
                    password: passwordValue,
                    offlinePin: offlinePinValue
                })}
                style={{ marginTop: 16, backgroundColor: '#1D4ED8', borderRadius: 8, paddingVertical: 14, alignItems: 'center', opacity: loading ? 0.7 : 1 }}
            >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{loading ? 'Authenticating...' : 'Login with DGFY Account'}</Text>
            </Pressable>
            <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>Offline Unlock</Text>
                <Text style={{ marginTop: 6, color: '#475569' }}>
                    {offlineAuthAvailable
                        ? `Cached cashier: ${offlineCashierLabel}`
                        : 'No offline cashier is registered on this device yet.'}
                </Text>
                <Pressable
                    disabled={loading || !offlineAuthAvailable}
                    onPress={() => void onOfflineUnlock({
                        email: emailValue,
                        offlinePin: offlinePinValue
                    })}
                    style={{
                        marginTop: 12,
                        backgroundColor: offlineAuthAvailable ? '#0F766E' : '#94A3B8',
                        borderRadius: 8,
                        paddingVertical: 14,
                        alignItems: 'center',
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Unlock Offline</Text>
                </Pressable>
            </View>
        </View>
    );
};
