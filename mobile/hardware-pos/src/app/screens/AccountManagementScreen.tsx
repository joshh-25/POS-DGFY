import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PosHeader } from '../components/PosHeader';

interface ManagedAccountRecord {
    cashierId: number;
    displayName: string;
    roleCode: string;
    cachedAt: string;
    isOfflineEnabled: boolean;
    isActiveSession: boolean;
}

interface AccountManagementSnapshot {
    cachedAccounts: ManagedAccountRecord[];
    offlineProfile: {
        cashierName: string;
        email: string;
        companyName: string;
        authorizedAt: string;
    } | null;
}

export const AccountManagementScreen = ({
    baseUrl,
    loading,
    currentRoleCode,
    adminAccessGranted,
    snapshot,
    hardwareMessage,
    onVerifyAdmin,
    onRefresh,
    onRemoveCashier,
    onClearOfflineAccess,
    onBack
}: {
    baseUrl: string;
    loading: boolean;
    currentRoleCode: string;
    adminAccessGranted: boolean;
    snapshot: AccountManagementSnapshot | null;
    hardwareMessage: string;
    onVerifyAdmin: (input: { baseUrl: string; email: string; password: string }) => Promise<void>;
    onRefresh: () => Promise<void>;
    onRemoveCashier: (cashierId: number) => Promise<void>;
    onClearOfflineAccess: () => Promise<void>;
    onBack: () => void;
}) => {
    const [emailValue, setEmailValue] = useState('');
    const [passwordValue, setPasswordValue] = useState('');

    return (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            <PosHeader
                title="Account Management"
                subtitle="Only a verified DGFY admin can manage local cashier accounts and offline unlock on this device."
                statusPills={[
                    { label: adminAccessGranted ? 'Admin Verified' : 'Admin Locked', tone: adminAccessGranted ? 'success' : 'warning' },
                    { label: currentRoleCode ? `Cashier role ${currentRoleCode}` : 'No cashier role', tone: currentRoleCode ? 'default' : 'warning' }
                ]}
            />
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
                <View style={{ backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', padding: 14 }}>
                    <Text style={{ color: '#1E3A8A', fontWeight: '600' }}>{hardwareMessage}</Text>
                    <Text style={{ marginTop: 6, color: '#1E3A8A' }}>
                        Admin verification is online-only. After entry, the device account list stays inside the POS app.
                    </Text>
                </View>

                {!adminAccessGranted ? (
                    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 16 }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>Admin Verification</Text>
                        <View style={{ marginTop: 16, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F8FAFC' }}>
                            <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>Server</Text>
                            <Text style={{ marginTop: 4, color: '#0F172A', fontWeight: '700' }}>
                                {String(baseUrl || '').includes('localhost') || String(baseUrl || '').includes('10.0.2.2')
                                    ? 'DGFY Local'
                                    : 'DGFY Live'}
                            </Text>
                        </View>
                        <TextInput
                            value={emailValue}
                            onChangeText={setEmailValue}
                            placeholder="Admin DGFY email"
                            autoCapitalize="none"
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
                        <TextInput
                            value={passwordValue}
                            onChangeText={setPasswordValue}
                            placeholder="Admin DGFY password"
                            secureTextEntry
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
                        <Pressable
                            disabled={loading}
                            onPress={() => void onVerifyAdmin({
                                baseUrl,
                                email: emailValue,
                                password: passwordValue
                            })}
                            style={{
                                marginTop: 16,
                                backgroundColor: '#0F766E',
                                borderRadius: 10,
                                paddingVertical: 14,
                                alignItems: 'center',
                                opacity: loading ? 0.7 : 1
                            }}
                        >
                            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{loading ? 'Verifying...' : 'Verify Admin'}</Text>
                        </Pressable>
                    </View>
                ) : null}

                {adminAccessGranted ? (
                    <>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <Pressable
                                onPress={() => void onRefresh()}
                                style={{ flex: 1, backgroundColor: '#1D4ED8', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
                            >
                                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Refresh Accounts</Text>
                            </Pressable>
                            <Pressable
                                onPress={() => void onClearOfflineAccess()}
                                style={{ flex: 1, backgroundColor: '#B45309', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
                            >
                                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Clear Offline Unlock</Text>
                            </Pressable>
                        </View>

                        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 16 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>Offline Unlock</Text>
                            <Text style={{ marginTop: 8, color: '#475569' }}>
                                {snapshot?.offlineProfile
                                    ? `${snapshot.offlineProfile.cashierName} (${snapshot.offlineProfile.email}) | ${snapshot.offlineProfile.companyName}`
                                    : 'No offline cashier is currently registered on this device.'}
                            </Text>
                            {snapshot?.offlineProfile ? (
                                <Text style={{ marginTop: 4, color: '#64748B' }}>
                                    Authorized at {snapshot.offlineProfile.authorizedAt}
                                </Text>
                            ) : null}
                        </View>

                        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 16 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>Cached Cashier Profiles</Text>
                            {snapshot?.cachedAccounts?.length ? snapshot.cachedAccounts.map((account) => (
                                <View
                                    key={account.cashierId}
                                    style={{
                                        marginTop: 14,
                                        borderWidth: 1,
                                        borderColor: '#E2E8F0',
                                        borderRadius: 10,
                                        padding: 14
                                    }}
                                >
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>{account.displayName}</Text>
                                    <Text style={{ marginTop: 4, color: '#475569' }}>
                                        Role: {account.roleCode} | Cached at {account.cachedAt}
                                    </Text>
                                    <Text style={{ marginTop: 4, color: '#64748B' }}>
                                        {account.isActiveSession
                                            ? 'Currently active on this device.'
                                            : account.isOfflineEnabled
                                                ? 'Offline unlock enabled for this cashier.'
                                                : 'Cached for local session history only.'}
                                    </Text>
                                    <Pressable
                                        disabled={account.isActiveSession}
                                        onPress={() => void onRemoveCashier(account.cashierId)}
                                        style={{
                                            marginTop: 12,
                                            backgroundColor: account.isActiveSession ? '#94A3B8' : '#B91C1C',
                                            borderRadius: 8,
                                            paddingVertical: 12,
                                            alignItems: 'center'
                                        }}
                                    >
                                        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                                            {account.isActiveSession ? 'Active Cashier Locked' : 'Remove Cached Cashier'}
                                        </Text>
                                    </Pressable>
                                </View>
                            )) : (
                                <Text style={{ marginTop: 10, color: '#64748B' }}>No cached cashier profiles were found on this device.</Text>
                            )}
                        </View>
                    </>
                ) : null}

                <Pressable
                    onPress={onBack}
                    style={{ backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
                >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Back to POS</Text>
                </Pressable>
            </ScrollView>
        </View>
    );
};
