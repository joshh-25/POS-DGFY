import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const failure = (code, message, statusCode, details = null) => fail(
    new DomainError(code, message, { statusCode, details })
);
const plain = (value) => value && typeof value.toJSON === 'function' ? value.toJSON() : value;
const safeText = (value, max = 500) => String(value || '').trim().slice(0, max);
const allowedTypes = new Set(['provision', 'renew', 'suspend', 'restore', 'remove']);

const publicOperation = (value) => {
    const operation = { ...(plain(value) || {}) };
    return operation;
};

const nextBackoff = (attempts) => {
    const seconds = Math.min(15 * (2 ** Math.max(Number(attempts || 1) - 1, 0)), 900);
    return new Date(Date.now() + seconds * 1000);
};

export const buildStorefrontDomainOperationUseCases = ({
    repository,
    clearResolverCache,
    now = () => new Date()
}) => ({
    async lease({ leaseOwner, leaseSeconds = 60 }) {
        const owner = safeText(leaseOwner, 120);
        const duration = Math.min(Math.max(Number(leaseSeconds) || 60, 15), 300);
        if (!owner) {
            return failure(DomainErrorCode.VALIDATION_FAILED, 'lease_owner is required.', 400);
        }
        try {
            const operation = await repository.leaseNextOperation({
                leaseOwner: owner,
                leaseExpiresAt: new Date(now().getTime() + duration * 1000),
                now: now()
            });
            if (!operation) return ok({ operation: null });

            const domain = await repository.findByIdForTenant(operation.domain_id, operation.tenant_id);
            if (!domain || !allowedTypes.has(operation.operation_type)) {
                await operation.update({
                    status: 'failed',
                    error_code: 'INVALID_OPERATION_TARGET',
                    error_message: 'The operation target or type is invalid.',
                    completed_at: now()
                });
                return ok({ operation: null });
            }
            const canonicalDomain = domain.role === 'alias' && domain.canonical_domain_id
                ? await repository.findByIdForTenant(domain.canonical_domain_id, domain.tenant_id)
                : null;
            if (domain.role === 'alias' && !canonicalDomain) {
                await operation.update({
                    status: 'failed',
                    error_code: 'CANONICAL_DOMAIN_NOT_FOUND',
                    error_message: 'The alias canonical domain was not found.',
                    completed_at: now()
                });
                return ok({ operation: null });
            }

            return ok({
                operation: publicOperation(operation),
                domain: {
                    id: domain.id,
                    tenant_id: domain.tenant_id,
                    hostname: domain.hostname,
                    role: domain.role,
                    canonical_domain_id: domain.canonical_domain_id || null,
                    canonical_hostname: canonicalDomain?.hostname || domain.hostname,
                    status: domain.status
                }
            });
        } catch (error) {
            return fail(error instanceof DomainError
                ? error
                : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
        }
    },

    async report({
        operationId,
        leaseOwner,
        success,
        provisioningReference,
        healthCheckPassed,
        tlsExpiresAt,
        result,
        errorCode,
        errorMessage
    }) {
        const owner = safeText(leaseOwner, 120);
        if (!owner || typeof success !== 'boolean') {
            return failure(
                DomainErrorCode.VALIDATION_FAILED,
                'lease_owner and success are required.',
                400
            );
        }
        try {
            const output = await repository.transaction(async (transaction) => {
                const operation = await repository.findOperationById(operationId, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!operation) {
                    throw new DomainError(
                        DomainErrorCode.RESOURCE_NOT_FOUND,
                        'Storefront domain operation not found.',
                        { statusCode: 404 }
                    );
                }
                if (operation.status === 'completed') return { operation, domain: null };
                if (operation.status !== 'leased'
                    || operation.lease_owner !== owner
                    || !operation.lease_expires_at
                    || new Date(operation.lease_expires_at) < now()) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'The operation lease is stale or owned by another controller.',
                        { statusCode: 409 }
                    );
                }

                const domain = await repository.findByIdForTenant(
                    operation.domain_id,
                    operation.tenant_id,
                    { transaction, lock: transaction.LOCK.UPDATE }
                );
                if (!domain) {
                    throw new DomainError(
                        DomainErrorCode.RESOURCE_NOT_FOUND,
                        'Storefront domain not found.',
                        { statusCode: 404 }
                    );
                }

                if (!success) {
                    const exhausted = Number(operation.attempts || 0) >= Number(operation.max_attempts || 5);
                    await operation.update({
                        status: exhausted ? 'failed' : 'retry',
                        lease_owner: null,
                        lease_expires_at: null,
                        next_attempt_at: exhausted ? operation.next_attempt_at : nextBackoff(operation.attempts),
                        error_code: safeText(errorCode, 64) || 'CONTROLLER_OPERATION_FAILED',
                        error_message: safeText(errorMessage) || 'The controller operation failed.',
                        result_payload: result || null,
                        completed_at: exhausted ? now() : null
                    }, { transaction });
                    if (['provision', 'restore'].includes(operation.operation_type)) {
                        await domain.update({
                            status: 'failed',
                            failure_code: operation.error_code || safeText(errorCode, 64) || 'CONTROLLER_OPERATION_FAILED',
                            failure_message: safeText(errorMessage) || 'The controller operation failed.',
                            updated_by: `controller:${owner}`
                        }, { transaction });
                    }
                    return { operation, domain };
                }

                const reference = safeText(provisioningReference, 255);
                if (['provision', 'restore'].includes(operation.operation_type)
                    && (healthCheckPassed !== true || !reference)) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Successful provision or restore results require health_check_passed=true and provisioning_reference.',
                        { statusCode: 400 }
                    );
                }

                const currentTime = now();
                const domainPatch = {
                    failure_code: null,
                    failure_message: null,
                    last_health_checked_at: healthCheckPassed === true
                        ? currentTime
                        : domain.last_health_checked_at,
                    updated_by: `controller:${owner}`
                };
                if (operation.operation_type === 'provision' || operation.operation_type === 'restore') {
                    domainPatch.status = 'active';
                    domainPatch.activated_at = domain.activated_at || currentTime;
                    domainPatch.suspended_at = null;
                    domainPatch.provisioning_reference = reference;
                } else if (operation.operation_type === 'renew') {
                    domainPatch.provisioning_reference = reference || domain.provisioning_reference;
                } else if (operation.operation_type === 'suspend') {
                    domainPatch.status = 'suspended';
                    domainPatch.suspended_at = domain.suspended_at || currentTime;
                } else if (operation.operation_type === 'remove') {
                    domainPatch.status = 'removed';
                    domainPatch.removed_at = currentTime;
                    domainPatch.canonical_tenant_id = null;
                    domainPatch.canonical_domain_id = null;
                }
                if (tlsExpiresAt) {
                    const parsedExpiry = new Date(tlsExpiresAt);
                    if (Number.isNaN(parsedExpiry.getTime())) {
                        throw new DomainError(
                            DomainErrorCode.VALIDATION_FAILED,
                            'tls_expires_at must be a valid date.',
                            { statusCode: 400 }
                        );
                    }
                    domainPatch.tls_expires_at = parsedExpiry;
                }

                await domain.update(domainPatch, { transaction });
                await operation.update({
                    status: 'completed',
                    lease_owner: owner,
                    lease_expires_at: null,
                    result_payload: result || null,
                    error_code: null,
                    error_message: null,
                    completed_at: currentTime
                }, { transaction });
                return { operation, domain };
            });

            if (output.domain) clearResolverCache(output.domain.hostname);
            return ok({
                operation: publicOperation(output.operation),
                domain: output.domain ? plain(output.domain) : null
            });
        } catch (error) {
            return fail(error instanceof DomainError
                ? error
                : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
        }
    }
});
