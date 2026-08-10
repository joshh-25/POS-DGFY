const DGFY_CONVENIENCE_FEE_RATE = 0.01;
const DGFY_CONVENIENCE_FEE_LABEL = 'DGFY convenience fee';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const computeDgfyConvenienceFee = (grossSubtotal) => {
    const normalizedGrossSubtotal = Math.max(0, Number(grossSubtotal) || 0);
    return round4(normalizedGrossSubtotal * DGFY_CONVENIENCE_FEE_RATE);
};

export const getDgfyConvenienceFeeLabel = () => DGFY_CONVENIENCE_FEE_LABEL;

export const getDgfyConvenienceFeeRate = () => DGFY_CONVENIENCE_FEE_RATE;
