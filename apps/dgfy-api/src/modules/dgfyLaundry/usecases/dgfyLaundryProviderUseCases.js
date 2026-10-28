import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { buildDglaundryRuntimeAttestationUseCase } from './dglaundryRuntimeAttestationUseCase.js';
import { resolveDglaundryOrigin } from '../dglaundryOrigin.js';

const ISSUER = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const contractVersion = () => process.env.DGLAUNDRY_PARTNER_CONTRACT_VERSION || 'external-runtime-v0.1';
const toTrimmed = (value) => String(value || '').trim();
const REGISTRATION_DECISIONS = new Set(['approve', 'reject', 'request_correction']);
const REGISTRATION_STATUSES = new Set(['pending', 'approved', 'rejected', 'correction_required', 'expired', 'consumed']);

const safeStatus = (value, allowed, fallback) => allowed.has(value) ? value : fallback;
const registrationStatusView = (authority) => {
    const { row, issuer, subject, company, membership, location, businessMode } = authority;
    const settings = parseJson(company?.settings);
    const companyStatus = company
        ? safeStatus(company.status, new Set(['active', 'suspended', 'pending', 'rejected']), 'suspended')
        : 'not_created';
    const membershipStatus = membership
        ? safeStatus(membership.status, new Set(['accepted', 'pending', 'rejected', 'removed']), 'removed')
        : 'not_created';
    const locationIsActive = location?.status === 'active';
    const connected = row.status === 'approved'
        && companyStatus === 'active'
        && membershipStatus === 'accepted'
        && locationIsActive
        && issuer === ISSUER
        && Boolean(subject)
        && Boolean(authority.account?.is_active)
        && !authority.account?.deleted_at
        && settings.runtime_owner === 'dglaundry'
        && businessMode === 'laundry';
    const connectionStatus = connected
        ? 'active'
        : ['pending', 'correction_required'].includes(row.status)
            ? 'pending'
            : row.status === 'approved' ? 'unavailable' : 'inactive';
    const isApproved = row.status === 'approved' && row.decision === 'approve';
    return {
        intentId: row.id,
        intentType: 'registration',
        status: row.status,
        reason: row.decision_reason || null,
        expiresAt: row.expires_at,
        applicationId: authority.payload?.applicationId || null,
        companyId: isApproved ? company?.id || null : null,
        locationId: isApproved && locationIsActive ? location.id : null,
        membershipId: isApproved && membership ? String(membership.id) : null,
        issuer: issuer || null,
        subject: subject || null,
        membershipStatus: isApproved ? membershipStatus : 'not_created',
        companyStatus: isApproved ? companyStatus : 'not_created',
        businessMode: 'laundry',
        connectionStatus: isApproved ? connectionStatus : row.status === 'rejected' || row.status === 'expired' ? 'inactive' : 'pending',
        statusVersion: Number(row.status_version || 1),
        companyAccessVersion: Number(row.company_access_version || 0)
    };
};

const registrationPayloadForAdmin = (payload = {}) => ({
    organizationName: payload.organizationName || payload.company_name || '',
    branchName: payload.branchName || '',
    branchCode: payload.branchCode || '',
    timezone: payload.timezone || null,
    currency: payload.currency || null,
    publicStorefrontHandle: payload.publicStorefrontHandle || null
});

const requireIdempotencyKey = (value) => {
    const key = toTrimmed(value);
    if (!key || key.length > 160) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A bounded idempotency key is required.', { statusCode: 400 });
    }
    return key;
};

const parseJson = (value) => {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value || '{}'); } catch { return {}; }
};

const chooseCompany = async ({ repository, dgfyAccount, companyId }) => {
    const companies = await repository.listLaundryCompanies({ dgfyAccountId: dgfyAccount.id });
    if (!companies.length) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'This DGFY account has no active laundry company membership.', { statusCode: 403 });
    }
    if (!companyId && companies.length > 1) {
        return { companies, company: null };
    }
    const suppliedCompanyId = toTrimmed(companyId);
    const company = suppliedCompanyId
        ? companies.find((candidate) => candidate.company_id === suppliedCompanyId) || null
        : (companies.length === 1 ? companies[0] : null);
    if (!company) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The selected laundry company is not an active membership of this DGFY account.', { statusCode: 403 });
    }
    return { companies, company };
};

export const buildDgfyLaundryProviderUseCases = ({ repository, runtimeAttestation = null }) => ({
    async health() {
        return { status: 'ok', provider: 'dgfy', contractVersion: contractVersion(), time: new Date().toISOString() };
    },

    async capabilities() {
        return {
            provider: 'dgfy',
            contractVersion: contractVersion(),
            signatureProfiles: [
                { scope: 'request', tag: 'dgfy-external-runtime-v1', algorithm: 'ecdsa-p256-sha256' },
                { scope: 'event', tag: 'dglaundry-dgfy-v1', algorithm: 'ed25519' }
            ],
            enforcedProfile: process.env.NODE_ENV === 'production'
                ? 'http-message-signatures-v1'
                : (process.env.DGLAUNDRY_SIGNATURE_PROFILE || 'hmac-local-v1'),
            paymentLifecycleProbes: ['cancel', 'expire', 'refund', 'receipt'].map((kind) => ({
                kind,
                method: 'POST',
                path: `/api/v1/partners/dglaundry/orders/{externalOrderReference}/${kind}`,
                statePath: '/state',
                orderReferencePath: '/externalOrderReference',
                paymentModePath: '/paymentMode',
                companyIdPath: '/companyId',
                locationIdPath: '/locationId'
            }))
        };
    },

    async runtimeAttestation() {
        if (!runtimeAttestation) {
            return buildDglaundryRuntimeAttestationUseCase({ repository })();
        }
        return runtimeAttestation();
    },

    async getCompanyById({ companyId }) {
        const company = await repository.findCompanyById({ companyId: toTrimmed(companyId) });
        if (!company) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'DGLaundry company not found.', { statusCode: 404 });
        const mappings = await repository.listMappings({ dgfyCompanyId: company.company_id });
        const providerLocations = await repository.listProviderLocations({ companyId: company.company_id });
        const { dgfy_account_id: dgfyAccountId, ...companyData } = company;
        return {
            ...companyData,
            owner: {
                membershipId: String(company.membership_id),
                dgfyAccountId: String(dgfyAccountId),
                role: company.role
            },
            locations: [
                ...providerLocations.map((location) => {
                    const mapping = mappings.find((candidate) => candidate.dgfy_location_id === location.location_id);
                    return {
                        locationId: location.location_id,
                        ...(mapping?.dglaundry_branch_id ? { branchId: mapping.dglaundry_branch_id } : {}),
                        status: mapping?.status === 'active' ? 'active' : 'unmapped'
                    };
                }),
                ...mappings.filter((mapping) => mapping.dgfy_location_id && !providerLocations.some((location) => location.location_id === mapping.dgfy_location_id))
                    .map((mapping) => ({ locationId: mapping.dgfy_location_id, branchId: mapping.dglaundry_branch_id, status: mapping.status }))
            ]
        };
    },

    async listCompanies({ dgfyAccount }) {
        const { companies } = await chooseCompany({ repository, dgfyAccount });
        return { issuer: ISSUER, companies };
    },

    async launch({ dgfyAccount, companyId, branchId = null }) {
        const { companies, company } = await chooseCompany({ repository, dgfyAccount, companyId });
        if (!company) return { selection_required: true, companies };
        const url = resolveDglaundryOrigin();
        if (!url) {
            throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'The DGLaundry origin is not configured (DGLAUNDRY_PARTNER_BASE_URL).', { statusCode: 503 });
        }
        await repository.audit({
            action: 'laundry_operations_launch',
            dgfyAccountId: dgfyAccount.id,
            companyId: company.company_id,
            metadata: { branch_id: branchId, runtime_owner: 'dglaundry' }
        });
        return {
            selection_required: false,
            issuer: ISSUER,
            subject: String(dgfyAccount.id),
            company,
            branch_id: branchId,
            url
        };
    },

    async sessionContext({ dgfyAccount, companyId }) {
        const { companies, company } = await chooseCompany({ repository, dgfyAccount, companyId });
        if (!company) return { selection_required: true, companies };
        const mappings = await repository.listMappings({ dgfyCompanyId: company.company_id });
        const providerLocations = await repository.listProviderLocations({ companyId: company.company_id });
        return {
            issuer: ISSUER,
            subject: String(dgfyAccount.id),
            companyId: company.company_id,
            companyAccessVersion: 1,
            membership: {
                membershipId: String(company.membership_id),
                status: company.membership_status,
                role: company.role,
                isOwner: company.role === 'owner' || company.role === 'admin'
            },
            company: {
                status: 'active',
                businessMode: 'laundry',
                runtimeOwner: 'dglaundry'
            },
            connection: { status: 'active', version: 1 },
            locations: [
                ...providerLocations.map((location) => {
                    const mapping = mappings.find((candidate) => candidate.dgfy_location_id === location.location_id);
                    return {
                        locationId: location.location_id,
                        ...(mapping?.dglaundry_branch_id ? { branchId: mapping.dglaundry_branch_id } : {}),
                        status: mapping?.status === 'active' ? 'active' : 'unmapped'
                    };
                }),
                ...mappings.filter((mapping) => mapping.dgfy_location_id && !providerLocations.some((location) => location.location_id === mapping.dgfy_location_id))
                    .map((mapping) => ({ locationId: mapping.dgfy_location_id, branchId: mapping.dglaundry_branch_id, status: mapping.status }))
            ],
            capabilities: ['catalog.read', 'availability.read', 'quotes.validate', 'orders.submit', 'orders.track'],
            connection_status: 'active'
        };
    },

    async createIntent({ intentType, body, idempotencyKey: suppliedIdempotencyKey = null, dgfyAccount = null }) {
        const idempotencyKey = requireIdempotencyKey(suppliedIdempotencyKey || body?.idempotency_key || body?.idempotencyKey);
        const now = Date.now();
        let expiresAt = new Date(now + 15 * 60 * 1000);
        let dgfyAccountId = dgfyAccount?.id || null;
        let applicantIssuer = null;
        let applicantSubject = null;
        let tenantId = body?.company_id || body?.tenant_id || null;
        let intentPayload = body || {};
        if (intentType === 'registration') {
            applicantIssuer = toTrimmed(body?.issuer);
            applicantSubject = toTrimmed(body?.subject);
            if (!applicantIssuer || !applicantSubject || applicantIssuer !== ISSUER) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A DGFY issuer and subject from the signed onboarding identity are required.', { statusCode: 422 });
            }
            const applicant = await repository.findActiveApplicant({ issuer: applicantIssuer, subject: applicantSubject });
            if (!applicant) {
                throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'The submitted DGFY applicant identity is not active or does not match this issuer.', { statusCode: 403 });
            }
            dgfyAccountId = applicant.id;
            tenantId = null;
            // Human review is durable; the old 15-minute handshake expiry must
            // not make an approval request disappear before an admin can act.
            expiresAt = null;
            intentPayload = { ...body, issuer: applicantIssuer, subject: applicantSubject };
            for (const key of ['dgfy_account_id', 'company_id', 'tenant_id', 'companyId', 'locationId', 'membershipId']) delete intentPayload[key];
        }
        const intentResult = await repository.createIntent({
            intentType,
            idempotencyKey,
            dgfyAccountId,
            applicantIssuer,
            applicantSubject,
            tenantId,
            payload: intentPayload,
            expiresAt
        });
        const row = intentResult?.row || intentResult;
        const created = intentResult?.row ? intentResult.created : true;
        const payload = parseJson(row.payload);
        if (intentType === 'registration') {
            const authority = await repository.findRegistrationIntentAuthority({ id: row.id });
            if (authority.issuer !== applicantIssuer || authority.subject !== applicantSubject) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'This idempotency key belongs to a different DGFY applicant.', { statusCode: 409 });
            }
            return { ...registrationStatusView(authority), idempotent_replay: !created };
        }
        return {
            intentId: row.id,
            intentType: row.intent_type,
            status: row.status,
            idempotent_replay: !created,
            expiresAt: row.expires_at,
            ...(intentType === 'location' ? {
                companyId: payload.companyId || payload.company_id,
                branchId: payload.branchId || payload.branch_id,
                locationId: payload.locationId || null,
                statusVersion: 1
            } : {
                invitationId: row.id
            })
        };
    },

    async getIntent({ id, expectedIntentType = null }) {
        const row = await repository.findIntent(id);
        if (!row) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'DGLaundry intent not found.', { statusCode: 404 });
        if (expectedIntentType && row.intent_type !== expectedIntentType) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'DGLaundry intent not found.', { statusCode: 404 });
        }
        if (row.intent_type === 'registration') {
            const authority = await repository.findRegistrationIntentAuthority({ id });
            if (!authority) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'DGLaundry intent not found.', { statusCode: 404 });
            return registrationStatusView(authority);
        }
        const payload = parseJson(row.payload);
        return {
            intentId: row.id,
            intentType: row.intent_type,
            status: row.status,
            expiresAt: row.expires_at,
            payload,
            ...(row.intent_type === 'location' ? {
                companyId: payload.companyId || payload.company_id,
                branchId: payload.branchId || payload.branch_id,
                locationId: payload.locationId || null,
                statusVersion: 1
            } : { invitationId: row.id })
        };
    },

    async listRegistrationIntents({ search = '', status = 'pending', limit = 20, offset = 0 } = {}) {
        const query = toTrimmed(search);
        if (query.length > 160) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Registration search must be 160 characters or fewer.');
        const normalizedStatus = toTrimmed(status).toLowerCase();
        if (normalizedStatus && normalizedStatus !== 'all' && !REGISTRATION_STATUSES.has(normalizedStatus)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The DGLaundry registration status filter is invalid.');
        }
        const pageSize = Number(limit);
        const pageOffset = Number(offset);
        if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isInteger(pageOffset) || pageOffset < 0) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Registration pagination is invalid.');
        }
        return repository.listRegistrationIntents({ search: query, status: normalizedStatus && normalizedStatus !== 'all' ? normalizedStatus : null, limit: pageSize, offset: pageOffset });
    },

    async getRegistrationIntentForAdmin({ intentId }) {
        const id = toTrimmed(intentId);
        if (!id) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A registration intent ID is required.');
        const authority = await repository.findRegistrationIntentAuthority({ id });
        if (!authority) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'DGLaundry registration intent not found.');
        const applicant = authority.account;
        return {
            ...registrationStatusView(authority),
            payload: registrationPayloadForAdmin(authority.payload),
            applicant: {
                issuer: authority.issuer,
                subject: authority.subject,
                accountId: applicant?.id || null,
                name: applicant ? [applicant.first_name, applicant.last_name].filter(Boolean).join(' ') : null,
                email: applicant?.email || null,
                identityVerified: Boolean(applicant && applicant.is_active && !applicant.deleted_at && authority.issuer === ISSUER)
            },
            decision: authority.row.decision || null,
            decidedBy: authority.row.decided_by || null,
            decidedAt: authority.row.decided_at || null,
            createdAt: authority.row.created_at,
            updatedAt: authority.row.updated_at
        };
    },

    async decideRegistrationIntent({ intentId, decision, expectedStatusVersion, reason = '', adminId = null }) {
        const id = toTrimmed(intentId);
        const selectedDecision = toTrimmed(decision).toLowerCase();
        const version = Number(expectedStatusVersion);
        const normalizedReason = toTrimmed(reason);
        if (!id || !REGISTRATION_DECISIONS.has(selectedDecision)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid DGLaundry registration decision is required.');
        }
        if (!Number.isInteger(version) || version < 1) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'expectedStatusVersion must be a positive integer.');
        }
        if (['reject', 'request_correction'].includes(selectedDecision) && !normalizedReason) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A reason is required when rejecting or requesting a correction.');
        }
        if (normalizedReason.length > 1000) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The decision reason must be 1000 characters or fewer.');
        }

        try {
            const result = await repository.decideRegistrationIntent({
                intentId: id,
                decision: selectedDecision,
                expectedStatusVersion: version,
                reason: normalizedReason || null,
                adminId
            });
            return { ...registrationStatusView(result.authority), idempotentReplay: result.idempotentReplay };
        } catch (error) {
            const code = error?.code;
            if (code === 'DGLAUNDRY_REGISTRATION_NOT_FOUND') {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'DGLaundry registration intent not found.');
            }
            if (code === 'DGLAUNDRY_REGISTRATION_STALE_VERSION' || code === 'DGLAUNDRY_REGISTRATION_ALREADY_DECIDED') {
                throw new DomainError(DomainErrorCode.CONFLICT, 'This registration changed before the decision was saved. Refresh the review and try again.', { statusCode: 409 });
            }
            if (code === 'DGLAUNDRY_REGISTRATION_APPLICANT_IDENTITY_INVALID'
                || code === 'DGLAUNDRY_REGISTRATION_APPLICANT_UNAVAILABLE'
                || code === 'DGLAUNDRY_REGISTRATION_DETAILS_INCOMPLETE') {
                throw new DomainError(DomainErrorCode.CONFLICT, 'This registration cannot be approved until its exact applicant identity and required business details are verified.', { statusCode: 409 });
            }
            throw error;
        }
    },

    async createMapping({ body, partner }) {
        const required = ['issuer', 'subject', 'dgfy_company_id', 'dglaundry_organization_id', 'approved_by'];
        const missing = required.filter((key) => !toTrimmed(body?.[key]));
        if (missing.length) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Missing mapping fields: ${missing.join(', ')}`, { statusCode: 400 });
        if (toTrimmed(body.issuer) !== ISSUER) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Mapping issuer does not match the configured DGFY issuer.', { statusCode: 422 });
        const result = await repository.createMapping({
            issuer: toTrimmed(body.issuer),
            subject: toTrimmed(body.subject),
            dgfyCompanyId: toTrimmed(body.dgfy_company_id),
            dgfyLocationId: toTrimmed(body.dgfy_location_id) || null,
            dglaundryOrganizationId: toTrimmed(body.dglaundry_organization_id),
            dglaundryBranchId: toTrimmed(body.dglaundry_branch_id) || null,
            approvedBy: toTrimmed(body.approved_by)
        });
        await repository.audit({ action: 'laundry_mapping_approved', companyId: body.dgfy_company_id, metadata: { partner, mapping_id: result?.id || null } });
        return result;
    },

    constants: { ISSUER },
    chooseCompany: ({ dgfyAccount, companyId }) => chooseCompany({ repository, dgfyAccount, companyId })
});
