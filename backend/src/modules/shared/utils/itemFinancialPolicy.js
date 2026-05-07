import { DomainError, DomainErrorCode } from '../contracts/domainErrors.js';

export const toPositiveMoney = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
};

export const hasExplicitSalePrice = (item) => toPositiveMoney(item?.default_sale_price) !== null;

export const isPureServiceItem = (item) => (
    String(item?.category || '').trim().toLowerCase() === 'service'
    || String(item?.mode_item_preset || '').trim().toLowerCase() === 'service'
);

export const getExplicitSalePrice = (item) => toPositiveMoney(item?.default_sale_price);

export const buildMissingSalePriceMessage = (item, context = 'sale') => {
    const itemName = String(item?.name || item?.sku_code || item?.item_id || 'Item').trim();
    return `${itemName} is missing an explicit sale price for ${context}.`;
};

export const requireExplicitSalePrice = (item, context = 'sale') => {
    const salePrice = getExplicitSalePrice(item);
    if (salePrice !== null) return salePrice;

    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        buildMissingSalePriceMessage(item, context),
        {
            statusCode: 400,
            details: {
                reason_code: 'MISSING_PRICE',
                item_id: item?.item_id ?? item?.id ?? null,
                default_sale_price: item?.default_sale_price ?? null,
                context
            }
        }
    );
};
