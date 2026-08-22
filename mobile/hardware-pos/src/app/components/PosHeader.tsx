import React from 'react';
import { View } from 'react-native';
import { PosText as Text } from './PosTextScale';
import { PosTextSizeControl } from './PosTextSizeControl';

export const PosHeader = ({
    title,
    subtitle,
    statusPills = []
}: {
    title: string;
    subtitle: string;
    statusPills?: Array<{ label: string; tone?: 'default' | 'success' | 'warning' }>;
}) => (
    <View style={{ padding: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#0F172A' }}>{title}</Text>
        <Text style={{ marginTop: 4, color: '#475569' }}>{subtitle}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <PosTextSizeControl compact />
            {statusPills.map((pill) => {
                const backgroundColor = pill.tone === 'success'
                    ? '#DCFCE7'
                    : pill.tone === 'warning'
                        ? '#FEF3C7'
                        : '#E2E8F0';
                const color = pill.tone === 'success'
                    ? '#166534'
                    : pill.tone === 'warning'
                        ? '#92400E'
                        : '#334155';

                return (
                    <View
                        key={pill.label}
                        style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            backgroundColor
                        }}
                    >
                        <Text style={{ fontSize: 12, fontWeight: '700', color }}>{pill.label}</Text>
                    </View>
                );
            })}
        </View>
    </View>
);
