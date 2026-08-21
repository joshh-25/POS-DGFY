import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import logger from '../../../config/logger.js';
import { isStockExemptServiceItem } from '../utils/stockBearingPolicy.js';

// Shared by any repository that needs to overlay authoritative per-location stock
// (`item_location_stocks.quantity_on_hand`) onto an item row's `current_stock` field for a
// requested branch. Originally private to `modules/pos/repositories/posRepository.js`; hoisted
// here (#682) so `modules/inventory/repositories/itemRepository.js` can reuse the exact same
// query + fallback behavior instead of duplicating it, without either module importing the other.

const toPlain = (row) => (
    row && typeof row.toJSON === 'function'
        ? row.toJSON()
        : row
);

export const isMissingItemLocationStockSchemaError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    const normalizedMessage = message.toLowerCase();
    if (code === 'ER_NO_SUCH_TABLE' && message.includes('item_location_stocks')) {
        return true;
    }
    if (code === 'ER_BAD_FIELD_ERROR' && (
        normalizedMessage.includes('item_location_stocks')
        || normalizedMessage.includes('quantity_on_hand')
        || normalizedMessage.includes('location_id')
        || normalizedMessage.includes('item_id')
    )) {
        return true;
    }
    return false;
};

export const loadItemLocationStockMap = async (itemIds = [], locationId = null, options = {}) => {
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) {
        return {
            stockMap: new Map(),
            locationScopeResolved: false
        };
    }
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return {
            stockMap: new Map(),
            locationScopeResolved: true
        };
    }

    const ItemLocationStock = dbStore.get('ItemLocationStock');
    if (!ItemLocationStock) {
        return {
            stockMap: new Map(),
            locationScopeResolved: false
        };
    }
    try {
        const rows = await ItemLocationStock.findAll({
            where: {
                location_id: normalizedLocationId,
                item_id: { [Op.in]: itemIds }
            },
            attributes: ['item_id', 'quantity_on_hand'],
            transaction: options.transaction
        });

        return {
            stockMap: new Map(rows.map((row) => {
                const payload = toPlain(row);
                return [Number(payload.item_id), Number(payload.quantity_on_hand || 0)];
            })),
            locationScopeResolved: true
        };
    } catch (error) {
        if (isMissingItemLocationStockSchemaError(error)) {
            logger.warn('[ItemLocationStockOverlay] item_location_stocks schema unavailable; falling back to tenant-wide aggregate stock', {
                event_type: options.fallbackEventType || 'item_location_stock_fallback',
                location_id: normalizedLocationId
            });
            return {
                stockMap: new Map(),
                locationScopeResolved: false
            };
        }
        throw error;
    }
};

export const applyItemLocationStockMap = (items = [], locationStockMap = new Map()) => (
    (Array.isArray(items) ? items : []).map((item) => {
        const payload = toPlain(item);
        const isServiceItem = isStockExemptServiceItem(payload);
        const mappedStock = locationStockMap.get(Number(payload.item_id));
        const stockValue = Number.isFinite(mappedStock) ? Math.max(0, mappedStock) : 0;
        return {
            ...payload,
            current_stock: isServiceItem ? 0 : stockValue
        };
    })
);
