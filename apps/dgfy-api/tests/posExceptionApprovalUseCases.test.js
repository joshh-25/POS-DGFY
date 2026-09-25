import crypto from 'crypto';
import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildDecidePosExceptionApprovalUseCase } from '../src/modules/pos/usecases/posExceptionApprovalUseCases.js';

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

const buildTransaction = () => {
    const callbacks = [];
    const transaction = {
        finished: false,
        LOCK: { UPDATE: 'UPDATE' },
        afterCommit: jest.fn((callback) => callbacks.push(callback)),
        commit: jest.fn(async () => {
            transaction.finished = 'commit';
            await Promise.all(callbacks.map((callback) => callback()));
        }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; })
    };
    return transaction;
};

const approvalFixture = ({ actionType = 'pos_void', entityId = 73, payload = null, requestedBy = 10 } = {}) => {
    const requestPayload = payload || (actionType === 'pos_void'
        ? { transaction_id: entityId, requested_by: requestedBy, reason: 'Duplicate transaction', location_id: 3 }
        : { parked_sale_id: entityId, requested_by: requestedBy, reason: 'Customer cancelled', location_id: 3, previous_status: 'claimed' });
    return {
        business_admin_approval_request_id: 501,
        action_type: actionType,
        entity_type: actionType === 'pos_void' ? 'pos_transaction' : 'pos_parked_sale',
        entity_id: entityId,
        requested_by: requestedBy,
        payload: requestPayload,
        payload_hash: hashPayload(requestPayload),
        reason: requestPayload.reason,
        status: 'pending'
    };
};

const runInTenant = (sequelize, callback) => dbStore.run({ sequelize, tenantId: 'test-tenant' }, callback);

const buildHarness = (approval) => {
    const transaction = buildTransaction();
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };
    let currentApproval = approval;
    const posRepository = {
        getBusinessAdminApprovalRequestById: jest.fn().mockResolvedValue(approval),
        updateBusinessAdminApprovalRequest: jest.fn(async (_id, updates) => {
            currentApproval = { ...currentApproval, ...updates };
            return currentApproval;
        }),
        getParkedSaleById: jest.fn(),
        updateParkedSale: jest.fn(async (id, updates) => ({ pos_parked_sale_id: id, ...updates })),
        createAuditLog: jest.fn().mockResolvedValue(undefined)
    };
    return { transaction, sequelize, posRepository };
};

describe('POS Back Office high-risk approval execution', () => {
    it('executes an approved void through the canonical POS use case in the approval transaction', async () => {
        const approval = approvalFixture();
        const harness = buildHarness(approval);
        const voidPosTransactionUseCase = jest.fn().mockResolvedValue({ success: true, data: { transaction: { status: 'voided' } } });
        const useCase = buildDecidePosExceptionApprovalUseCase({
            posRepository: harness.posRepository,
            voidPosTransactionUseCase
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            approvalRequestId: approval.business_admin_approval_request_id,
            decision: 'approve',
            user: { user_id: 99 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.approval_request.status).toBe('executed');
        expect(voidPosTransactionUseCase).toHaveBeenCalledWith(expect.objectContaining({
            posTransactionId: approval.entity_id,
            transaction: harness.transaction,
            payload: expect.objectContaining({ reason: approval.reason }),
            approvalExecution: expect.objectContaining({
                action_type: 'pos_void',
                status: 'approved',
                requested_by: approval.requested_by,
                approved_by: 99
            })
        }));
        expect(harness.transaction.commit).toHaveBeenCalledTimes(1);
        expect(harness.transaction.rollback).not.toHaveBeenCalled();
    });

    it('rejects a parked-sale cancellation, restores its prior claim, and does not touch inventory', async () => {
        const approval = approvalFixture({ actionType: 'pos_parked_sale_cancel', entityId: 81 });
        const harness = buildHarness(approval);
        harness.posRepository.getParkedSaleById.mockResolvedValue({
            pos_parked_sale_id: 81,
            status: 'cancel_pending',
            location_id: 3
        });
        const reverseParkedSaleGoodsIssue = jest.fn();
        const useCase = buildDecidePosExceptionApprovalUseCase({
            posRepository: harness.posRepository,
            inventoryCommandService: { reverseParkedSaleGoodsIssue }
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            approvalRequestId: approval.business_admin_approval_request_id,
            decision: 'reject',
            note: 'Sale should remain available',
            user: { user_id: 99 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.approval_request.status).toBe('rejected');
        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(81, { status: 'claimed' }, expect.any(Object));
        expect(reverseParkedSaleGoodsIssue).not.toHaveBeenCalled();
        expect(harness.posRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'pos_parked_sale_cancellation_rejected',
            reason: approval.reason,
            changes: expect.objectContaining({ inventory_unchanged: true })
        }), expect.any(Object));
    });

    it('restores parked-sale stock only after approval and publishes the stock refresh after commit', async () => {
        const approval = approvalFixture({ actionType: 'pos_parked_sale_cancel', entityId: 82 });
        const harness = buildHarness(approval);
        harness.posRepository.getParkedSaleById.mockResolvedValue({
            pos_parked_sale_id: 82,
            status: 'cancel_pending',
            location_id: 3,
            inventory_deducted_at: new Date()
        });
        const reverseParkedSaleGoodsIssue = jest.fn().mockResolvedValue([{ item_id: 7, location_id: 3 }]);
        const publishCatalogChange = jest.fn().mockResolvedValue(undefined);
        const useCase = buildDecidePosExceptionApprovalUseCase({
            posRepository: harness.posRepository,
            inventoryCommandService: { reverseParkedSaleGoodsIssue },
            publishCatalogChange
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            approvalRequestId: approval.business_admin_approval_request_id,
            decision: 'approve',
            user: { user_id: 99 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.approval_request.status).toBe('executed');
        expect(reverseParkedSaleGoodsIssue).toHaveBeenCalledWith({
            parked_sale_id: 82,
            reason: `Approved parked-sale cancellation: ${approval.reason}`
        }, 99, harness.transaction);
        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(82, expect.objectContaining({
            status: 'cancelled',
            cancelled_by: 99,
            cancel_reason: approval.reason
        }), expect.any(Object));
        expect(publishCatalogChange).toHaveBeenCalledWith({
            tenantId: 'test-tenant',
            reason: 'pos_parked_sale_cancelled',
            itemIds: [7]
        });
    });

    it('blocks the requester from approving or rejecting their own request', async () => {
        const approval = approvalFixture();
        const harness = buildHarness(approval);
        const useCase = buildDecidePosExceptionApprovalUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            approvalRequestId: approval.business_admin_approval_request_id,
            decision: 'approve',
            user: { user_id: approval.requested_by }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'BUSINESS_ADMIN_APPROVAL_SELF_REVIEW_BLOCKED' }));
        expect(harness.posRepository.updateBusinessAdminApprovalRequest).not.toHaveBeenCalled();
        expect(harness.transaction.rollback).toHaveBeenCalledTimes(1);
    });
});
