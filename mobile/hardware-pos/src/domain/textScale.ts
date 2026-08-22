export const POS_TEXT_SCALE_OPTIONS = [1, 1.15, 1.3] as const;

export type PosTextScale = typeof POS_TEXT_SCALE_OPTIONS[number];

export const normalizePosTextScale = (value: unknown): PosTextScale => {
    const numericValue = Number(value);
    return POS_TEXT_SCALE_OPTIONS.reduce((closest, option) => (
        Math.abs(option - numericValue) < Math.abs(closest - numericValue) ? option : closest
    ), POS_TEXT_SCALE_OPTIONS[0]);
};

export const getPosTextScaleLabel = (scale: PosTextScale): string => {
    if (scale === 1.15) return 'Large';
    if (scale === 1.3) return 'Extra Large';
    return 'Normal';
};

export const getNextPosTextScale = (scale: PosTextScale): PosTextScale => {
    const currentIndex = POS_TEXT_SCALE_OPTIONS.indexOf(scale);
    return POS_TEXT_SCALE_OPTIONS[(currentIndex + 1) % POS_TEXT_SCALE_OPTIONS.length];
};
