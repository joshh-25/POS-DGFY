import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import sequelize from '../../../config/database.js';
import {
    DgfyAccount,
    DgfyAccountTenantMembership,
    Tenant
} from '../../../models/index.js';
import { resolveDglaundryOrigin } from '../dglaundryOrigin.js';

const ISSUER = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';

const parseSettings = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
};

const normalizeId = (value) => String(value || '').trim();

const toCompany = (membership) => {
    const tenant = membership.tenant;
    const settings = parseSettings(tenant?.settings);
    return {
        company_id: tenant.id,
        company_name: tenant.name,
        membership_id: membership.id,
        membership_status: membership.status,
        role: membership.role,
        business_mode: settings.business_mode || settings.workflow_mode || null,
        runtime_owner: settings.runtime_owner || null,
        dgfy_storefront: settings.dgfy_storefront === true,
        ims: settings.ims !== false,
        pos: settings.pos !== false,
        operations_url: settings.operations_url || null,
        status: tenant.status
    };
};

export const dgfyLaundryRepository = {
    async findCompanyById({ companyId }) {
        const membership = await DgfyAccountTenantMembership.findOne({
            where: {
                tenant_id: normalizeId(companyId),
                status: 'accepted',
                role: ['owner', 'admin']
            },
            include: [{ model: Tenant, as: 'tenant', required: true }],
            order: [
                [sequelize.literal("CASE WHEN role = 'owner' THEN 0 ELSE 1 END"), 'ASC'],
                ['created_at', 'ASC']
            ]
        });
        if (!membership) return null;
        const company = toCompany(membership);
        if (company.business_mode !== 'laundry'
            || company.runtime_owner !== 'dglaundry'
            || company.status !== 'active') return null;
        return { ...company, dgfy_account_id: membership.dgfy_account_id };
    },

    async listLaundryCompanies({ dgfyAccountId }) {
        const memberships = await DgfyAccountTenantMembership.findAll({
            where: { dgfy_account_id: dgfyAccountId, status: 'accepted' },
            include: [{ model: Tenant, as: 'tenant', required: true }],
            order: [[{ model: Tenant, as: 'tenant' }, 'name', 'ASC']]
        });
        return memberships
            .map(toCompany)
            .filter((company) => company.business_mode === 'laundry'
                && company.runtime_owner === 'dglaundry'
                && company.status === 'active');
    },

    async findLaundryCompany({ dgfyAccountId, companyId }) {
        const company = (await this.listLaundryCompanies({ dgfyAccountId }))
            .find((candidate) => candidate.company_id === normalizeId(companyId));
        return company || null;
    },

    async findActiveApplicant({ issuer, subject }) {
        if (String(issuer || '').trim() !== ISSUER) return null;
        const account = await DgfyAccount.findByPk(String(subject || '').trim());
        if (!account || !account.is_active || account.deleted_at) return null;
        return account;
    },

    async createIntent({ intentType, idempotencyKey, dgfyAccountId = null, applicantIssuer = null, applicantSubject = null, tenantId = null, payload, expiresAt }) {
        const existing = await sequelize.query(
            'SELECT * FROM dgfy_dglaundry_intents WHERE idempotency_key = ? LIMIT 1',
            { replacements: [idempotencyKey], type: QueryTypes.SELECT }
        );
        if (existing[0]) return { row: existing[0], created: false };
        const id = crypto.randomUUID();
        try {
            await sequelize.query(
                `INSERT INTO dgfy_dglaundry_intents
                 (id, intent_type, idempotency_key, dgfy_account_id, applicant_issuer, applicant_subject,
                  tenant_id, payload, status, status_version, company_access_version, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, 0, ?)`,
                { replacements: [id, intentType, idempotencyKey, dgfyAccountId, applicantIssuer, applicantSubject, tenantId, JSON.stringify(payload || {}), expiresAt] }
            );
        } catch (error) {
            // A concurrent request may win the unique idempotency key race.
            // Return its durable result instead of creating a second intent.
            if (error?.original?.code !== 'ER_DUP_ENTRY' && error?.parent?.code !== 'ER_DUP_ENTRY') throw error;
            const raced = await sequelize.query(
                'SELECT * FROM dgfy_dglaundry_intents WHERE idempotency_key = ? LIMIT 1',
                { replacements: [idempotencyKey], type: QueryTypes.SELECT }
            );
            if (raced[0]) return { row: raced[0], created: false };
            throw error;
        }
        const rows = await sequelize.query(
            'SELECT * FROM dgfy_dglaundry_intents WHERE id = ? LIMIT 1',
            { replacements: [id], type: QueryTypes.SELECT }
        );
        return { row: rows[0], created: true };
    },

    async findIntent(id) {
        const rows = await sequelize.query(
            'SELECT * FROM dgfy_dglaundry_intents WHERE id = ? LIMIT 1',
            { replacements: [id], type: QueryTypes.SELECT }
        );
        return rows[0] || null;
    },

    async findRegistrationIntentAuthority({ id, transaction = null }) {
        const options = { replacements: [id], type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) };
        const rows = await sequelize.query(
            "SELECT * FROM dgfy_dglaundry_intents WHERE id = ? AND intent_type = 'registration' LIMIT 1",
            options
        );
        const row = rows[0];
        if (!row) return null;
        const payload = parseSettings(row.payload);
        const issuer = String(row.applicant_issuer || payload.issuer || '').trim() || null;
        const subject = String(row.applicant_subject || payload.subject || '').trim() || null;
        const account = issuer === ISSUER && subject
            ? await DgfyAccount.findByPk(subject, transaction ? { transaction } : {})
            : null;
        const company = row.status === 'approved' && row.tenant_id
            ? await Tenant.findByPk(row.tenant_id, transaction ? { transaction } : {})
            : null;
        const membership = company && account
            ? await DgfyAccountTenantMembership.findOne({
                where: { dgfy_account_id: account.id, tenant_id: company.id },
                ...(transaction ? { transaction } : {})
            })
            : null;
        const locationRows = company
            ? await sequelize.query(
                'SELECT * FROM dgfy_dglaundry_provider_locations WHERE registration_intent_id = ? AND company_id = ? LIMIT 1',
                { replacements: [row.id, company.id], type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) }
            )
            : [];
        const location = locationRows[0] || null;
        const settings = parseSettings(company?.settings);
        return {
            row,
            payload,
            issuer,
            subject,
            account,
            company,
            membership,
            location,
            businessMode: settings.business_mode || settings.workflow_mode || 'laundry'
        };
    },

    async listRegistrationIntents({ search = '', status = null, limit = 20, offset = 0 }) {
        const where = ["i.intent_type = 'registration'"];
        const replacements = [ISSUER];
        if (status) {
            where.push('i.status = ?');
            replacements.push(status);
        }
        if (search) {
            const pattern = `%${search}%`;
            where.push(`(
                i.id LIKE ?
                OR JSON_UNQUOTE(JSON_EXTRACT(i.payload, '$.organizationName')) LIKE ?
                OR JSON_UNQUOTE(JSON_EXTRACT(i.payload, '$.company_name')) LIKE ?
                OR JSON_UNQUOTE(JSON_EXTRACT(i.payload, '$.branchName')) LIKE ?
                OR a.email LIKE ?
            )`);
            replacements.push(pattern, pattern, pattern, pattern, pattern);
        }
        const join = `LEFT JOIN dgfy_accounts a
            ON a.id = COALESCE(i.applicant_subject, JSON_UNQUOTE(JSON_EXTRACT(i.payload, '$.subject')))
            AND COALESCE(i.applicant_issuer, JSON_UNQUOTE(JSON_EXTRACT(i.payload, '$.issuer'))) = ?`;
        const whereSql = where.join(' AND ');
        const countRows = await sequelize.query(
            `SELECT COUNT(*) AS total FROM dgfy_dglaundry_intents i ${join} WHERE ${whereSql}`,
            { replacements, type: QueryTypes.SELECT }
        );
        const rows = await sequelize.query(
            `SELECT i.id, i.intent_type, i.status, i.status_version, i.company_access_version,
                    i.applicant_issuer, i.applicant_subject, i.tenant_id, i.payload,
                    i.decision, i.decision_reason, i.decided_at, i.created_at, i.updated_at,
                    a.id AS resolved_account_id, a.first_name, a.last_name, a.email, a.is_active AS account_is_active, a.deleted_at AS account_deleted_at
             FROM dgfy_dglaundry_intents i ${join}
             WHERE ${whereSql}
             ORDER BY i.created_at DESC, i.id DESC
             LIMIT ? OFFSET ?`,
            { replacements: [...replacements, limit, offset], type: QueryTypes.SELECT }
        );
        const items = rows.map((row) => {
            const payload = parseSettings(row.payload);
            const issuer = String(row.applicant_issuer || payload.issuer || '').trim() || null;
            const subject = String(row.applicant_subject || payload.subject || '').trim() || null;
            return {
                intentId: row.id,
                status: row.status,
                statusVersion: Number(row.status_version || 1),
                companyAccessVersion: Number(row.company_access_version || 0),
                organizationName: payload.organizationName || payload.company_name || '',
                branchName: payload.branchName || '',
                branchCode: payload.branchCode || '',
                applicant: {
                    issuer,
                    subject,
                    accountId: issuer === ISSUER ? row.resolved_account_id || null : null,
                    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
                    email: row.email || null,
                    identityVerified: issuer === ISSUER && Boolean(row.resolved_account_id) && Boolean(row.account_is_active) && !row.account_deleted_at
                },
                decision: row.decision || null,
                reason: row.decision_reason || null,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                decidedAt: row.decided_at || null
            };
        });
        return { items, total: Number(countRows[0]?.total || 0) };
    },

    async decideRegistrationIntent({ intentId, decision, expectedStatusVersion, reason = null, adminId = null }) {
        return sequelize.transaction(async (transaction) => {
            const intentRows = await sequelize.query(
                "SELECT * FROM dgfy_dglaundry_intents WHERE id = ? AND intent_type = 'registration' LIMIT 1 FOR UPDATE",
                { replacements: [intentId], type: QueryTypes.SELECT, transaction }
            );
            const row = intentRows[0];
            if (!row) throw Object.assign(new Error('DGLAUNDRY_REGISTRATION_NOT_FOUND'), { code: 'DGLAUNDRY_REGISTRATION_NOT_FOUND' });

            const normalizedReason = reason ? String(reason).trim() : null;
            const sameDecisionRetry = row.decision === decision
                && Number(row.decision_expected_version) === expectedStatusVersion
                && String(row.decision_reason || '') === String(normalizedReason || '');
            if (sameDecisionRetry) {
                const authority = await this.findRegistrationIntentAuthority({ id: intentId, transaction });
                return { idempotentReplay: true, authority };
            }
            if (Number(row.status_version || 1) !== expectedStatusVersion) {
                throw Object.assign(new Error('DGLAUNDRY_REGISTRATION_STALE_VERSION'), { code: 'DGLAUNDRY_REGISTRATION_STALE_VERSION' });
            }
            if (row.status !== 'pending') {
                throw Object.assign(new Error('DGLAUNDRY_REGISTRATION_ALREADY_DECIDED'), { code: 'DGLAUNDRY_REGISTRATION_ALREADY_DECIDED' });
            }

            let company = null;
            let membership = null;
            let location = null;
            let applicant = null;
            if (decision === 'approve') {
                const payload = parseSettings(row.payload);
                const issuer = String(row.applicant_issuer || payload.issuer || '').trim();
                const subject = String(row.applicant_subject || payload.subject || '').trim();
                if (issuer !== ISSUER || !subject) {
                    throw Object.assign(new Error('DGLAUNDRY_REGISTRATION_APPLICANT_IDENTITY_INVALID'), { code: 'DGLAUNDRY_REGISTRATION_APPLICANT_IDENTITY_INVALID' });
                }
                applicant = await DgfyAccount.findByPk(subject, { transaction, lock: transaction.LOCK.UPDATE });
                if (!applicant || !applicant.is_active || applicant.deleted_at) {
                    throw Object.assign(new Error('DGLAUNDRY_REGISTRATION_APPLICANT_UNAVAILABLE'), { code: 'DGLAUNDRY_REGISTRATION_APPLICANT_UNAVAILABLE' });
                }
                const companyName = String(payload.organizationName || payload.company_name || '').trim();
                const locationName = String(payload.branchName || '').trim();
                if (!companyName || !locationName) {
                    throw Object.assign(new Error('DGLAUNDRY_REGISTRATION_DETAILS_INCOMPLETE'), { code: 'DGLAUNDRY_REGISTRATION_DETAILS_INCOMPLETE' });
                }

                const companyId = crypto.randomUUID();
                const companyToken = crypto.randomBytes(32).toString('hex');
                const now = new Date();
                company = await Tenant.create({
                    id: companyId,
                    name: companyName.slice(0, 255),
                    db_name: `dglaundry_${companyId.replaceAll('-', '')}`,
                    company_token: companyToken,
                    db_host: 'localhost',
                    status: 'active',
                    admin_email: applicant.email,
                    admin_phone: applicant.phone,
                    owner_dgfy_account_id: applicant.id,
                    is_demo: false,
                    provisioning_source: 'public_registration',
                    ownership_status: 'claimed',
                    plan: 'premium',
                    settings: {
                        business_mode: 'laundry',
                        workflow_mode: 'laundry',
                        runtime_owner: 'dglaundry',
                        dgfy_storefront: true,
                        ims: false,
                        pos: false,
                        operations_url: resolveDglaundryOrigin() || null,
                        first_provider_location_name: locationName.slice(0, 255),
                        registration_intent_id: row.id
                    },
                }, { transaction });
                membership = await DgfyAccountTenantMembership.create({
                    dgfy_account_id: applicant.id,
                    tenant_id: company.id,
                    role: 'owner',
                    status: 'accepted',
                    source: 'founder',
                    accepted_at: now
                }, { transaction });
                const locationId = crypto.randomUUID();
                await sequelize.query(
                    `INSERT INTO dgfy_dglaundry_provider_locations
                     (id, company_id, registration_intent_id, name, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, 'active', NOW(), NOW())`,
                    { replacements: [locationId, company.id, row.id, locationName.slice(0, 255)], transaction }
                );
                location = { id: locationId, company_id: company.id, registration_intent_id: row.id, name: locationName, status: 'active' };
            }

            const nextStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'correction_required';
            const nextStatusVersion = Number(row.status_version || 1) + 1;
            const nextCompanyAccessVersion = decision === 'approve' ? Number(row.company_access_version || 0) + 1 : Number(row.company_access_version || 0);
            const updateResult = await sequelize.query(
                `UPDATE dgfy_dglaundry_intents
                 SET status = ?, status_version = ?, company_access_version = ?, decision = ?,
                     decision_expected_version = ?, decision_reason = ?, decided_by = ?, decided_at = NOW(),
                     dgfy_account_id = ?, tenant_id = ?,
                     applicant_issuer = COALESCE(applicant_issuer, ?), applicant_subject = COALESCE(applicant_subject, ?),
                     updated_at = NOW()
                 WHERE id = ? AND status_version = ? AND status = 'pending'`,
                { replacements: [nextStatus, nextStatusVersion, nextCompanyAccessVersion, decision, expectedStatusVersion,
                    normalizedReason, adminId ? String(adminId).slice(0, 120) : null, applicant?.id || null, company?.id || null,
                    applicant ? ISSUER : null, applicant?.id || null, row.id, expectedStatusVersion], transaction }
            );
            const metadata = updateResult?.[1] || updateResult;
            if (Number(metadata?.affectedRows ?? metadata?.rowCount ?? 1) !== 1) {
                throw Object.assign(new Error('DGLAUNDRY_REGISTRATION_STALE_VERSION'), { code: 'DGLAUNDRY_REGISTRATION_STALE_VERSION' });
            }

            await sequelize.query(
                `INSERT INTO dgfy_dglaundry_audit_logs
                 (id, action, dgfy_account_id, dgfy_company_id, metadata)
                 VALUES (?, ?, ?, ?, ?)`,
                { replacements: [crypto.randomUUID(), `registration_${decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'correction_requested'}`,
                    applicant?.id || row.dgfy_account_id || null, company?.id || row.tenant_id || null,
                    JSON.stringify({ intent_id: row.id, decision, expected_status_version: expectedStatusVersion,
                        status_version: nextStatusVersion, company_access_version: nextCompanyAccessVersion,
                        admin_id: adminId ? String(adminId) : null, reason: normalizedReason,
                        location_id: location?.id || null, membership_id: membership?.id || null })], transaction }
            );

            const authority = await this.findRegistrationIntentAuthority({ id: intentId, transaction });
            return { idempotentReplay: false, authority };
        });
    },

    async listProviderLocations({ companyId }) {
        return sequelize.query(
            "SELECT id AS location_id, company_id, registration_intent_id, name, status FROM dgfy_dglaundry_provider_locations WHERE company_id = ? AND status = 'active' ORDER BY created_at, id",
            { replacements: [companyId], type: QueryTypes.SELECT }
        );
    },

    async createMapping({ issuer, subject, dgfyCompanyId, dgfyLocationId, dglaundryOrganizationId, dglaundryBranchId, approvedBy }) {
        const id = crypto.randomUUID();
        await sequelize.query(
            `INSERT INTO dgfy_dglaundry_mappings
             (id, issuer, subject, dgfy_company_id, dgfy_location_id, dglaundry_organization_id,
              dglaundry_branch_id, status, mapping_version, approved_by, approved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, NOW())
             ON DUPLICATE KEY UPDATE
               status = 'active', mapping_version = mapping_version + 1,
               approved_by = VALUES(approved_by), approved_at = NOW()`,
            { replacements: [id, issuer, subject, dgfyCompanyId, dgfyLocationId, dglaundryOrganizationId, dglaundryBranchId, approvedBy] }
        );
        const rows = await sequelize.query(
            'SELECT * FROM dgfy_dglaundry_mappings WHERE dgfy_company_id = ? AND (dgfy_location_id <=> ?) LIMIT 1',
            { replacements: [dgfyCompanyId, dgfyLocationId], type: QueryTypes.SELECT }
        );
        return rows[0] || null;
    },

    async listMappings({ dgfyCompanyId = null }) {
        const sql = dgfyCompanyId
            ? 'SELECT * FROM dgfy_dglaundry_mappings WHERE dgfy_company_id = ? AND status = \'active\' ORDER BY dgfy_location_id'
            : 'SELECT * FROM dgfy_dglaundry_mappings WHERE status = \'active\' ORDER BY dgfy_company_id, dgfy_location_id';
        const rows = await sequelize.query(sql, {
            replacements: dgfyCompanyId ? [dgfyCompanyId] : [],
            type: QueryTypes.SELECT
        });
        return rows;
    },

    async audit({ action, dgfyAccountId = null, companyId = null, metadata = {}, transaction = null }) {
        await sequelize.query(
            `INSERT INTO dgfy_dglaundry_audit_logs
             (id, action, dgfy_account_id, dgfy_company_id, metadata)
             VALUES (?, ?, ?, ?, ?)`,
            { replacements: [crypto.randomUUID(), action, dgfyAccountId, companyId, JSON.stringify(metadata)], ...(transaction ? { transaction } : {}) }
        );
    }
};
