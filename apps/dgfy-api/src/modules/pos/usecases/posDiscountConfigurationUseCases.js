import crypto from 'node:crypto';
import dbStore from '../../../utils/dbStore.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';

const MAX_PERCENTAGE = 100;

const toPlain = (value) => {
    if (!value) return null;
    if (typeof value.get === 'function') return value.get({ plain: true });
    if (typeof value.toJSON === 'function') return value.toJSON();
    return { ...value };
};

const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
};

const normalizeName = (value) => String(value || '').trim();

const normalizeDescription = (value) => {
    const normalized = String(value ?? '').trim();
    return normalized || null;
};

const normalizePercentage = (value) => {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > MAX_PERCENTAGE) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Discount percentage must be between 0 and 100.',
            { statusCode: 422 }
        );
    }
    return Math.round(normalized * 10000) / 10000;
};

const requirePositiveInteger = (value, label) => {
    const normalized = Number.parseInt(value, 10);
    if (!Number.isInteger(normalized) || normalized <= 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `${label} must be a positive integer.`,
            { statusCode: 422 }
        );
    }
    return normalized;
};

const requireConfigurationVersion = (value) => {
    const normalized = Number.parseInt(value, 10);
    if (!Number.isInteger(normalized) || normalized < 1) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'expected_configuration_version must be a positive integer.',
            { statusCode: 422 }
        );
    }
    return normalized;
};

const createCustomDiscountKey = (name) => {
    const slug = normalizeName(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'discount';
    const suffix = crypto.randomBytes(6).toString('hex');
    return `custom-${slug}-${suffix}`.slice(0, 80);
};

export const serializePosDiscountRule = (value) => {
    const rule = toPlain(value);
    if (!rule) return null;

    return {
        discount_rule_id: Number(rule.id),
        discount_key: String(rule.discount_key || '').trim(),
        name: String(rule.name || '').trim(),
        type: String(rule.type || '').trim(),
        method: String(rule.method || '').trim(),
        percentage: rule.method === 'percentage' ? toNumberOrNull(rule.rate) : null,
        fixed_amount: rule.method === 'fixed' ? toNumberOrNull(rule.fixed_amount) : null,
        description: rule.description || null,
        is_enabled: rule.is_active === true,
        is_approved: rule.is_approved === true,
        configuration_source: String(rule.configuration_source || 'governed').trim(),
        configuration_version: Number(rule.configuration_version || 1),
        is_vat_exempt: rule.is_vat_exempt === true,
        requires_customer_id: rule.requires_customer_id === true,
        requires_employee_id: rule.requires_employee_id === true,
        requires_manager_approval: rule.requires_manager_approval === true,
        max_discount_amount: toNumberOrNull(rule.max_discount_amount),
        created_at: rule.created_at || null,
        updated_at: rule.updated_at || null
    };
};

const mapError = (error, fallbackMessage) => {
    if (isDomainError(error)) return error;
    if (error?.name === 'SequelizeUniqueConstraintError') {
        return new DomainError(
            DomainErrorCode.CONFLICT,
            'The discount configuration key is already in use. Please retry the operation.',
            { statusCode: 409 }
        );
    }
    return new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        fallbackMessage,
        { statusCode: 500, cause: error }
    );
};

const defaultBeginTransaction = async () => {
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    if (!sequelize?.transaction) {
        throw new Error('Tenant transaction context is unavailable');
    }
    return sequelize.transaction();
};

const rollbackIfOpen = async (transaction) => {
    if (transaction && !transaction.finished) await transaction.rollback();
};

const auditContextPayload = (auditContext = {}) => ({
    request_id: auditContext.request_id || null,
    actor_username: auditContext.actor_username || null,
    ip_address: auditContext.ip_address || null,
    user_agent: auditContext.user_agent || null
});

const ensureDistinctName = async ({ repository, name, excludeId, transaction }) => {
    const duplicate = await repository.findByName(name, {
        excludeId,
        transaction,
        lock: true
    });
    if (duplicate) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'A discount with this name already exists.',
            { statusCode: 409, details: { field: 'name' } }
        );
    }
};

export const buildListPosDiscountRulesUseCase = ({ repository }) => async () => {
    try {
        const rows = await repository.list();
        return ok({ discount_rules: rows.map(serializePosDiscountRule) });
    } catch (error) {
        return fail(mapError(error, 'Failed to load discount configurations.'));
    }
};

export const buildListAvailablePosDiscountRulesUseCase = ({ repository }) => async () => {
    try {
        const rows = await repository.listAvailable();
        return ok({ discount_rules: rows.map(serializePosDiscountRule) });
    } catch (error) {
        return fail(mapError(error, 'Failed to load available discount configurations.'));
    }
};

export const buildCreatePosDiscountRuleUseCase = ({
    repository,
    beginTransaction = defaultBeginTransaction,
    keyFactory = createCustomDiscountKey
}) => async ({ payload = {}, actorUserId, auditContext = {} } = {}) => {
    let transaction = null;
    try {
        const normalizedActorUserId = requirePositiveInteger(actorUserId, 'actorUserId');
        const name = normalizeName(payload.name);
        if (!name) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Discount name is required.',
                { statusCode: 422 }
            );
        }

        const percentage = normalizePercentage(payload.percentage);
        transaction = await beginTransaction();
        await ensureDistinctName({ repository, name, transaction });

        const created = await repository.create({
            discount_key: keyFactory(name),
            name,
            type: 'custom',
            method: 'percentage',
            rate: percentage,
            fixed_amount: null,
            description: normalizeDescription(payload.description),
            is_vat_exempt: false,
            requires_customer_id: false,
            requires_employee_id: false,
            requires_manager_approval: false,
            max_discount_amount: null,
            is_active: payload.is_enabled === true,
            is_approved: payload.is_approved === true,
            configuration_source: 'admin',
            configuration_version: 1
        }, { transaction });

        const serialized = serializePosDiscountRule(created);
        await repository.createAuditLog({
            ...auditContextPayload(auditContext),
            user_id: normalizedActorUserId,
            entity_type: 'pos_discount_rule',
            entity_id: serialized.discount_rule_id,
            action: 'CREATE',
            event_type: 'pos_discount_rule_configuration',
            changes: {
                event: 'pos_discount_rule_configuration',
                operation: 'create',
                after: serialized
            }
        }, { transaction });

        await transaction.commit();
        return ok({ discount_rule: serialized });
    } catch (error) {
        await rollbackIfOpen(transaction);
        return fail(mapError(error, 'Failed to create discount configuration.'));
    }
};

export const buildUpdatePosDiscountRuleUseCase = ({
    repository,
    beginTransaction = defaultBeginTransaction
}) => async ({ discountRuleId, payload = {}, actorUserId, auditContext = {} } = {}) => {
    let transaction = null;
    try {
        const normalizedRuleId = requirePositiveInteger(discountRuleId, 'discountRuleId');
        const normalizedActorUserId = requirePositiveInteger(actorUserId, 'actorUserId');
        const expectedVersion = requireConfigurationVersion(payload.expected_configuration_version);

        transaction = await beginTransaction();
        const current = await repository.findById(normalizedRuleId, { transaction, lock: true });
        if (!current) {
            throw new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                'Discount configuration was not found.',
                { statusCode: 404 }
            );
        }

        const currentVersion = Number(current.configuration_version || 1);
        if (currentVersion !== expectedVersion) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'Discount configuration changed since it was loaded. Refresh and try again.',
                {
                    statusCode: 409,
                    details: {
                        expected_configuration_version: expectedVersion,
                        current_configuration_version: currentVersion
                    }
                }
            );
        }

        const updates = {};
        if (payload.name !== undefined) {
            const name = normalizeName(payload.name);
            if (!name) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Discount name cannot be empty.',
                    { statusCode: 422 }
                );
            }
            await ensureDistinctName({
                repository,
                name,
                excludeId: normalizedRuleId,
                transaction
            });
            updates.name = name;
        }
        if (payload.percentage !== undefined) {
            if (current.method !== 'percentage') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Fixed-amount discount rules cannot be edited with a percentage.',
                    { statusCode: 422 }
                );
            }
            updates.rate = normalizePercentage(payload.percentage);
        }
        if (payload.description !== undefined) updates.description = normalizeDescription(payload.description);
        if (payload.is_enabled !== undefined) updates.is_active = payload.is_enabled === true;
        if (payload.is_approved !== undefined) updates.is_approved = payload.is_approved === true;

        if (Object.keys(updates).length === 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'At least one discount field must be changed.',
                { statusCode: 422 }
            );
        }

        const updated = await repository.updateById(normalizedRuleId, {
            ...updates,
            configuration_source: 'admin',
            configuration_version: currentVersion + 1
        }, { transaction, lock: true });
        if (!updated) {
            throw new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                'Discount configuration was not found.',
                { statusCode: 404 }
            );
        }

        const serializedBefore = serializePosDiscountRule(current);
        const serializedAfter = serializePosDiscountRule(updated);
        await repository.createAuditLog({
            ...auditContextPayload(auditContext),
            user_id: normalizedActorUserId,
            entity_type: 'pos_discount_rule',
            entity_id: normalizedRuleId,
            action: 'UPDATE',
            event_type: 'pos_discount_rule_configuration',
            changes: {
                event: 'pos_discount_rule_configuration',
                operation: 'update',
                before: serializedBefore,
                after: serializedAfter
            }
        }, { transaction });

        await transaction.commit();
        return ok({ discount_rule: serializedAfter });
    } catch (error) {
        await rollbackIfOpen(transaction);
        return fail(mapError(error, 'Failed to update discount configuration.'));
    }
};

export const buildDeletePosDiscountRuleUseCase = ({
    repository,
    beginTransaction = defaultBeginTransaction
}) => async ({ discountRuleId, actorUserId, auditContext = {} } = {}) => {
    let transaction = null;
    try {
        const normalizedRuleId = requirePositiveInteger(discountRuleId, 'discountRuleId');
        const normalizedActorUserId = requirePositiveInteger(actorUserId, 'actorUserId');

        transaction = await beginTransaction();
        const current = await repository.findById(normalizedRuleId, { transaction, lock: true });
        if (!current) {
            throw new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                'Discount configuration was not found.',
                { statusCode: 404 }
            );
        }

        const transactionReferenceCount = Number(
            await repository.countTransactionReferences(normalizedRuleId, { transaction })
        );
        if (transactionReferenceCount > 0) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'This discount cannot be deleted because it has been used in transactions. Set it to inactive instead.',
                {
                    statusCode: 409,
                    details: {
                        discount_rule_id: normalizedRuleId,
                        transaction_reference_count: transactionReferenceCount,
                        recommended_action: 'deactivate'
                    }
                }
            );
        }

        const serializedBefore = serializePosDiscountRule(current);
        const deleted = await repository.deleteById(normalizedRuleId, { transaction, lock: true });
        if (!deleted) {
            throw new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                'Discount configuration was not found.',
                { statusCode: 404 }
            );
        }

        await repository.createAuditLog({
            ...auditContextPayload(auditContext),
            user_id: normalizedActorUserId,
            entity_type: 'pos_discount_rule',
            entity_id: normalizedRuleId,
            action: 'DELETE',
            event_type: 'pos_discount_rule_configuration',
            changes: {
                event: 'pos_discount_rule_configuration',
                operation: 'delete',
                before: serializedBefore,
                after: null
            }
        }, { transaction });

        await transaction.commit();
        return ok({
            discount_rule_id: normalizedRuleId,
            deleted: true
        });
    } catch (error) {
        await rollbackIfOpen(transaction);
        return fail(mapError(error, 'Failed to delete discount configuration.'));
    }
};
