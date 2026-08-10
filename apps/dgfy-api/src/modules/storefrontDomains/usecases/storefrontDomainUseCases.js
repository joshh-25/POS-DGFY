import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizeStorefrontHostname } from '../utils/hostnamePolicy.js';

const DOMAIN_ROLES = new Set(['canonical', 'alias']);
const ACTIVE_DOMAIN_STATES = new Set(['active', 'eligibility_grace']);
const MAX_ACTIVE_ALIASES = 5;
const ELIGIBILITY_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const failure = (code, message, statusCode, details = null) => fail(
    new DomainError(code, message, { statusCode, details })
);
const plain = (value) => value && typeof value.toJSON === 'function' ? value.toJSON() : value;
const publicDomain = (value) => {
    const domain = { ...(plain(value) || {}) };
    delete domain.verification_token_hash;
    return domain;
};
const publicOperation = (value) => {
    const operation = { ...(plain(value) || {}) };
    delete operation.request_payload?.controller_secret;
    return operation;
};
const reasonValue = (value) => String(value || '').trim().slice(0, 500);
const asRole = (value) => String(value || 'canonical').trim().toLowerCase();
const isEligibleTenant = (tenant) => tenant?.status === 'active' && tenant?.plan === 'premium';
const operationKey = (domain, type, suffix = '') => [
    'storefront-domain',
    domain.id,
    type,
    suffix || domain.version || domain.updated_at || domain.status
].join(':');

export const buildStorefrontDomainUseCases = ({
    repository,
    dnsVerifier,
    tokenFactory,
    clearResolverCache,
    featurePolicy = { isTenantAllowed: () => true },
    now = () => new Date()
}) => {
    const writeAudit = async ({ domain, action, actor, reason, metadata, before, transaction }) => {
        await repository.createAudit({
            domain_id: domain.id,
            tenant_id: domain.tenant_id,
            action,
            actor_username: actor.username,
            reason,
            request_id: actor.request_id || null,
            before_snapshot: before ? publicDomain(before) : null,
            after_snapshot: publicDomain(domain),
            metadata: metadata || null
        }, { transaction });
    };

    const loadDomain = async (tenantId, domainId, transaction) => {
        const domain = await repository.findByIdForTenant(domainId, tenantId, {
            transaction,
            lock: transaction?.LOCK?.UPDATE
        });
        if (!domain) {
            throw new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                'Storefront domain not found.',
                { statusCode: 404 }
            );
        }
        return domain;
    };

    const assertTenantAllowed = (tenantId) => {
        if (!featurePolicy.isTenantAllowed(tenantId)) {
            throw new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'Custom storefront domains are not enabled for this tenant.',
                { statusCode: 403 }
            );
        }
    };

    const enqueueOperation = async ({ domain, type, actor, transaction, suffix = '', payload = null }) => {
        if (!repository.createOperation || !repository.findOperationByIdempotencyKey) return null;
        const idempotencyKey = operationKey(domain, type, suffix);
        const existing = await repository.findOperationByIdempotencyKey(idempotencyKey, { transaction });
        if (existing) return existing;
        return repository.createOperation({
            domain_id: domain.id,
            tenant_id: domain.tenant_id,
            operation_type: type,
            idempotency_key: idempotencyKey,
            status: 'queued',
            next_attempt_at: now(),
            request_payload: {
                hostname: domain.hostname,
                role: domain.role,
                canonical_domain_id: domain.canonical_domain_id || null,
                requested_by: actor.username,
                ...(payload || {})
            }
        }, { transaction });
    };

    const domainDnsInstructions = (hostname) => ({
        verification_type: 'TXT',
        verification_name: `_dgfy-verification.${hostname}`,
        verification_value: null,
        route_a: process.env.CUSTOM_STOREFRONT_APEX_IPV4 || null,
        route_aaaa: process.env.CUSTOM_STOREFRONT_APEX_IPV6 || null,
        route_cname: process.env.CUSTOM_STOREFRONT_CNAME_TARGET || null
    });

    return {
        async list({ tenantId }) {
            try {
                assertTenantAllowed(tenantId);
                const [domains, operations] = await Promise.all([
                    repository.listByTenant(tenantId),
                    repository.listOperationsByTenant
                        ? repository.listOperationsByTenant(tenantId, 50)
                        : []
                ]);
                return ok({
                    domains: domains.map(publicDomain),
                    operations: operations.map(publicOperation),
                    limits: { canonical: 1, aliases: MAX_ACTIVE_ALIASES }
                });
            } catch (error) {
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
            }
        },

        async create({ tenantId, hostname, role = 'canonical', canonicalDomainId = null, actor, reason }) {
            let normalized;
            try {
                normalized = normalizeStorefrontHostname(hostname);
            } catch (error) {
                return failure(DomainErrorCode.VALIDATION_FAILED, error.message, 400);
            }

            const normalizedRole = asRole(role);
            if (!DOMAIN_ROLES.has(normalizedRole)) {
                return failure(DomainErrorCode.VALIDATION_FAILED, 'role must be canonical or alias.', 400);
            }
            const auditReason = reasonValue(reason);
            if (!auditReason) {
                return failure(DomainErrorCode.VALIDATION_FAILED, 'reason is required.', 400);
            }

            try {
                assertTenantAllowed(tenantId);
                const tenant = await repository.findTenantById(tenantId);
                if (!tenant) return failure(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found.', 404);
                if (!isEligibleTenant(tenant)) {
                    return failure(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'Custom storefront domains require an active Premium tenant.',
                        403
                    );
                }

                const existing = await repository.findByHostname(normalized);
                if (existing && (existing.status !== 'removed' || String(existing.tenant_id) !== String(tenantId))) {
                    return failure(DomainErrorCode.CONFLICT, 'Hostname is already registered.', 409);
                }

                const verification = tokenFactory();
                const domain = await repository.transaction(async (transaction) => {
                    const canonical = await repository.findCanonicalByTenant(tenantId, {
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });

                    if (normalizedRole === 'canonical' && canonical && String(canonical.id) !== String(existing?.id || '')) {
                        throw new DomainError(
                            DomainErrorCode.CONFLICT,
                            'The tenant already has a canonical storefront domain.',
                            { statusCode: 409 }
                        );
                    }

                    let canonicalTarget = null;
                    if (normalizedRole === 'alias') {
                        if (!canonicalDomainId) {
                            throw new DomainError(
                                DomainErrorCode.VALIDATION_FAILED,
                                'canonical_domain_id is required for an alias.',
                                { statusCode: 400 }
                            );
                        }
                        canonicalTarget = await loadDomain(tenantId, canonicalDomainId, transaction);
                        if (canonicalTarget.role !== 'canonical' || canonicalTarget.status === 'removed') {
                            throw new DomainError(
                                DomainErrorCode.VALIDATION_FAILED,
                                'Alias domains must reference the tenant canonical domain.',
                                { statusCode: 400 }
                            );
                        }
                        const aliasCount = await repository.countAliasesByTenant(tenantId, { transaction });
                        if (aliasCount >= MAX_ACTIVE_ALIASES && !existing) {
                            throw new DomainError(
                                DomainErrorCode.CONFLICT,
                                `A tenant may have at most ${MAX_ACTIVE_ALIASES} active aliases.`,
                                { statusCode: 409 }
                            );
                        }
                    }

                    const values = {
                        tenant_id: tenantId,
                        hostname: normalized,
                        role: normalizedRole,
                        canonical_tenant_id: normalizedRole === 'canonical' ? tenantId : null,
                        canonical_domain_id: canonicalTarget?.id || null,
                        status: 'pending_dns',
                        verification_token_hash: verification.hash,
                        verification_token_hint: verification.hint,
                        dns_observation: null,
                        dns_error: null,
                        verified_at: null,
                        activated_at: null,
                        eligibility_grace_ends_at: null,
                        last_dns_checked_at: null,
                        last_health_checked_at: null,
                        tls_expires_at: null,
                        failure_code: null,
                        failure_message: null,
                        suspended_at: null,
                        removed_at: null,
                        provisioning_reference: null,
                        version: Number(existing?.version || 0) + 1,
                        created_by: existing?.created_by || actor.username,
                        updated_by: actor.username
                    };

                    if (existing) {
                        const before = plain(existing);
                        await existing.update(values, { transaction });
                        await writeAudit({
                            domain: existing,
                            action: 'rebound',
                            actor,
                            reason: auditReason,
                            before,
                            transaction
                        });
                        return existing;
                    }

                    const created = await repository.create(values, { transaction });
                    await writeAudit({
                        domain: created,
                        action: 'created',
                        actor,
                        reason: auditReason,
                        metadata: { role: normalizedRole },
                        transaction
                    });
                    return created;
                });

                return ok({
                    domain: publicDomain(domain),
                    dns: {
                        ...domainDnsInstructions(normalized),
                        verification_value: verification.token
                    }
                });
            } catch (error) {
                if (error?.name === 'SequelizeUniqueConstraintError') {
                    return failure(
                        DomainErrorCode.CONFLICT,
                        'The canonical or hostname limit was reached.',
                        409
                    );
                }
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
            }
        },

        async verify({ tenantId, domainId, actor, reason }) {
            const auditReason = reasonValue(reason);
            if (!auditReason) {
                return failure(DomainErrorCode.VALIDATION_FAILED, 'reason is required.', 400);
            }
            try {
                assertTenantAllowed(tenantId);
                const domain = await loadDomain(tenantId, domainId);
                if (!['pending_dns', 'verified', 'failed'].includes(domain.status)) {
                    return failure(
                        DomainErrorCode.CONFLICT,
                        `Domain cannot be verified from status ${domain.status}.`,
                        409
                    );
                }
                const observation = await dnsVerifier({
                    hostname: domain.hostname,
                    verificationTokenHash: domain.verification_token_hash
                });
                const updated = await repository.transaction(async (transaction) => {
                    const current = await loadDomain(tenantId, domainId, transaction);
                    const before = plain(current);
                    await current.update(observation.verified ? {
                        status: 'provisioning',
                        verified_at: current.verified_at || now(),
                        last_dns_checked_at: now(),
                        dns_observation: observation,
                        dns_error: null,
                        failure_code: null,
                        failure_message: null,
                        updated_by: actor.username
                    } : {
                        status: current.status === 'failed' ? 'failed' : 'pending_dns',
                        last_dns_checked_at: now(),
                        dns_observation: observation,
                        dns_error: 'DNS ownership, routing, IPv6, or CAA verification did not pass.',
                        failure_code: 'DNS_VERIFICATION_FAILED',
                        failure_message: 'DNS verification did not pass.',
                        updated_by: actor.username
                    }, { transaction });
                    await writeAudit({
                        domain: current,
                        action: observation.verified ? 'verified' : 'verification_failed',
                        actor,
                        reason: auditReason,
                        before,
                        metadata: observation.verified ? null : observation,
                        transaction
                    });
                    const operation = observation.verified
                        ? await enqueueOperation({
                            domain: current,
                            type: 'provision',
                            actor,
                            transaction,
                            suffix: String(current.verified_at || current.version)
                        })
                        : null;
                    return { domain: current, operation };
                });
                if (!observation.verified) {
                    return failure(DomainErrorCode.VALIDATION_FAILED, 'DNS verification failed.', 422, observation);
                }
                clearResolverCache(updated.domain.hostname);
                return ok({
                    domain: publicDomain(updated.domain),
                    operation: publicOperation(updated.operation)
                });
            } catch (error) {
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(
                        DomainErrorCode.SERVICE_UNAVAILABLE,
                        `DNS verification failed: ${error.message}`,
                        { statusCode: 503 }
                    ));
            }
        },

        async makeCanonical({ tenantId, domainId, actor, reason }) {
            const auditReason = reasonValue(reason);
            if (!auditReason) {
                return failure(DomainErrorCode.VALIDATION_FAILED, 'reason is required.', 400);
            }
            try {
                assertTenantAllowed(tenantId);
                const promoted = await repository.transaction(async (transaction) => {
                    const candidate = await loadDomain(tenantId, domainId, transaction);
                    if (candidate.role !== 'alias' || !['verified', 'provisioning', 'active'].includes(candidate.status)) {
                        throw new DomainError(
                            DomainErrorCode.CONFLICT,
                            'Only a verified or active alias can become canonical.',
                            { statusCode: 409 }
                        );
                    }
                    const currentCanonical = await repository.findCanonicalByTenant(tenantId, {
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });
                    if (!currentCanonical) {
                        throw new DomainError(
                            DomainErrorCode.CONFLICT,
                            'The tenant canonical domain was not found.',
                            { statusCode: 409 }
                        );
                    }

                    const beforeCandidate = plain(candidate);
                    const beforeCanonical = plain(currentCanonical);
                    await currentCanonical.update({
                        role: 'alias',
                        canonical_tenant_id: null,
                        canonical_domain_id: candidate.id,
                        version: Number(currentCanonical.version || 0) + 1,
                        updated_by: actor.username
                    }, { transaction });
                    await candidate.update({
                        role: 'canonical',
                        canonical_tenant_id: tenantId,
                        canonical_domain_id: null,
                        version: Number(candidate.version || 0) + 1,
                        updated_by: actor.username
                    }, { transaction });
                    await repository.repointAliases(
                        tenantId,
                        candidate.id,
                        currentCanonical.id,
                        { transaction }
                    );
                    await writeAudit({
                        domain: currentCanonical,
                        action: 'demoted_to_alias',
                        actor,
                        reason: auditReason,
                        before: beforeCanonical,
                        metadata: { canonical_domain_id: candidate.id },
                        transaction
                    });
                    await writeAudit({
                        domain: candidate,
                        action: 'promoted_to_canonical',
                        actor,
                        reason: auditReason,
                        before: beforeCandidate,
                        metadata: { previous_canonical_domain_id: currentCanonical.id },
                        transaction
                    });
                    await enqueueOperation({
                        domain: candidate,
                        type: 'provision',
                        actor,
                        transaction,
                        suffix: `canonical-${candidate.version}`
                    });
                    await enqueueOperation({
                        domain: currentCanonical,
                        type: 'provision',
                        actor,
                        transaction,
                        suffix: `alias-${currentCanonical.version}`
                    });
                    return candidate;
                });
                clearResolverCache();
                return ok({ domain: publicDomain(promoted) });
            } catch (error) {
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
            }
        },

        async retry({ tenantId, domainId, actor, reason }) {
            const auditReason = reasonValue(reason);
            if (!auditReason) {
                return failure(DomainErrorCode.VALIDATION_FAILED, 'reason is required.', 400);
            }
            try {
                assertTenantAllowed(tenantId);
                const result = await repository.transaction(async (transaction) => {
                    const domain = await loadDomain(tenantId, domainId, transaction);
                    if (!['failed', 'suspended', 'verified'].includes(domain.status)) {
                        throw new DomainError(
                            DomainErrorCode.CONFLICT,
                            `Domain cannot retry from status ${domain.status}.`,
                            { statusCode: 409 }
                        );
                    }
                    const before = plain(domain);
                    await domain.update({
                        status: 'provisioning',
                        failure_code: null,
                        failure_message: null,
                        version: Number(domain.version || 0) + 1,
                        updated_by: actor.username
                    }, { transaction });
                    const operation = await enqueueOperation({
                        domain,
                        type: 'provision',
                        actor,
                        transaction,
                        suffix: `retry-${domain.version}`
                    });
                    await writeAudit({
                        domain,
                        action: 'retry_requested',
                        actor,
                        reason: auditReason,
                        before,
                        metadata: { operation_id: operation?.id || null },
                        transaction
                    });
                    return { domain, operation };
                });
                return ok({
                    domain: publicDomain(result.domain),
                    operation: publicOperation(result.operation)
                });
            } catch (error) {
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
            }
        },

        async suspend({ tenantId, domainId, actor, reason }) {
            const auditReason = reasonValue(reason);
            if (!auditReason) {
                return failure(DomainErrorCode.VALIDATION_FAILED, 'reason is required.', 400);
            }
            try {
                assertTenantAllowed(tenantId);
                const result = await repository.transaction(async (transaction) => {
                    const domain = await loadDomain(tenantId, domainId, transaction);
                    if (!['active', 'verified', 'provisioning', 'eligibility_grace', 'failed'].includes(domain.status)) {
                        throw new DomainError(
                            DomainErrorCode.CONFLICT,
                            `Domain cannot be suspended from status ${domain.status}.`,
                            { statusCode: 409 }
                        );
                    }
                    const before = plain(domain);
                    await domain.update({
                        status: 'suspended',
                        suspended_at: now(),
                        eligibility_grace_ends_at: null,
                        version: Number(domain.version || 0) + 1,
                        updated_by: actor.username
                    }, { transaction });
                    const operation = await enqueueOperation({
                        domain,
                        type: 'suspend',
                        actor,
                        transaction,
                        suffix: domain.version
                    });
                    await writeAudit({
                        domain,
                        action: 'suspension_requested',
                        actor,
                        reason: auditReason,
                        before,
                        metadata: { operation_id: operation?.id || null },
                        transaction
                    });
                    return { domain, operation };
                });
                clearResolverCache(result.domain.hostname);
                return ok({
                    domain: publicDomain(result.domain),
                    operation: publicOperation(result.operation)
                });
            } catch (error) {
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
            }
        },

        async remove({ tenantId, domainId, actor, reason }) {
            const auditReason = reasonValue(reason);
            if (!auditReason) {
                return failure(DomainErrorCode.VALIDATION_FAILED, 'reason is required.', 400);
            }
            try {
                assertTenantAllowed(tenantId);
                const result = await repository.transaction(async (transaction) => {
                    const domain = await loadDomain(tenantId, domainId, transaction);
                    if (domain.status === 'removed') return { domain, operation: null };
                    if (domain.role === 'canonical') {
                        const aliases = await repository.countAliasesByTenant(tenantId, { transaction });
                        if (aliases > 0) {
                            throw new DomainError(
                                DomainErrorCode.CONFLICT,
                                'Remove or promote aliases before removing the canonical domain.',
                                { statusCode: 409 }
                            );
                        }
                    }
                    const before = plain(domain);
                    await domain.update({
                        status: 'removing',
                        canonical_tenant_id: null,
                        version: Number(domain.version || 0) + 1,
                        updated_by: actor.username
                    }, { transaction });
                    const operation = await enqueueOperation({
                        domain,
                        type: 'remove',
                        actor,
                        transaction,
                        suffix: domain.version
                    });
                    await writeAudit({
                        domain,
                        action: 'removal_requested',
                        actor,
                        reason: auditReason,
                        before,
                        metadata: { operation_id: operation?.id || null },
                        transaction
                    });
                    return { domain, operation };
                });
                clearResolverCache(result.domain.hostname);
                return ok({
                    domain: publicDomain(result.domain),
                    operation: publicOperation(result.operation)
                });
            } catch (error) {
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
            }
        },

        async reconcileEligibility({ tenantId, actor, reason = 'Scheduled premium eligibility reconciliation.' }) {
            const auditReason = reasonValue(reason);
            try {
                assertTenantAllowed(tenantId);
                const tenant = await repository.findTenantById(tenantId);
                if (!tenant) return failure(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found.', 404);
                const domains = await repository.listByTenant(tenantId);
                const results = [];

                for (const domain of domains) {
                    if (!ACTIVE_DOMAIN_STATES.has(domain.status)) continue;
                    const updated = await repository.transaction(async (transaction) => {
                        const current = await loadDomain(tenantId, domain.id, transaction);
                        const before = plain(current);
                        if (isEligibleTenant(tenant) && current.status === 'eligibility_grace') {
                            await current.update({
                                status: 'active',
                                eligibility_grace_ends_at: null,
                                updated_by: actor.username
                            }, { transaction });
                            await writeAudit({
                                domain: current,
                                action: 'eligibility_restored',
                                actor,
                                reason: auditReason,
                                before,
                                transaction
                            });
                            return current;
                        }
                        if (isEligibleTenant(tenant)) return current;

                        const currentTime = now();
                        const graceEnd = current.eligibility_grace_ends_at
                            ? new Date(current.eligibility_grace_ends_at)
                            : new Date(currentTime.getTime() + ELIGIBILITY_GRACE_MS);
                        if (graceEnd > currentTime) {
                            await current.update({
                                status: 'eligibility_grace',
                                eligibility_grace_ends_at: graceEnd,
                                updated_by: actor.username
                            }, { transaction });
                            await writeAudit({
                                domain: current,
                                action: 'eligibility_grace_started',
                                actor,
                                reason: auditReason,
                                before,
                                metadata: { eligibility_grace_ends_at: graceEnd },
                                transaction
                            });
                            return current;
                        }

                        await current.update({
                            status: 'suspended',
                            suspended_at: currentTime,
                            updated_by: actor.username
                        }, { transaction });
                        await enqueueOperation({
                            domain: current,
                            type: 'suspend',
                            actor,
                            transaction,
                            suffix: `eligibility-${current.version}`
                        });
                        await writeAudit({
                            domain: current,
                            action: 'eligibility_grace_expired',
                            actor,
                            reason: auditReason,
                            before,
                            transaction
                        });
                        return current;
                    });
                    results.push(publicDomain(updated));
                    clearResolverCache(updated.hostname);
                }
                return ok({ domains: results });
            } catch (error) {
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
            }
        },

        async auditDnsDrift({ tenantId, domainId, actor, reason = 'Scheduled DNS drift verification.' }) {
            const auditReason = reasonValue(reason);
            try {
                assertTenantAllowed(tenantId);
                const domain = await loadDomain(tenantId, domainId);
                if (!ACTIVE_DOMAIN_STATES.has(domain.status)) {
                    return failure(
                        DomainErrorCode.CONFLICT,
                        'DNS drift checks require an active or grace-period domain.',
                        409
                    );
                }
                const observation = await dnsVerifier({
                    hostname: domain.hostname,
                    verificationTokenHash: domain.verification_token_hash
                });
                const updated = await repository.transaction(async (transaction) => {
                    const current = await loadDomain(tenantId, domainId, transaction);
                    const before = plain(current);
                    await current.update(observation.verified ? {
                        last_dns_checked_at: now(),
                        dns_observation: observation,
                        dns_error: null,
                        updated_by: actor.username
                    } : {
                        status: 'suspended',
                        last_dns_checked_at: now(),
                        suspended_at: now(),
                        dns_observation: observation,
                        dns_error: 'DNS ownership or routing drift was detected.',
                        failure_code: 'DNS_DRIFT_DETECTED',
                        failure_message: 'DNS ownership or routing drift was detected.',
                        updated_by: actor.username
                    }, { transaction });
                    if (!observation.verified) {
                        await enqueueOperation({
                            domain: current,
                            type: 'suspend',
                            actor,
                            transaction,
                            suffix: `drift-${current.version}`
                        });
                    }
                    await writeAudit({
                        domain: current,
                        action: observation.verified ? 'dns_drift_check_passed' : 'dns_drift_suspended',
                        actor,
                        reason: auditReason,
                        before,
                        metadata: observation,
                        transaction
                    });
                    return current;
                });
                clearResolverCache(updated.hostname);
                return ok({ domain: publicDomain(updated), observation });
            } catch (error) {
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(
                        DomainErrorCode.SERVICE_UNAVAILABLE,
                        `DNS drift verification failed: ${error.message}`,
                        { statusCode: 503 }
                    ));
            }
        },

        async queueRenewal({ tenantId, domainId, actor, reason = 'Certificate renewal window reached.' }) {
            const auditReason = reasonValue(reason);
            try {
                assertTenantAllowed(tenantId);
                const result = await repository.transaction(async (transaction) => {
                    const domain = await loadDomain(tenantId, domainId, transaction);
                    if (!ACTIVE_DOMAIN_STATES.has(domain.status)) {
                        throw new DomainError(
                            DomainErrorCode.CONFLICT,
                            'Certificate renewal requires an active or grace-period domain.',
                            { statusCode: 409 }
                        );
                    }
                    const operation = await enqueueOperation({
                        domain,
                        type: 'renew',
                        actor,
                        transaction,
                        suffix: domain.tls_expires_at
                            ? new Date(domain.tls_expires_at).toISOString()
                            : `missing-expiry-${domain.version}`
                    });
                    await writeAudit({
                        domain,
                        action: 'renewal_requested',
                        actor,
                        reason: auditReason,
                        metadata: { operation_id: operation?.id || null },
                        transaction
                    });
                    return { domain, operation };
                });
                return ok({
                    domain: publicDomain(result.domain),
                    operation: publicOperation(result.operation)
                });
            } catch (error) {
                return fail(error instanceof DomainError
                    ? error
                    : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
            }
        },

        dnsInstructions({ hostname }) {
            return domainDnsInstructions(hostname);
        }
    };
};
