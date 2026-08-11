import crypto from 'crypto';
import { getAllSettingsUseCase } from '../../settings/index.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import { normalizePosPaymentBreakdown } from '../utils/paymentBreakdown.js';
import { resolveReceiptLogoRaster } from '../utils/receiptLogoRaster.js';

const POS_DEVICE_OPERATION_KEYS = Object.freeze({
    RECEIPT_PRINT: 'terminal.device_receipt_print',
    DRAWER_OPEN: 'terminal.device_drawer_open',
    SHIFT_SUMMARY_PRINT: 'terminal.device_shift_summary_print',
    Z_READING_PRINT: 'terminal.device_z_reading_print'
});

const toSerializable = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    if (!Number.isInteger(normalized) || normalized <= 0) return null;
    return normalized;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const resolveShiftSalesWindow = (shift = {}) => {
    const startAt = new Date(shift?.opened_at || '');
    if (!Number.isFinite(startAt.getTime())) return {};

    const requestedEndAt = shift?.closed_at ? new Date(shift.closed_at) : new Date();
    const endAt = Number.isFinite(requestedEndAt.getTime()) && requestedEndAt > startAt
        ? requestedEndAt
        : new Date();
    return { startAt, endAt };
};

const normalizeBusinessDate = (value) => {
    const dateString = value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(dateString) ? dateString : null;
};

const normalizeOptionalIdempotencyKey = (value) => {
    const normalized = String(value || '').trim();
    return normalized.length >= 8 ? normalized : null;
};

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

const parseJsonObject = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const buildOperationReplayConflictError = () => new DomainError(
    DomainErrorCode.CONFLICT,
    'idempotency_key was already used with a different payload',
    {
        statusCode: 409,
        details: {
            idempotency: {
                outcome: 'conflict',
                idempotent_replay: true
            }
        }
    }
);

const serializeReplayFailure = (error) => ({
    message: error?.message || 'Operation blocked',
    error_code: error?.code || DomainErrorCode.VALIDATION_FAILED,
    status_code: Number.parseInt(error?.statusCode || 422, 10) || 422,
    details: error?.details || null
});

const buildReplayBlockedError = (payload = {}) => new DomainError(
    payload.error_code || DomainErrorCode.VALIDATION_FAILED,
    payload.message || 'Operation is blocked',
    {
        statusCode: Number.parseInt(payload.status_code || 422, 10) || 422,
        details: {
            ...(payload.details && typeof payload.details === 'object' ? payload.details : {}),
            idempotency: {
                outcome: 'blocked',
                idempotent_replay: true
            }
        }
    }
);

const findOperationReplayEntry = async ({
    posRepository,
    operationKey,
    idempotencyKey,
    requestHash
}) => {
    if (!idempotencyKey) return null;

    const existing = toSerializable(await posRepository.findOperationReplayByKey({
        operationKey,
        idempotencyKey
    }));
    if (!existing) return null;

    if (String(existing.request_hash || '') !== String(requestHash || '')) {
        throw buildOperationReplayConflictError();
    }

    if (existing.replay_status === 'blocked') {
        throw buildReplayBlockedError(existing.response_payload || {});
    }

    return {
        ...(existing.response_payload || {}),
        idempotent_replay: true,
        replay_outcome: 'idempotent_replay'
    };
};

const persistOperationReplay = async ({
    posRepository,
    operationKey,
    idempotencyKey,
    requestHash,
    replayStatus,
    responsePayload,
    createdBy
}) => {
    if (!idempotencyKey) return null;

    return posRepository.createOperationReplay({
        operation_key: operationKey,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        replay_status: replayStatus,
        response_payload: responsePayload || {},
        created_by: createdBy || null
    });
};

const buildAuditMetadata = (auditContext = {}) => ({
    ip_address: auditContext?.ipAddress || null,
    user_agent: auditContext?.userAgent || null
});

const buildBusinessSettings = (settings = {}) => ({
    name: settings?.pos_business_name?.value || 'DGFY',
    registered_name: settings?.pos_registered_name?.value || '',
    business_style: settings?.pos_business_style?.value || '',
    taxpayer_type: settings?.pos_taxpayer_type?.value || '',
    address: settings?.pos_address?.value || '',
    tin_branch: settings?.pos_tin_branch?.value || '',
    ptu_number: settings?.pos_ptu_number?.value || '',
    min_number: settings?.pos_min_number?.value || '',
    accreditation_number: settings?.pos_accreditation_number?.value || '',
    footer_message: settings?.pos_receipt_footer_message?.value || '',
    profile_image_url: settings?.storefront_profile_image_url?.value || ''
});

const buildReceiptPayload = async ({ transaction, settings }) => {
    const transactionMetadata = parseJsonObject(transaction?.special_instructions);
    const receiptContract = transactionMetadata?.receipt_contract && typeof transactionMetadata.receipt_contract === 'object'
        ? transactionMetadata.receipt_contract
        : {
            version: '2026.04.08',
            document_type: transaction?.document_type || 'non_fiscal_slip',
            document_context: transaction?.document_context || 'non_fiscal'
        };

    // Only the receipt gets a logo -- shift summaries and Z-readings (the other
    // buildBusinessSettings callers) stay text-only rather than paying the sharp
    // encoding cost on every print of something that isn't a customer-facing
    // receipt. See issue #321.
    const logoRaster = await resolveReceiptLogoRaster({ settings });

    return {
        receipt_contract: {
            version: String(receiptContract?.version || '2026.04.08').trim(),
            document_type: String(receiptContract?.document_type || transaction?.document_type || 'non_fiscal_slip').trim(),
            document_context: String(receiptContract?.document_context || transaction?.document_context || 'non_fiscal').trim()
        },
        business: { ...buildBusinessSettings(settings), logo_raster: logoRaster },
        transaction: {
            pos_transaction_id: transaction?.pos_transaction_id || null,
            invoice_number: transaction?.invoice_number || null,
            created_at: transaction?.created_at || null,
            payment_type: transaction?.payment_type || null,
            customer_name: transaction?.customer_name || null,
            subtotal_amount: round4(transaction?.subtotal_amount),
            vatable_sales: round4(transaction?.vatable_sales),
            vat_amount: round4(transaction?.vat_amount),
            vat_exempt_sales: round4(transaction?.vat_exempt_sales),
            zero_rated_sales: round4(transaction?.zero_rated_sales),
            discount_amount: round4(transaction?.discount_amount),
            discount_label_snapshot: transaction?.discount_label_snapshot || null,
            discount_rate_snapshot: transaction?.discount_rate_snapshot ?? null,
            service_fee_amount: round4(transaction?.service_fee_amount),
            service_fee_label_snapshot: transaction?.service_fee_label_snapshot || null,
            service_fee_method_snapshot: transaction?.service_fee_method_snapshot || null,
            restaurant_service_charge_amount: round4(transaction?.restaurant_service_charge_amount),
            restaurant_service_charge_label_snapshot: transaction?.restaurant_service_charge_label_snapshot || null,
            restaurant_service_charge_rate_snapshot: transaction?.restaurant_service_charge_rate_snapshot ?? null,
            total_amount: round4(transaction?.total_amount),
            lines: Array.isArray(transaction?.lines)
                ? transaction.lines.map((line) => ({
                    line_id: line?.line_id || null,
                    item_name: line?.item?.name || `Item #${line?.item_id || ''}`,
                    quantity: Number(line?.quantity || 0),
                    sale_price: round4(line?.sale_price),
                    line_subtotal: round4(line?.line_subtotal),
                    unit_of_measure: line?.unit_of_measure || '',
                    course: line?.fnb_course_snapshot || null,
                    modifiers: line?.fnb_modifiers_snapshot || null,
                    notes: line?.fnb_special_instructions || null
                }))
                : []
        }
    };
};

const summarizeShiftCashEvents = (events = []) => {
    const effectByType = {
        cash_in: 1,
        cash_out: -1,
        opening_adjustment: 1,
        closing_adjustment: -1
    };
    return (Array.isArray(events) ? events : []).reduce((summary, event) => {
        const eventType = String(event?.event_type || '').trim();
        const amount = round4(event?.amount);
        if (!Object.prototype.hasOwnProperty.call(effectByType, eventType)) return summary;
        const key = `${eventType}_total`;
        summary[key] = round4((summary[key] || 0) + amount);
        summary.net_events_total = round4(summary.net_events_total + (amount * effectByType[eventType]));
        return summary;
    }, {
        cash_in_total: 0,
        cash_out_total: 0,
        opening_adjustment_total: 0,
        closing_adjustment_total: 0,
        net_events_total: 0
    });
};

const buildShiftSummaryPayload = async ({ posRepository, shift, settings, transaction }) => {
    const cashEvents = Array.isArray(shift?.cashEvents) ? shift.cashEvents : [];
    const eventSummary = summarizeShiftCashEvents(cashEvents);
    const openingFloatAmount = round4(shift?.opening_float_amount);
    const cashSalesAmount = typeof posRepository?.getShiftCashSalesTotal === 'function'
        ? round4(await posRepository.getShiftCashSalesTotal(shift.pos_terminal_shift_id, { transaction }))
        : 0;
    const expectedCashAmount = shift?.expected_cash_amount == null
        ? round4(openingFloatAmount + eventSummary.net_events_total + cashSalesAmount)
        : round4(shift.expected_cash_amount);
    const salesSummary = typeof posRepository?.getZReadingSummary === 'function'
        ? await posRepository.getZReadingSummary({
            shiftId: shift.pos_terminal_shift_id,
            ...resolveShiftSalesWindow(shift)
        }, { transaction })
        : null;

    return {
        business: buildBusinessSettings(settings),
        shift: {
            pos_terminal_shift_id: shift.pos_terminal_shift_id,
            business_date: shift.business_date,
            terminal_id: shift.terminal_id,
            location_id: shift.location_id || null,
            cashier_id: shift.cashier_id || null,
            status: shift.status,
            opened_at: shift.opened_at || null,
            closed_at: shift.closed_at || null
        },
        cash_summary: {
            opening_float_amount: openingFloatAmount,
            closing_cash_amount: shift?.closing_cash_amount == null ? null : round4(shift.closing_cash_amount),
            expected_cash_amount: expectedCashAmount,
            cash_variance_amount: shift?.cash_variance_amount == null ? null : round4(shift.cash_variance_amount),
            cash_sales_amount: cashSalesAmount,
            ...eventSummary
        },
        sales_summary: salesSummary
            ? {
                ...salesSummary,
                payment_breakdown: normalizePosPaymentBreakdown(salesSummary.payment_breakdown)
            }
            : null
    };
};

export const buildGetPosDeviceStatusUseCase = ({ posRepository, deviceDriver }) => {
    return async ({ user, auditContext = {} }) => {
        const userId = parsePositiveInt(user?.user_id);
        if (!userId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }

        try {
            const bridge = await deviceDriver.getStatus();
            await posRepository.createAuditLog({
                user_id: userId,
                entity_type: 'pos_device_bridge',
                entity_id: null,
                action: 'VIEW',
                changes: {
                    operation: 'status',
                    driver_id: deviceDriver.id,
                    printers_detected: bridge?.printersDetected ?? null,
                    auth_required: bridge?.authRequired ?? null
                },
                ...buildAuditMetadata(auditContext)
            });

            // Absence of hardware is a successful, informational answer, not a
            // service failure — see ADR 0053. A 503 only ever comes from the
            // catch block below, when a driver IS configured but unreachable.
            return ok({
                bridge,
                driver: {
                    id: deviceDriver.id,
                    available: deviceDriver.id === 'lan_escpos_bridge'
                },
                hardware_required: false
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS device bridge status'));
        }
    };
};

export const buildPrintPosReceiptUseCase = ({ posRepository, deviceDriver }) => {
    return async ({ payload, user, auditContext = {} }) => {
        const userId = parsePositiveInt(user?.user_id);
        const transactionId = parsePositiveInt(payload?.transaction_id);
        const copies = Math.max(1, Math.min(Number.parseInt(payload?.copies, 10) || 1, 5));
        const paperWidth = payload?.paper_width === '57mm' ? '57mm' : '80mm';
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const reason = String(payload?.reason || '').trim() || 'manual_reprint';
        // Set when a client-side driver (iMin native bridge, a future Web
        // Bluetooth ESC/POS driver) already printed the receipt itself. The
        // backend then skips dispatching to its own driver and only records the
        // audit/idempotency trail — closing the gap where client-executed prints
        // were previously never audited at all. See ADR 0053.
        const clientDriverId = String(payload?.client_driver_id || '').trim() || null;
        const clientResult = (clientDriverId && payload?.client_result && typeof payload.client_result === 'object')
            ? payload.client_result
            : null;

        if (!userId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!transactionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'transaction_id must be a positive integer',
                { statusCode: 422 }
            ));
        }

        const replayRequestHash = hashPayload({
            transaction_id: transactionId,
            copies,
            paper_width: paperWidth,
            reason,
            client_driver_id: clientDriverId
        });

        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_DEVICE_OPERATION_KEYS.RECEIPT_PRINT,
                idempotencyKey,
                requestHash: replayRequestHash
            });
            if (replay) {
                return ok(replay);
            }

            const activeShift = toSerializable(await posRepository.findOpenTerminalShift({
                cashierId: userId
            }));
            if (!activeShift) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Receipt printing requires an open shift',
                    { statusCode: 422 }
                );
            }

            const transaction = toSerializable(await posRepository.getTransactionById(transactionId));
            if (!transaction) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `POS transaction not found: ${transactionId}`,
                    { statusCode: 404 }
                );
            }

            const allSettings = unwrapApplicationResultOrThrow(await getAllSettingsUseCase());
            const receipt = { ...await buildReceiptPayload({ transaction, settings: allSettings }), paper_width: paperWidth };
            const bridgeResponse = clientDriverId
                ? {
                    ok: clientResult?.success !== false,
                    delegated: true,
                    driver: clientDriverId,
                    client_result: clientResult
                }
                : await deviceDriver.printReceipt({
                    receipt,
                    copies,
                    paper_width: paperWidth
                });

            await posRepository.createAuditLog({
                user_id: userId,
                entity_type: 'pos_device_receipt',
                entity_id: transactionId,
                action: 'UPDATE',
                changes: {
                    operation: 'print_receipt',
                    reason,
                    copies,
                    paper_width: paperWidth,
                    invoice_number: transaction.invoice_number || null,
                    driver_id: clientDriverId || deviceDriver.id,
                    bridge_result: bridgeResponse?.result || bridgeResponse?.client_result || null
                },
                ...buildAuditMetadata(auditContext)
            });

            const responsePayload = {
                transaction: {
                    pos_transaction_id: transaction.pos_transaction_id,
                    invoice_number: transaction.invoice_number,
                    total_amount: transaction.total_amount
                },
                receipt_contract: receipt.receipt_contract,
                paper_width: paperWidth,
                bridge: bridgeResponse
            };

            await persistOperationReplay({
                posRepository,
                operationKey: POS_DEVICE_OPERATION_KEYS.RECEIPT_PRINT,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: 'processed',
                responsePayload,
                createdBy: userId
            });

            return ok({
                ...responsePayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            try {
                await posRepository.createAuditLog({
                    user_id: userId,
                    entity_type: 'pos_device_receipt',
                    entity_id: transactionId,
                    action: 'UPDATE',
                    changes: {
                        operation: 'print_receipt',
                        reason,
                        copies,
                        paper_width: paperWidth,
                        driver_id: clientDriverId || deviceDriver?.id || null,
                        bridge_result: {
                            success: false,
                            reason_code: error?.details?.reason_code || error?.code || 'RECEIPT_PRINT_FAILED',
                            message: error?.message || 'Receipt print failed'
                        }
                    },
                    ...buildAuditMetadata(auditContext)
                });
            } catch {
                // Print failure evidence is best effort and must not hide the
                // original hardware/domain error.
            }
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_DEVICE_OPERATION_KEYS.RECEIPT_PRINT,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: 'blocked',
                    responsePayload: serializeReplayFailure(error),
                    createdBy: userId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to print POS receipt'));
        }
    };
};

export const buildPrintPosShiftSummaryUseCase = ({ posRepository, deviceDriver }) => {
    return async ({ shiftId: rawShiftId, payload = {}, user, auditContext = {} } = {}) => {
        const userId = parsePositiveInt(user?.user_id);
        const shiftId = parsePositiveInt(rawShiftId);
        const copies = Math.max(1, Math.min(Number.parseInt(payload?.copies, 10) || 1, 3));
        const paperWidth = payload?.paper_width === '57mm' ? '57mm' : '80mm';
        const reason = String(payload?.reason || '').trim() || 'shift_close_report';
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const clientDriverId = String(payload?.client_driver_id || '').trim() || null;
        const clientResult = (clientDriverId && payload?.client_result && typeof payload.client_result === 'object')
            ? payload.client_result
            : null;

        if (!userId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!shiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'shift_id must be a positive integer',
                { statusCode: 422 }
            ));
        }

        const requestHash = hashPayload({
            shift_id: shiftId,
            copies,
            paper_width: paperWidth,
            reason,
            client_driver_id: clientDriverId
        });

        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_DEVICE_OPERATION_KEYS.SHIFT_SUMMARY_PRINT,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const shift = toSerializable(await posRepository.getTerminalShiftById(shiftId));
            if (!shift) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Terminal shift not found: ${shiftId}`,
                    { statusCode: 404 }
                );
            }
            if (String(shift.status || '').trim().toLowerCase() !== 'closed') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Shift summary printing is available after the shift is closed',
                    { statusCode: 409 }
                );
            }

            const allSettings = unwrapApplicationResultOrThrow(await getAllSettingsUseCase());
            const shiftSummary = await buildShiftSummaryPayload({
                posRepository,
                shift,
                settings: allSettings
            });
            const bridgeResponse = clientDriverId
                ? {
                    ok: clientResult?.success !== false,
                    delegated: true,
                    driver: clientDriverId,
                    client_result: clientResult
                }
                : await deviceDriver.printShiftSummary({
                    shift_summary: shiftSummary,
                    copies,
                    paper_width: paperWidth
                });

            await posRepository.createAuditLog({
                user_id: userId,
                entity_type: 'pos_device_shift_summary',
                entity_id: shiftId,
                action: 'UPDATE',
                changes: {
                    operation: 'print_shift_summary',
                    reason,
                    copies,
                    paper_width: paperWidth,
                    driver_id: clientDriverId || deviceDriver.id,
                    bridge_result: bridgeResponse?.result || bridgeResponse?.client_result || null
                },
                ...buildAuditMetadata(auditContext)
            });

            const responsePayload = {
                shift_summary: shiftSummary,
                paper_width: paperWidth,
                bridge: bridgeResponse
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_DEVICE_OPERATION_KEYS.SHIFT_SUMMARY_PRINT,
                idempotencyKey,
                requestHash,
                replayStatus: 'processed',
                responsePayload,
                createdBy: userId
            });

            return ok({
                ...responsePayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            try {
                await posRepository.createAuditLog({
                    user_id: userId,
                    entity_type: 'pos_device_shift_summary',
                    entity_id: shiftId,
                    action: 'UPDATE',
                    changes: {
                        operation: 'print_shift_summary',
                        reason,
                        copies,
                        paper_width: paperWidth,
                        driver_id: clientDriverId || deviceDriver?.id || null,
                        bridge_result: {
                            success: false,
                            reason_code: error?.details?.reason_code || error?.code || 'SHIFT_SUMMARY_PRINT_FAILED',
                            message: error?.message || 'Shift summary print failed'
                        }
                    },
                    ...buildAuditMetadata(auditContext)
                });
            } catch {
                // Print failure evidence is best effort and must not hide the
                // original hardware/domain error.
            }
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_DEVICE_OPERATION_KEYS.SHIFT_SUMMARY_PRINT,
                    idempotencyKey,
                    requestHash,
                    replayStatus: 'blocked',
                    responsePayload: serializeReplayFailure(error),
                    createdBy: userId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to print shift sales summary'));
        }
    };
};

export const buildPrintPosZReadingUseCase = ({ posRepository, deviceDriver }) => {
    return async ({ businessDateInput, locationId: rawLocationId, payload = {}, user, auditContext = {} } = {}) => {
        const userId = parsePositiveInt(user?.user_id);
        const businessDate = normalizeBusinessDate(businessDateInput);
        const locationId = parsePositiveInt(rawLocationId);
        const copies = Math.max(1, Math.min(Number.parseInt(payload?.copies, 10) || 1, 3));
        const paperWidth = payload?.paper_width === '57mm' ? '57mm' : '80mm';
        const reason = String(payload?.reason || '').trim() || 'z_reading_close_day';
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const clientDriverId = String(payload?.client_driver_id || '').trim() || null;
        const clientResult = (clientDriverId && payload?.client_result && typeof payload.client_result === 'object')
            ? payload.client_result
            : null;

        if (!userId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!businessDate) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'business_date must be in YYYY-MM-DD format',
                { statusCode: 422 }
            ));
        }
        if (!locationId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'location_id must be a positive integer',
                { statusCode: 422 }
            ));
        }

        const requestHash = hashPayload({
            business_date: businessDate,
            location_id: locationId,
            copies,
            paper_width: paperWidth,
            reason,
            client_driver_id: clientDriverId
        });

        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_DEVICE_OPERATION_KEYS.Z_READING_PRINT,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const snapshot = toSerializable(
                await posRepository.getLatestZReadingSnapshotByBusinessDate(businessDate, { locationId })
            );
            if (!snapshot) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Close Day must be completed before printing the Z-reading.',
                    { statusCode: 409, details: { reason_code: 'Z_READING_NOT_CLOSED' } }
                );
            }

            const allSettings = unwrapApplicationResultOrThrow(await getAllSettingsUseCase());
            const snapshotSummary = parseJsonObject(snapshot.summary);
            const zReading = {
                business: buildBusinessSettings(allSettings),
                z_reading: {
                    pos_z_reading_snapshot_id: snapshot.pos_z_reading_snapshot_id || null,
                    business_date: snapshot.business_date || businessDate,
                    location_id: snapshot.location_id || locationId,
                    reading_identifier: snapshot.reading_identifier || null,
                    generated_at: snapshot.generated_at || snapshot.created_at || null,
                    summary: {
                        ...snapshotSummary,
                        payment_breakdown: normalizePosPaymentBreakdown(
                            snapshotSummary?.payment_breakdown
                        )
                    },
                    z_counter_value: Number.parseInt(snapshot.z_counter_value || 0, 10),
                    reset_counter_value: Number.parseInt(snapshot.reset_counter_value || 0, 10),
                    lifetime_grand_total_cents: Number.parseInt(snapshot.lifetime_grand_total_cents || 0, 10)
                }
            };
            const bridgeResponse = clientDriverId
                ? {
                    ok: clientResult?.success !== false,
                    delegated: true,
                    driver: clientDriverId,
                    client_result: clientResult
                }
                : await deviceDriver.printZReading({
                    z_reading: zReading,
                    copies,
                    paper_width: paperWidth
                });

            await posRepository.createAuditLog({
                user_id: userId,
                entity_type: 'pos_device_z_reading',
                entity_id: snapshot.pos_z_reading_snapshot_id || null,
                action: 'UPDATE',
                changes: {
                    operation: 'print_z_reading',
                    business_date: businessDate,
                    location_id: locationId,
                    reason,
                    copies,
                    paper_width: paperWidth,
                    driver_id: clientDriverId || deviceDriver.id,
                    bridge_result: bridgeResponse?.result || bridgeResponse?.client_result || null
                },
                ...buildAuditMetadata(auditContext)
            });

            const responsePayload = {
                z_reading: zReading,
                paper_width: paperWidth,
                bridge: bridgeResponse
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_DEVICE_OPERATION_KEYS.Z_READING_PRINT,
                idempotencyKey,
                requestHash,
                replayStatus: 'processed',
                responsePayload,
                createdBy: userId
            });

            return ok({
                ...responsePayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            try {
                await posRepository.createAuditLog({
                    user_id: userId,
                    entity_type: 'pos_device_z_reading',
                    entity_id: null,
                    action: 'UPDATE',
                    changes: {
                        operation: 'print_z_reading',
                        business_date: businessDate,
                        location_id: locationId,
                        reason,
                        copies,
                        paper_width: paperWidth,
                        driver_id: clientDriverId || deviceDriver?.id || null,
                        bridge_result: {
                            success: false,
                            reason_code: error?.details?.reason_code || error?.code || 'Z_READING_PRINT_FAILED',
                            message: error?.message || 'Z-reading print failed'
                        }
                    },
                    ...buildAuditMetadata(auditContext)
                });
            } catch {
                // Print failure evidence is best effort and must not hide the
                // original hardware/domain error.
            }
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_DEVICE_OPERATION_KEYS.Z_READING_PRINT,
                    idempotencyKey,
                    requestHash,
                    replayStatus: 'blocked',
                    responsePayload: serializeReplayFailure(error),
                    createdBy: userId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to print Z-reading'));
        }
    };
};

export const buildOpenPosDrawerUseCase = ({ posRepository, deviceDriver }) => {
    return async ({ payload, user, auditContext = {} }) => {
        const userId = parsePositiveInt(user?.user_id);
        const shiftId = parsePositiveInt(payload?.shift_id);
        const transactionId = payload?.transaction_id == null ? null : parsePositiveInt(payload?.transaction_id);
        const terminalId = String(payload?.terminal_id || '').trim() || null;
        const reason = String(payload?.reason || '').trim();
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        // See buildPrintPosReceiptUseCase above — same client-delegation contract.
        const clientDriverId = String(payload?.client_driver_id || '').trim() || null;
        const clientResult = (clientDriverId && payload?.client_result && typeof payload.client_result === 'object')
            ? payload.client_result
            : null;

        if (!userId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!shiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'shift_id must be a positive integer',
                { statusCode: 422 }
            ));
        }
        if (payload?.transaction_id != null && !transactionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'transaction_id must be a positive integer when provided',
                { statusCode: 422 }
            ));
        }
        if (reason.length < 3) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'reason is required and must be at least 3 characters',
                { statusCode: 422 }
            ));
        }

        const replayRequestHash = hashPayload({
            shift_id: shiftId,
            transaction_id: transactionId,
            terminal_id: terminalId,
            reason,
            client_driver_id: clientDriverId
        });

        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_DEVICE_OPERATION_KEYS.DRAWER_OPEN,
                idempotencyKey,
                requestHash: replayRequestHash
            });
            if (replay) {
                return ok(replay);
            }

            const shift = toSerializable(await posRepository.getTerminalShiftById(shiftId));
            if (!shift || shift.status !== 'open') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Cash drawer opening requires an open shift',
                    { statusCode: 422 }
                );
            }
            if (terminalId && shift.terminal_id && terminalId !== shift.terminal_id) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    `Shift ${shiftId} belongs to terminal ${shift.terminal_id}, not ${terminalId}`,
                    { statusCode: 409 }
                );
            }
            if (transactionId) {
                const transaction = await posRepository.getTransactionById(transactionId);
                if (!transaction) {
                    throw new DomainError(
                        DomainErrorCode.RESOURCE_NOT_FOUND,
                        `POS transaction not found: ${transactionId}`,
                        { statusCode: 404 }
                    );
                }
            }

            const bridgeResponse = clientDriverId
                ? {
                    ok: clientResult?.success !== false,
                    delegated: true,
                    driver: clientDriverId,
                    client_result: clientResult
                }
                : await deviceDriver.openDrawer({
                    shift_id: shiftId,
                    terminal_id: shift.terminal_id || terminalId,
                    transaction_id: transactionId,
                    reason
                });

            await posRepository.createAuditLog({
                user_id: userId,
                entity_type: 'pos_device_drawer',
                entity_id: shiftId,
                action: 'UPDATE',
                changes: {
                    operation: 'open_drawer',
                    reason,
                    terminal_id: shift.terminal_id || terminalId,
                    transaction_id: transactionId,
                    driver_id: clientDriverId || deviceDriver.id,
                    bridge_result: bridgeResponse?.result || bridgeResponse?.client_result || null
                },
                ...buildAuditMetadata(auditContext)
            });

            const responsePayload = {
                shift: {
                    pos_terminal_shift_id: shift.pos_terminal_shift_id,
                    terminal_id: shift.terminal_id,
                    location_id: shift.location_id,
                    status: shift.status
                },
                bridge: bridgeResponse
            };

            await persistOperationReplay({
                posRepository,
                operationKey: POS_DEVICE_OPERATION_KEYS.DRAWER_OPEN,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: 'processed',
                responsePayload,
                createdBy: userId
            });

            return ok({
                ...responsePayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_DEVICE_OPERATION_KEYS.DRAWER_OPEN,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: 'blocked',
                    responsePayload: serializeReplayFailure(error),
                    createdBy: userId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to open POS cash drawer'));
        }
    };
};
