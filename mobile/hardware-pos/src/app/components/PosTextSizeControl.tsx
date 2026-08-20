import React from 'react';
import { Pressable, View } from 'react-native';
import { getNextPosTextScale, getPosTextScaleLabel } from '../../domain/textScale';
import { PosText, usePosTextScale } from './PosTextScale';

export const PosTextSizeControl = ({ compact = false }: { compact?: boolean }) => {
    const { scale, setScale } = usePosTextScale();

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Text size: ${getPosTextScaleLabel(scale)}. Tap to change.`}
            onPress={() => setScale(getNextPosTextScale(scale))}
            style={{
                minHeight: 42,
                minWidth: compact ? 42 : 118,
                paddingHorizontal: compact ? 8 : 12,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#CBD5E1',
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <View style={{ alignItems: 'center' }}>
                <PosText style={{ color: '#1E3A8A', fontSize: compact ? 16 : 13, fontWeight: '900' }}>
                    {compact ? 'A' : `Text: ${getPosTextScaleLabel(scale)}`}
                </PosText>
                {!compact ? <PosText style={{ color: '#64748B', fontSize: 10, marginTop: 2 }}>Tap to enlarge</PosText> : null}
            </View>
        </Pressable>
    );
};
