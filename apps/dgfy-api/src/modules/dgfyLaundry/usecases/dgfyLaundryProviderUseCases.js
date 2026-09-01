import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const LAUNDRY_ORIGIN = 'https://laundry.dgfy.ph';
const ISSUER = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const toTrimmed = (value) => String(value || '').trim();

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
    const company = companies.find((candidate) => candidate.company_id === toTrimmed(companyId)) || (companies.length === 1 ? companies[0] : null);
    if (!company) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The selected laundry company is not an active membership of this DGFY account.', { statusCode: 403 });
    }
    return { companies, company };
};

export const buildDgfyLaundryProviderUseCases = ({ repository }) => ({
    async listCompanies({ dgfyAccount }) {
        const { companies } = await chooseCompany({ repository, dgfyAccount });
        return { issuer: ISSUER, companies };
    },

    async launch({ dgfyAccount, companyId, branchId = null }) {
        const { companies, company } = await chooseCompany({ repository, dgfyAccount, companyId });
        if (!company) return { selection_required: true, companies };
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
            url: LAUNDRY_ORIGIN
        };
    },

    async sessionContext({ dgfyAccount, companyId }) {
        const { companies, company } = await chooseCompany({ repository, dgfyAccount, companyId });
        if (!company) return { selection_required: true, companies };
        const mappings = await repository.listMappings({ dgfyCompanyId: company.company_id });
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
            locations: mappings.map((mapping) => ({
                locationId: mapping.dgfy_location_id || mapping.dglaundry_branch_id,
                branchId: mapping.dglaundry_branch_id,
                status: mapping.status
            })),
            capabilities: ['catalog.read', 'availability.read', 'quotes.validate', 'orders.submit', 'orders.track'],
            connection_status: 'active'
        };
    },

    async createIntent({ intentType, body, idempotencyKey: suppliedIdempotencyKey = null, dgfyAccount = null }) {
        const idempotencyKey = requireIdempotencyKey(suppliedIdempotencyKey || body?.idempotency_key || body?.idempotencyKey);
        const now = Date.now();
        const expiresAt = new Date(now + 15 * 60 * 1000);
        const intentResult = await repository.createIntent({
            intentType,
            idempotencyKey,
            dgfyAccountId: dgfyAccount?.id || body?.dgfy_account_id || null,
            tenantId: body?.company_id || body?.tenant_id || null,
            payload: body,
            expiresAt
        });
        const row = intentResult?.row || intentResult;
        const created = intentResult?.row ? intentResult.created : true;
        const payload = parseJson(row.payload);
        return {
            intentId: row.id,
            intentType: row.intent_type,
            status: row.status,
            idempotent_replay: !created,
            expiresAt: row.expires_at,
            ...(intentType === 'registration' ? {
                companyId: payload.companyId || payload.company_id || null,
                applicationId: payload.applicationId || null,
                locationId: payload.locationId || payload.branchId || null,
                membershipId: payload.membershipId || null,
                issuer: ISSUER,
                subject: dgfyAccount?.id || null,
                membershipStatus: 'pending',
                companyStatus: 'pending',
                businessMode: 'laundry',
                connectionStatus: 'pending',
                statusVersion: 1,
                companyAccessVersion: 0
            } : intentType === 'location' ? {
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
        const payload = parseJson(row.payload);
        return {
            intentId: row.id,
            intentType: row.intent_type,
            status: row.status,
            expiresAt: row.expires_at,
            payload,
            ...(row.intent_type === 'registration' ? {
                companyId: payload.companyId || payload.company_id || null,
                locationId: payload.locationId || payload.branchId || null,
                issuer: ISSUER,
                subject: row.dgfy_account_id || null,
                businessMode: 'laundry',
                connectionStatus: row.status === 'approved' ? 'active' : 'pending',
                statusVersion: 1,
                companyAccessVersion: 0
            } : row.intent_type === 'location' ? {
                companyId: payload.companyId || payload.company_id,
                branchId: payload.branchId || payload.branch_id,
                locationId: payload.locationId || null,
                statusVersion: 1
            } : { invitationId: row.id })
        };
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

    constants: { LAUNDRY_ORIGIN, ISSUER },
    chooseCompany: ({ dgfyAccount, companyId }) => chooseCompany({ repository, dgfyAccount, companyId })
});
