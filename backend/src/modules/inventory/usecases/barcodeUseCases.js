import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizeBarcodeValue } from '../../shared/utils/barcodePolicy.js';

const STOCK_SCAN_OPERATIONS = new Set(['inventory_scan', 'stock_movement', 'receiving', 'transfer', 'count']);

const parsePositiveInt = (value, field = 'id') => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `${field} must be a positive integer`,
            { statusCode: 422 }
        );
    }
    return parsed;
};

const mapError = (error, fallbackMessage) => {
    if (error instanceof DomainError) return error;
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    const code = statusCode === 404
        ? DomainErrorCode.RESOURCE_NOT_FOUND
        : statusCode === 409
            ? DomainErrorCode.CONFLICT
            : statusCode >= 400 && statusCode < 500
                ? DomainErrorCode.VALIDATION_FAILED
                : DomainErrorCode.INTERNAL_ERROR;
    return new DomainError(code, error?.message || fallbackMessage, {
        statusCode,
        details: error?.details || null
    });
};

const wrap = async (runner, fallbackMessage) => {
    try {
        return ok(await runner());
    } catch (error) {
        return fail(mapError(error, fallbackMessage));
    }
};

export const buildListItemBarcodesUseCase = ({ itemRepository }) => async ({ itemId, query = {} }) => wrap(
    () => itemRepository.listItemBarcodes(parsePositiveInt(itemId, 'item_id'), {
        includeInactive: query.include_inactive !== 'false' && query.include_inactive !== false
    }),
    'Failed to list item barcodes'
);

export const buildAttachItemBarcodeUseCase = ({ itemRepository }) => async ({ itemId, payload = {}, userId = null }) => wrap(
    () => itemRepository.attachItemBarcode(parsePositiveInt(itemId, 'item_id'), payload, userId),
    'Failed to attach barcode'
);

export const buildGenerateItemBarcodeUseCase = ({ itemRepository }) => async ({ itemId, payload = {}, userId = null }) => wrap(
    () => itemRepository.generateItemBarcode(parsePositiveInt(itemId, 'item_id'), payload, userId),
    'Failed to generate barcode'
);

export const buildUpdateItemBarcodeUseCase = ({ itemRepository }) => async ({ itemId, barcodeId, payload = {}, userId = null }) => wrap(
    () => itemRepository.updateItemBarcode(
        parsePositiveInt(itemId, 'item_id'),
        parsePositiveInt(barcodeId, 'barcode_id'),
        payload,
        userId
    ),
    'Failed to update barcode'
);

export const buildDeactivateItemBarcodeUseCase = ({ itemRepository }) => async ({ itemId, barcodeId, userId = null }) => wrap(
    () => itemRepository.deactivateItemBarcode(
        parsePositiveInt(itemId, 'item_id'),
        parsePositiveInt(barcodeId, 'barcode_id'),
        userId
    ),
    'Failed to deactivate barcode'
);

export const buildSetPrimaryItemBarcodeUseCase = ({ itemRepository }) => async ({ itemId, barcodeId, userId = null }) => wrap(
    () => itemRepository.setPrimaryItemBarcode(
        parsePositiveInt(itemId, 'item_id'),
        parsePositiveInt(barcodeId, 'barcode_id'),
        userId
    ),
    'Failed to set primary barcode'
);

export const buildResolveItemBarcodeUseCase = ({
    itemRepository,
    resolveLocationScope = null
}) => async ({
    code,
    query = {},
    userId = null
} = {}) => wrap(async () => {
    const normalized = normalizeBarcodeValue(code);
    if (!normalized) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'barcode code is required',
            { statusCode: 422 }
        );
    }
    const operation = String(query.operation || '').trim().toLowerCase();
    const requestedLocationId = query.location_id || query.locationId || null;
    if ((requestedLocationId || STOCK_SCAN_OPERATIONS.has(operation)) && typeof resolveLocationScope === 'function') {
        await resolveLocationScope({
            requestedLocationId,
            userId,
            operationLabel: operation || 'barcode inventory scan'
        });
    }
    return itemRepository.resolveItemBarcode(code);
}, 'Failed to resolve barcode');

export const buildResolveItemBarcodeConflictUseCase = ({ itemRepository }) => async ({
    payload = {},
    userId = null
}) => wrap(async () => {
    const action = String(payload.action || '').trim().toLowerCase();
    const code = payload.code;
    const resolution = await itemRepository.resolveItemBarcode(code, { includeInactive: false });
    const existingBarcode = resolution?.barcode || null;
    if (resolution.status !== 'resolved') {
        return {
            action,
            resolution,
            resolved: false
        };
    }

    if (action === 'keep_existing' || action === 'reject_import') {
        await itemRepository.auditBarcodeConflictResolution({
            userId,
            code,
            action,
            existing: existingBarcode,
            target_item_id: payload.target_item_id || payload.item_id || null,
            result: 'kept_existing'
        });
        return {
            action,
            resolution,
            resolved: true
        };
    }

    if (action === 'move_code') {
        const targetItemId = parsePositiveInt(payload.target_item_id || payload.item_id, 'target_item_id');
        if (Number(existingBarcode.item_id) === targetItemId) {
            await itemRepository.auditBarcodeConflictResolution({
                userId,
                code,
                action,
                existing: existingBarcode,
                target_item_id: targetItemId,
                result: 'already_on_target'
            });
            return {
                action,
                barcode: existingBarcode,
                resolved: true
            };
        }
        await itemRepository.deactivateItemBarcode(existingBarcode.item_id, existingBarcode.item_barcode_id, userId);
        const moved = await itemRepository.attachItemBarcode(targetItemId, {
            code: existingBarcode.code,
            source: payload.source || existingBarcode.source,
            scope: payload.scope || existingBarcode.scope,
            packaging_level: payload.packaging_level || existingBarcode.packaging_level,
            quantity_multiplier: payload.quantity_multiplier || existingBarcode.quantity_multiplier,
            metadata: {
                ...(existingBarcode.metadata || {}),
                conflict_resolution: {
                    action: 'move_code',
                    from_item_id: existingBarcode.item_id,
                    from_barcode_id: existingBarcode.item_barcode_id,
                    resolved_at: new Date().toISOString()
                }
            }
        }, userId);
        await itemRepository.auditBarcodeConflictResolution({
            userId,
            code,
            action,
            existing: existingBarcode,
            target_item_id: targetItemId,
            result: 'moved'
        });
        return {
            action,
            barcode: moved,
            resolved: true
        };
    }

    if (action === 'add_package_alias') {
        const targetItemId = parsePositiveInt(payload.target_item_id || payload.item_id, 'target_item_id');
        const multiplier = Number(payload.quantity_multiplier || 0);
        if (!Number.isFinite(multiplier) || multiplier <= 1) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'add_package_alias requires quantity_multiplier greater than 1',
                { statusCode: 422 }
            );
        }
        await itemRepository.deactivateItemBarcode(existingBarcode.item_id, existingBarcode.item_barcode_id, userId);
        const created = await itemRepository.attachItemBarcode(targetItemId, {
            code: existingBarcode.code,
            source: payload.source || existingBarcode.source,
            scope: 'package',
            packaging_level: payload.packaging_level || existingBarcode.packaging_level || 'case',
            quantity_multiplier: multiplier,
            metadata: {
                ...(existingBarcode.metadata || {}),
                conflict_resolution: {
                    action: 'add_package_alias',
                    from_item_id: existingBarcode.item_id,
                    from_barcode_id: existingBarcode.item_barcode_id,
                    resolved_at: new Date().toISOString()
                }
            }
        }, userId);
        await itemRepository.auditBarcodeConflictResolution({
            userId,
            code,
            action,
            existing: existingBarcode,
            target_item_id: targetItemId,
            result: 'package_alias_created'
        });
        return {
            action,
            barcode: created,
            resolved: true
        };
    }

    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Unsupported barcode conflict action',
        {
            statusCode: 422,
            details: { supported_actions: ['keep_existing', 'move_code', 'add_package_alias', 'reject_import'] }
        }
    );
}, 'Failed to resolve barcode conflict');

export const buildRenderItemBarcodeLabelUseCase = ({ itemRepository }) => async ({
    itemId,
    query = {},
    userId = null
}) => wrap(
    () => itemRepository.buildItemBarcodeLabelPayload(parsePositiveInt(itemId, 'item_id'), {
        barcodeId: query.barcode_id || query.barcodeId || null,
        labelType: query.label_type || query.labelType || 'item'
    }, userId),
    'Failed to render barcode label payload'
);
