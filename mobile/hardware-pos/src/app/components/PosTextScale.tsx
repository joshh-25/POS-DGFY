import React, { createContext, useContext, useMemo } from 'react';
import {
    StyleSheet,
    Text as NativeText,
    TextInput as NativeTextInput,
    type TextInputProps,
    type TextProps,
    type TextStyle
} from 'react-native';
import type { PosTextScale } from '../../domain/textScale';

interface PosTextScaleContextValue {
    scale: PosTextScale;
    effectiveScale: number;
    setScale: (scale: PosTextScale) => void;
}

const PosTextScaleContext = createContext<PosTextScaleContextValue>({
    scale: 1,
    effectiveScale: 1,
    setScale: () => undefined
});

export const PosTextScaleProvider = ({
    scale,
    systemFontScale = 1,
    onScaleChange,
    children
}: {
    scale: PosTextScale;
    systemFontScale?: number;
    onScaleChange: (scale: PosTextScale) => void;
    children: React.ReactNode;
}) => {
    const effectiveScale = Math.min(1.6, Math.max(0.85, scale * (Number(systemFontScale) || 1)));
    const value = useMemo(() => ({
        scale,
        effectiveScale,
        setScale: onScaleChange
    }), [effectiveScale, onScaleChange, scale]);

    return <PosTextScaleContext.Provider value={value}>{children}</PosTextScaleContext.Provider>;
};

export const usePosTextScale = (): PosTextScaleContextValue => useContext(PosTextScaleContext);

const scaledTextStyle = (style: TextProps['style'], effectiveScale: number) => {
    const flattenedStyle = StyleSheet.flatten(style) as TextStyle | undefined;
    const baseFontSize = typeof flattenedStyle?.fontSize === 'number' ? flattenedStyle.fontSize : 14;
    const baseLineHeight = typeof flattenedStyle?.lineHeight === 'number' ? flattenedStyle.lineHeight : null;

    return [
        style,
        {
            fontSize: baseFontSize * effectiveScale,
            ...(baseLineHeight ? { lineHeight: baseLineHeight * effectiveScale } : {})
        }
    ];
};

export const PosText = ({ style, ...props }: TextProps) => {
    const { effectiveScale } = usePosTextScale();
    return <NativeText {...props} allowFontScaling={false} style={scaledTextStyle(style, effectiveScale)} />;
};

export const PosTextInput = ({ style, ...props }: TextInputProps) => {
    const { effectiveScale } = usePosTextScale();
    return <NativeTextInput {...props} allowFontScaling={false} style={scaledTextStyle(style, effectiveScale)} />;
};
