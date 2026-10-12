import { DomainError, DomainErrorCode } from '../modules/shared/contracts/domainErrors.js';

// Reusable #653 policy. Resolve at every call so a changed environment fails closed.
export const demoProvisioningCapabilities = (env = process.env) => {
    const allowed = Boolean(env.NODE_ENV)
        && env.NODE_ENV !== 'production'
        && /dev|test|local|demo/i.test(String(env.DB_NAME || ''))
        && env.SEED_DEMO_APPROVED === 'true';
    return {
        allowed,
        reason: allowed ? null : 'DEMO requires a non-production NODE_ENV, a dev/test/local/demo landlord DB name, and SEED_DEMO_APPROVED=true.'
    };
};

export const assertDemoProvisioningAllowed = (env = process.env) => {
    const capability = demoProvisioningCapabilities(env);
    if (!capability.allowed) throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, capability.reason);
};
