import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';

const toPositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

const normalizeApprovalPayload = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const beginTransaction = async () => {
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    if (!sequelize || typeof sequelize.transaction !== 'function') throw new Error('Tenant sequelize transaction is unavailable');
    return sequelize.transaction();
};

const assertApprovalPayloadIntegrity = (approval) => {
    const payload = normalizeApprovalPayload(approval?.payload);
    if (!payload || !approval?.payload_hash || hashPayload(payload) !== String(approval.payload_hash)) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Approval request evidence does not match its recorded payload hash.',
            { statusCode: 409, details: { reason_code: 'BUSINESS_ADMIN_APPROVAL_PAYLOAD_HASH_MISMATCH' } }
        );
    }
    if (String(payload.reason || '').trim() !== String(approval.reason || '').trim()) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Approval reason does not match its immutable request payload.',
            { statusCode: 409, details: { reason_code: 'BUSINESS_ADMIN_APPROVAL_REASON_MISMATCH' } }
        );
    }
    return payload;
};

const assertApprovalTargetIntegrity = (approval, payload) => {
    const expectedEntityType = approval.action_type === 'pos_void' ? 'pos_transaction' : 'pos_parked_sale';
    const payloadEntityId = approval.action_type === 'pos_void'
        ? toPositiveInt(payload.transaction_id)
        : toPositiveInt(payload.parked_sale_id);
    if (approval.entity_type !== expectedEntityType
        || payloadEntityId !== toPositiveInt(approval.entity_id)
        || toPositiveInt(payload.requested_by) !== toPositiveInt(approval.requested_by)) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Approval target does not match its immutable request evidence.',
            { statusCode: 409, details: { reason_code: 'BUSINESS_ADMIN_APPROVAL_TARGET_MISMATCH' } }
        );
    }
};

const POS_APPROVAL_STATUS_VALUES = new Set([
    'pending',
    'approved',
    'rejected',
    'executed',
    'expired',
    'cancelled'
]);

const POS_APPROVAL_ACTION_TYPES = Object.freeze([
    'pos_void',
    'pos_parked_sale_cancel'
]);

const normalizeApprovalListLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return 100;
    return Math.min(parsed, 100);
};

export const buildListPosExceptionApprovalsUseCase = ({ posRepository }) => async ({ query = {} } = {}) => {
    try {
        const requestedStatus = String(query?.status || 'pending').trim().toLowerCase();
        const status = POS_APPROVAL_STATUS_VALUES.has(requestedStatus) ? requestedStatus : 'pending';
        const approvals = await posRepository.listBusinessAdminApprovalRequests({
            actionTypes: POS_APPROVAL_ACTION_TYPES,
            status,
            limit: normalizeApprovalListLimit(query?.limit)
        });

        return ok({
            approvals: Array.isArray(approvals) ? approvals : [],
            count: Array.isArray(approvals) ? approvals.length : 0,
            status
        });
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Failed to list POS approval requests'));
    }
};

export const buildDecidePosExceptionApprovalUseCase = ({
    posRepository,
    inventoryCommandService,
    voidPosTransactionUseCase,
    publishCatalogChange = null
}) => async ({ approvalRequestId, decision, note = '', user = {} } = {}) => {
    const normalizedId = toPositiveInt(approvalRequestId);
    const reviewerId = toPositiveInt(user?.user_id);
    const normalizedDecision = String(decision || '').trim().toLowerCase();
    const approvalNote = String(note || '').trim().slice(0, 500) || null;
    if (!normalizedId || !reviewerId || !['approve', 'reject'].includes(normalizedDecision)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid approval request, reviewer, and decision are required.', { statusCode: 422 }));
    }

    const transaction = await beginTransaction();
    try {
        const approval = await posRepository.getBusinessAdminApprovalRequestById(normalizedId, { transaction, lock: true });
        if (!approval) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Approval request was not found.', { statusCode: 404 });
        if (!['pos_void', 'pos_parked_sale_cancel'].includes(approval.action_type)) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'This approval action has no enabled canonical POS execution handler.',
                { statusCode: 409, details: { reason_code: 'POS_APPROVAL_ACTION_UNSUPPORTED', action_type: approval.action_type } }
            );
        }
        if (Number(approval.requested_by) === reviewerId) {
            throw new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'The requester cannot approve or reject their own high-risk POS request.',
                { statusCode: 403, details: { reason_code: 'BUSINESS_ADMIN_APPROVAL_SELF_REVIEW_BLOCKED' } }
            );
        }
        if (approval.status === 'executed' || approval.status === 'rejected') {
            await transaction.commit();
            return ok({ approval_request: approval, idempotent_replay: true }, `POS approval request already ${approval.status}`);
        }
        if (approval.status !== 'pending') {
            throw new DomainError(DomainErrorCode.CONFLICT, 'This approval request is no longer pending.', { statusCode: 409 });
        }
        const payload = assertApprovalPayloadIntegrity(approval);
        assertApprovalTargetIntegrity(approval, payload);
        if (payload.item_void === true && (!Array.isArray(payload.voided_lines) || payload.voided_lines.length === 0)) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'Item-level void approval is missing its selected transaction lines.',
                { statusCode: 409, details: { reason_code: 'POS_ITEM_VOID_APPROVAL_LINES_MISSING' } }
            );
        }
        const now = new Date();
        if (normalizedDecision === 'reject') {
            const rejected = await posRepository.updateBusinessAdminApprovalRequest(normalizedId, {
                status: 'rejected',
                rejected_by: reviewerId,
                rejected_at: now,
                approval_note: approvalNote
            }, { transaction, lock: true });
            if (approval.action_type === 'pos_parked_sale_cancel') {
                const parkedSale = await posRepository.getParkedSaleById(approval.entity_id, { transaction, lock: true });
                if (!parkedSale || parkedSale.status !== 'cancel_pending') {
                    throw new DomainError(DomainErrorCode.CONFLICT, 'Parked sale changed before its cancellation request was rejected.', { statusCode: 409 });
                }
                const previousStatus = ['parked', 'claimed'].includes(String(payload.previous_status || '').toLowerCase())
                    ? payload.previous_status
                    : 'parked';
                await posRepository.updateParkedSale(parkedSale.pos_parked_sale_id, { status: previousStatus }, { transaction, lock: true });
                await posRepository.createAuditLog({
                    user_id: reviewerId,
                    entity_type: 'pos_parked_sale',
                    entity_id: parkedSale.pos_parked_sale_id,
                    action: 'UPDATE',
                    event_type: 'pos_parked_sale_cancellation_rejected',
                    location_id: parkedSale.location_id || null,
                    reason: approval.reason,
                    changes: {
                        event: 'pos_parked_sale_cancellation_rejected',
                        approval_request_id: normalizedId,
                        requested_by: approval.requested_by,
                        rejected_by: reviewerId,
                        reason: approval.reason,
                        approval_note: approvalNote,
                        restored_status: previousStatus,
                        inventory_unchanged: true
                    }
                }, { transaction });
            } else {
                await posRepository.createAuditLog({
                    user_id: reviewerId,
                    entity_type: 'pos_transaction',
                    entity_id: approval.entity_id,
                    action: 'UPDATE',
                    event_type: 'pos_transaction_void_rejected',
                    location_id: payload.location_id || null,
                    reason: approval.reason,
                    changes: {
                        event: 'pos_transaction_void_rejected',
                        approval_request_id: normalizedId,
                        requested_by: approval.requested_by,
                        rejected_by: reviewerId,
                        reason: approval.reason,
                        approval_note: approvalNote,
                        transaction_unchanged: true,
                        inventory_unchanged: true
                    }
                }, { transaction });
            }
            await transaction.commit();
            return ok({ approval_request: rejected, idempotent_replay: false }, 'POS approval request rejected');
        }

        const approved = await posRepository.updateBusinessAdminApprovalRequest(normalizedId, {
            status: 'approved',
            approved_by: reviewerId,
            approved_at: now,
            approval_note: approvalNote
        }, { transaction, lock: true });

        if (approval.action_type === 'pos_void') {
            if (typeof voidPosTransactionUseCase !== 'function') {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Canonical POS void execution is unavailable.', { statusCode: 503 });
            }
            const execution = await voidPosTransactionUseCase({
                posTransactionId: approval.entity_id,
                payload: {
                    reason: approval.reason,
                    idempotency_key: payload.item_void === true
                        ? `pos-item-void-approval:${normalizedId}`
                        : `pos-void-approval:${normalizedId}`,
                    terminal_id: payload.terminal_id || undefined,
                    terminal_location_id: payload.location_id || undefined,
                    expected_status: payload.expected_status || undefined,
                    expected_server_version: payload.expected_server_version || undefined,
                    voided_lines: Array.isArray(payload.voided_lines) ? payload.voided_lines : undefined
                },
                user,
                transaction,
                approvalExecution: {
                    action_type: approval.action_type,
                    status: approved.status,
                    entity_id: approval.entity_id,
                    approval_request_id: normalizedId,
                    requested_by: approval.requested_by,
                    approved_by: reviewerId
                }
            });
            if (execution?.success !== true) throw execution?.error || new Error('Canonical POS void execution failed.');
        } else {
            const parkedSale = await posRepository.getParkedSaleById(approval.entity_id, { transaction, lock: true });
            if (!parkedSale || parkedSale.status !== 'cancel_pending'
                || Number(parkedSale.location_id) !== Number(payload.location_id)) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Parked sale changed before its cancellation was approved.', { statusCode: 409 });
            }
            const reverseParkedSaleGoodsIssue = inventoryCommandService?.reverseParkedSaleGoodsIssue;
            if (parkedSale.inventory_deducted_at && typeof reverseParkedSaleGoodsIssue !== 'function') {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Inventory reversal command is unavailable.', {
                    statusCode: 503,
                    details: { reason_code: 'PARKED_SALE_INVENTORY_REVERSAL_UNAVAILABLE' }
                });
            }
            const reversals = parkedSale.inventory_deducted_at
                ? await reverseParkedSaleGoodsIssue({
                    parked_sale_id: parkedSale.pos_parked_sale_id,
                    reason: `Approved parked-sale cancellation: ${approval.reason}`
                }, reviewerId, transaction)
                : [];
            const cancelled = await posRepository.updateParkedSale(parkedSale.pos_parked_sale_id, {
                status: 'cancelled',
                cancelled_by: reviewerId,
                cancelled_at: now,
                cancel_reason: approval.reason
            }, { transaction, lock: true });
            await posRepository.createAuditLog({
                user_id: reviewerId,
                entity_type: 'pos_parked_sale',
                entity_id: parkedSale.pos_parked_sale_id,
                action: 'UPDATE',
                event_type: 'pos_parked_sale_cancelled',
                location_id: parkedSale.location_id || null,
                reason: approval.reason,
                changes: {
                    event: 'pos_parked_sale_cancelled',
                    approval_request_id: normalizedId,
                    requested_by: approval.requested_by,
                    approved_by: reviewerId,
                    reason: approval.reason,
                    approval_note: approvalNote,
                    restored_inventory_movement_count: Array.isArray(reversals) ? reversals.length : 0
                }
            }, { transaction });
            if (typeof publishCatalogChange === 'function' && Array.isArray(reversals) && reversals.length > 0) {
                const tenantId = String(dbStore.getStore()?.tenantId || '').trim();
                const itemIds = [...new Set(reversals.map((entry) => toPositiveInt(entry.item_id)).filter(Boolean))];
                if (tenantId && itemIds.length > 0 && typeof transaction.afterCommit === 'function') {
                    transaction.afterCommit(async () => {
                        try {
                            await publishCatalogChange({ tenantId, reason: 'pos_parked_sale_cancelled', itemIds });
                        } catch {
                            // The stock transaction is already committed; this is only a cache hint.
                        }
                    });
                }
            }
            if (!cancelled) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Parked sale was not found during cancellation.', { statusCode: 404 });
        }

        const executed = await posRepository.updateBusinessAdminApprovalRequest(normalizedId, {
            status: 'executed',
            executed_at: new Date()
        }, { transaction, lock: true });
        await transaction.commit();
        return ok({ approval_request: executed, idempotent_replay: false }, 'POS approval executed');
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapPosUseCaseError(error, 'Failed to decide POS approval request'));
    }
};
