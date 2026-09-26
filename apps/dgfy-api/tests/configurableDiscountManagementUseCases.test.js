import { describe, expect, it, jest } from '@jest/globals';
import {
    buildCreatePosDiscountRuleUseCase,
    buildDeletePosDiscountRuleUseCase,
    buildListAvailablePosDiscountRulesUseCase,
    buildListPosDiscountRulesUseCase,
    buildUpdatePosDiscountRuleUseCase
} from '../src/modules/pos/usecases/posDiscountConfigurationUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const makeTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() {
        this.finished = 'commit';
    }),
    rollback: jest.fn(async function rollback() {
        this.finished = 'rollback';
    })
});

const buildRepository = (overrides = {}) => ({
    list: jest.fn().mockResolvedValue([]),
    listAvailable: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    findByName: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    updateById: jest.fn(),
    countTransactionReferences: jest.fn().mockResolvedValue(0),
    deleteById: jest.fn(),
    createAuditLog: jest.fn().mockResolvedValue({ log_id: 1 }),
    ...overrides
});

const baseRule = (overrides = {}) => ({
    id: 21,
    discount_key: 'custom-employee-abc123',
    name: 'Employee Discount',
    type: 'custom',
    method: 'percentage',
    rate: '12.0000',
    fixed_amount: null,
    description: 'Staff benefit',
    is_active: false,
    is_approved: false,
    configuration_source: 'admin',
    configuration_version: 1,
    is_vat_exempt: false,
    requires_customer_id: false,
    requires_employee_id: false,
    requires_manager_approval: false,
    max_discount_amount: null,
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
    ...overrides
});

describe('configurable POS discount management use cases', () => {
    it('creates a disabled and unapproved custom percentage rule and audits it', async () => {
        const transaction = makeTransaction();
        const repository = buildRepository({
            create: jest.fn().mockResolvedValue(baseRule({ discount_key: 'custom-employee-abc123' }))
        });
        const useCase = buildCreatePosDiscountRuleUseCase({
            repository,
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            keyFactory: () => 'custom-employee-abc123'
        });

        const result = await useCase({
            actorUserId: 7,
            payload: {
                name: 'Employee Discount',
                percentage: 12,
                description: 'Staff benefit'
            }
        });

        expect(result.success).toBe(true);
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
            type: 'custom',
            method: 'percentage',
            rate: 12,
            is_active: false,
            is_approved: false,
            configuration_version: 1
        }), { transaction });
        expect(repository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 7,
            entity_type: 'pos_discount_rule',
            action: 'CREATE'
        }), { transaction });
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
        expect(result.data.discount_rule).toMatchObject({
            discount_rule_id: 21,
            percentage: 12,
            is_enabled: false,
            is_approved: false
        });
    });

    it('rejects a stale update version without changing the rule', async () => {
        const transaction = makeTransaction();
        const repository = buildRepository({
            findById: jest.fn().mockResolvedValue(baseRule({ configuration_version: 3 }))
        });
        const useCase = buildUpdatePosDiscountRuleUseCase({
            repository,
            beginTransaction: jest.fn().mockResolvedValue(transaction)
        });

        const result = await useCase({
            discountRuleId: 21,
            actorUserId: 7,
            payload: {
                percentage: 10,
                expected_configuration_version: 2
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
        expect(repository.updateById).not.toHaveBeenCalled();
        expect(repository.createAuditLog).not.toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it('updates the percentage and approval/enabled gates atomically', async () => {
        const transaction = makeTransaction();
        const current = baseRule({ configuration_version: 2 });
        const updated = baseRule({
            configuration_version: 3,
            rate: '10.0000',
            is_active: true,
            is_approved: true
        });
        const repository = buildRepository({
            findById: jest.fn().mockResolvedValue(current),
            updateById: jest.fn().mockResolvedValue(updated)
        });
        const useCase = buildUpdatePosDiscountRuleUseCase({
            repository,
            beginTransaction: jest.fn().mockResolvedValue(transaction)
        });

        const result = await useCase({
            discountRuleId: 21,
            actorUserId: 7,
            payload: {
                percentage: 10,
                is_enabled: true,
                is_approved: true,
                expected_configuration_version: 2
            }
        });

        expect(result.success).toBe(true);
        expect(repository.updateById).toHaveBeenCalledWith(21, expect.objectContaining({
            rate: 10,
            is_active: true,
            is_approved: true,
            configuration_source: 'admin',
            configuration_version: 3
        }), { transaction, lock: true });
        expect(repository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'UPDATE',
            changes: expect.objectContaining({
                before: expect.objectContaining({ percentage: 12 }),
                after: expect.objectContaining({ percentage: 10, is_enabled: true, is_approved: true })
            })
        }), { transaction });
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(result.data.discount_rule).toMatchObject({
            percentage: 10,
            is_enabled: true,
            is_approved: true,
            configuration_version: 3
        });
    });

    it('lists disabled and unapproved rules for management visibility', async () => {
        const repository = buildRepository({
            list: jest.fn().mockResolvedValue([
                baseRule(),
                baseRule({ id: 22, name: 'Senior Citizen', type: 'senior', is_active: true, is_approved: true, rate: '20.0000' })
            ])
        });
        const useCase = buildListPosDiscountRulesUseCase({ repository });

        const result = await useCase();

        expect(result.success).toBe(true);
        expect(result.data.discount_rules).toHaveLength(2);
        expect(result.data.discount_rules[0]).toMatchObject({ is_enabled: false, is_approved: false });
        expect(result.data.discount_rules[1]).toMatchObject({ percentage: 20, is_enabled: true, is_approved: true });
    });

    it('lists only the rules exposed to POS transactions', async () => {
        const repository = buildRepository({
            listAvailable: jest.fn().mockResolvedValue([
                baseRule({
                    id: 21,
                    is_active: true,
                    is_approved: true,
                    rate: '12.0000'
                })
            ])
        });
        const useCase = buildListAvailablePosDiscountRulesUseCase({ repository });

        const result = await useCase();

        expect(result.success).toBe(true);
        expect(repository.listAvailable).toHaveBeenCalledTimes(1);
        expect(result.data.discount_rules).toEqual([
            expect.objectContaining({
                discount_rule_id: 21,
                percentage: 12,
                is_enabled: true,
                is_approved: true
            })
        ]);
    });

    it('deletes an unused rule and audits the deletion', async () => {
        const transaction = makeTransaction();
        const current = baseRule({ configuration_version: 4 });
        const repository = buildRepository({
            findById: jest.fn().mockResolvedValue(current),
            countTransactionReferences: jest.fn().mockResolvedValue(0),
            deleteById: jest.fn().mockResolvedValue(current)
        });
        const useCase = buildDeletePosDiscountRuleUseCase({
            repository,
            beginTransaction: jest.fn().mockResolvedValue(transaction)
        });

        const result = await useCase({
            discountRuleId: 21,
            actorUserId: 7,
            auditContext: { request_id: 'request-1' }
        });

        expect(result.success).toBe(true);
        expect(repository.countTransactionReferences).toHaveBeenCalledWith(21, { transaction });
        expect(repository.deleteById).toHaveBeenCalledWith(21, { transaction, lock: true });
        expect(repository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 7,
            entity_type: 'pos_discount_rule',
            action: 'DELETE',
            changes: expect.objectContaining({
                operation: 'delete',
                before: expect.objectContaining({ discount_rule_id: 21 }),
                after: null
            })
        }), { transaction });
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(result.data).toEqual({ discount_rule_id: 21, deleted: true });
    });

    it('blocks deletion when a rule is referenced by a transaction', async () => {
        const transaction = makeTransaction();
        const repository = buildRepository({
            findById: jest.fn().mockResolvedValue(baseRule()),
            countTransactionReferences: jest.fn().mockResolvedValue(2)
        });
        const useCase = buildDeletePosDiscountRuleUseCase({
            repository,
            beginTransaction: jest.fn().mockResolvedValue(transaction)
        });

        const result = await useCase({
            discountRuleId: 21,
            actorUserId: 7
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
        expect(result.error.message).toMatch(/set it to inactive/i);
        expect(repository.deleteById).not.toHaveBeenCalled();
        expect(repository.createAuditLog).not.toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });
});
