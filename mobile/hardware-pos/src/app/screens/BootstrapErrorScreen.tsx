import React from 'react';
import { Pressable, View } from 'react-native';
import { PosText as Text } from '../components/PosTextScale';

interface BootstrapErrorScreenProps {
    message: string;
    onRetry: () => void;
}

export const BootstrapErrorScreen = ({
    message,
    onRetry
}: BootstrapErrorScreenProps) => (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FFF7ED' }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: '#7C2D12' }}>POS startup failed</Text>
        <Text style={{ marginTop: 12, fontSize: 15, lineHeight: 22, color: '#9A3412' }}>
            {message}
        </Text>
        <Text style={{ marginTop: 12, fontSize: 13, lineHeight: 20, color: '#C2410C' }}>
            The app stayed in a safe startup state. Retry after the emulator or device runtime is stable.
        </Text>
        <Pressable
            onPress={onRetry}
            style={{
                marginTop: 24,
                alignItems: 'center',
                borderRadius: 10,
                backgroundColor: '#C2410C',
                paddingVertical: 14
            }}
        >
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Retry Startup</Text>
        </Pressable>
    </View>
);
