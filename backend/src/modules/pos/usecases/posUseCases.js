import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';

const VAT_RATE = 0.12;
const INVOICE_COUNTER_KEY = 'POS_OR';

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    if (!Number.isInteger(normalized) || normalized <= 0) return null;
    return normalized;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stableStringify = (value) => {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (payload) => crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const buildBusinessDateRange = (dateInput) => {
    const dateString = dateInput instanceof Date
        ? dateInput.toISOString().slice(0, 10)
        : String(dateInput).slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'business date must be in YYYY-MM-DD format',
            { statusCode: 400 }
        );
    }

    const startAt = new Date(`${dateString}T00:00:00+08:00`);
    const endAt = new Date(startAt.getTime() + (24 * 60 * 60 * 1000));

    return {
        businessDate: dateString,
        startAt,
        endAt
    };
};

const toSerializable = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

export const buildCheckoutPosUseCase = ({ posRepository, stockMovementService }) => {
    return async ({ payload, userId }) => {
        const normalizedUserId = parsePositiveInt(userId);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'userId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        const lines = Array.isArray(payload.lines) ? payload.lines : [];
        if (lines.length === 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'At least one checkout line is required',
                { statusCode: 400 }
            ));
        }

        const idempotencyKey = payload.idempotency_key;
        if (!idempotencyKey || typeof idempotencyKey !== 'string') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required',
                { statusCode: 400 }
            ));
        }

        const normalizedRequestPayload = {
            terminal_id: payload.terminal_id || null,
            order_method: payload.order_method || 'dine_in',
            payment_type: payload.payment_type || 'cash',
            discount_amount: round4(payload.discount_amount || 0),
            lines: lines
                .map((line) => ({
                    item_id: Number.parseInt(line.item_id, 10),
                    quantity: round4(line.quantity),
                    sale_price: line.sale_price == null ? null : round4(line.sale_price)
                }))
                .sort((a, b) => a.item_id - b.item_id)
        };
        const requestHash = hashPayload(normalizedRequestPayload);

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const existing = await posRepository.findTransactionByIdempotencyKey(
                idempotencyKey,
                { transaction, lock: true }
            );

            if (existing) {
                if (existing.request_hash !== requestHash) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'idempotency_key was already used with a different payload',
                        { statusCode: 409 }
                    );
                }

                await transaction.commit();
                return ok({
                    idempotent_replay: true,
                    transaction: toSerializable(existing)
                });
            }

            const itemIds = [...new Set(lines.map((line) => Number.parseInt(line.item_id, 10)))];
            const items = await posRepository.findSellableItemsByIds(itemIds, { transaction, lock: true });
            const itemMap = new Map(items.map((item) => [item.item_id, item]));

            if (itemMap.size !== itemIds.length) {
                const missingIds = itemIds.filter((itemId) => !itemMap.has(itemId));
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Some finished goods items were not found or inactive: ${missingIds.join(', ')}`,
                    {
                        statusCode: 404,
                        details: { missing_item_ids: missingIds }
                    }
                );
            }

            let subtotalAmount = 0;
            const preparedLines = [];

            for (const line of lines) {
                const itemId = Number.parseInt(line.item_id, 10);
                const quantity = Number(line.quantity);
                const item = itemMap.get(itemId);

                if (!Number.isFinite(quantity) || quantity <= 0) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Invalid quantity for item ${itemId}`,
                        { statusCode: 400 }
                    );
                }

                const currentStock = Number(item.current_stock) || 0;
                if (currentStock + 0.000001 < quantity) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Insufficient stock for "${item.name}". Available: ${currentStock}, requested: ${quantity}`,
                        { statusCode: 400 }
                    );
                }

                const resolvedPrice = line.sale_price == null
                    ? (
                        item.default_sale_price != null
                            ? Number(item.default_sale_price)
                            : Number(item.cost_per_unit || 0)
                    )
                    : Number(line.sale_price);

                if (!Number.isFinite(resolvedPrice) || resolvedPrice < 0) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Invalid sale price for item ${item.item_id}`,
                        { statusCode: 400 }
                    );
                }

                const lineSubtotal = round4(quantity * resolvedPrice);
                subtotalAmount += lineSubtotal;

                preparedLines.push({
                    item_id: item.item_id,
                    item_name: item.name,
                    quantity: round4(quantity),
                    unit_of_measure: item.unit_of_measure,
                    cost_snapshot: item.cost_per_unit != null ? round4(item.cost_per_unit) : null,
                    sale_price: round4(resolvedPrice),
                    line_subtotal: lineSubtotal,
                    vat_type_snapshot: item.vat_type || 'vatable',
                    vat_rate_snapshot: VAT_RATE
                });
            }

            subtotalAmount = round4(subtotalAmount);
            const rawDiscount = round4(payload.discount_amount || 0);
            const discountAmount = Math.min(rawDiscount, subtotalAmount);
            const totalAmount = round4(subtotalAmount - discountAmount);
            const adjustmentFactor = subtotalAmount > 0 ? (totalAmount / subtotalAmount) : 1;

            for (const line of preparedLines) {
                line.line_subtotal = round4(line.line_subtotal * adjustmentFactor);
            }

            const adjustedSubtotal = round4(
                preparedLines.reduce((sum, line) => sum + line.line_subtotal, 0)
            );
            const lineDiff = round4(totalAmount - adjustedSubtotal);
            if (preparedLines.length > 0 && Math.abs(lineDiff) > 0) {
                const lastLine = preparedLines[preparedLines.length - 1];
                lastLine.line_subtotal = round4(lastLine.line_subtotal + lineDiff);
            }

            let vatableGross = 0;
            let vatExemptSales = 0;
            let zeroRatedSales = 0;

            for (const line of preparedLines) {
                if (line.vat_type_snapshot === 'vatable') {
                    vatableGross += line.line_subtotal;
                } else if (line.vat_type_snapshot === 'vat_exempt') {
                    vatExemptSales += line.line_subtotal;
                } else if (line.vat_type_snapshot === 'zero_rated') {
                    zeroRatedSales += line.line_subtotal;
                }
            }

            vatableGross = round4(vatableGross);
            vatExemptSales = round4(vatExemptSales);
            zeroRatedSales = round4(zeroRatedSales);

            const vatableSales = round4(vatableGross / (1 + VAT_RATE));
            const vatAmount = round4(vatableGross - vatableSales);

            const invoiceNumber = await posRepository.nextInvoiceNumber(
                INVOICE_COUNTER_KEY,
                { transaction }
            );

            const posTransactionId = await posRepository.createTransactionWithLines({
                header: {
                    invoice_number: invoiceNumber,
                    idempotency_key: idempotencyKey,
                    request_hash: requestHash,
                    cashier_id: normalizedUserId,
                    terminal_id: payload.terminal_id || null,
                    order_method: payload.order_method || 'dine_in',
                    payment_type: payload.payment_type || 'cash',
                    subtotal_amount: subtotalAmount,
                    vatable_sales: vatableSales,
                    vat_amount: vatAmount,
                    vat_exempt_sales: vatExemptSales,
                    zero_rated_sales: zeroRatedSales,
                    discount_amount: discountAmount,
                    total_amount: totalAmount,
                    status: 'completed'
                },
                lines: preparedLines
            }, { transaction });

            for (const line of preparedLines) {
                await stockMovementService.createStockMovement({
                    item_id: line.item_id,
                    quantity: Number(line.quantity),
                    movement_type: 'goods_issue',
                    reference_type: 'POS',
                    reference_id: String(posTransactionId),
                    notes: `POS checkout ${invoiceNumber}`
                }, normalizedUserId, transaction);
            }

            const created = await posRepository.getTransactionById(
                posTransactionId,
                { transaction }
            );

            await transaction.commit();
            return ok({
                idempotent_replay: false,
                transaction: toSerializable(created)
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to complete POS checkout'));
        }
    };
};

export const buildListPosTransactionsUseCase = ({ posRepository }) => {
    return async ({ query }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const data = await posRepository.listTransactions(query || {});
            return ok(data);
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list POS transactions'));
        }
    };
};

export const buildGetPosTransactionByIdUseCase = ({ posRepository }) => {
    return async ({ posTransactionId }) => {
        const normalizedId = parsePositiveInt(posTransactionId);
        if (!normalizedId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        try {
            const data = await posRepository.getTransactionById(normalizedId);
            if (!data) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'POS transaction not found',
                    { statusCode: 404 }
                ));
            }
            return ok(toSerializable(data));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS transaction'));
        }
    };
};

export const buildCloseDayZReadingUseCase = ({ posRepository }) => {
    return async ({ businessDateInput }) => {
        try {
            const { businessDate, startAt, endAt } = buildBusinessDateRange(
                businessDateInput || new Date()
            );
            const summary = await posRepository.getZReadingSummary({ startAt, endAt });
            return ok({
                business_date: businessDate,
                generated_at: new Date().toISOString(),
                summary
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to generate daily Z-reading'));
        }
    };
};

export const buildGetDailyZReadingUseCase = ({ posRepository }) => {
    return async ({ businessDateInput }) => {
        try {
            const { businessDate, startAt, endAt } = buildBusinessDateRange(businessDateInput);
            const summary = await posRepository.getZReadingSummary({ startAt, endAt });
            return ok({
                business_date: businessDate,
                generated_at: new Date().toISOString(),
                summary
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve daily Z-reading'));
        }
    };
};

export const buildListPosCatalogUseCase = ({ posRepository }) => {
    return async ({ query }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const data = await posRepository.listCatalog({
                search: query?.search || '',
                limit: query?.limit || 100
            });
            return ok(data.map((item) => toSerializable(item)));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS catalog'));
        }
    };
};

