import { useEffect } from 'react';
import { publishPosCustomerDisplaySnapshot } from '../utils/posCustomerDisplaySync.js';

export const usePosCustomerDisplaySync = ({
    scope = {},
    terminalId = '',
    locationId = null,
    cart = [],
    subtotal = 0,
    total = 0,
    itemCount = null,
    currency = 'PHP',
    businessName = 'DGFY'
} = {}) => {
    const tenantId = scope?.tenantId || '';
    const scopedTerminalId = scope?.terminalId || terminalId;
    const scopedLocationId = scope?.locationId || locationId;

    useEffect(() => {
        publishPosCustomerDisplaySnapshot({
            scope: {
                tenantId,
                terminalId: scopedTerminalId,
                locationId: scopedLocationId
            },
            cart,
            subtotal,
            total,
            itemCount,
            currency,
            businessName
        });
    }, [
        businessName,
        cart,
        currency,
        itemCount,
        scopedLocationId,
        scopedTerminalId,
        subtotal,
        tenantId,
        total
    ]);
};
