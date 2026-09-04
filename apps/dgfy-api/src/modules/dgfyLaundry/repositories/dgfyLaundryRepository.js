import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import sequelize from '../../../config/database.js';
import {
    DgfyAccountTenantMembership,
    Tenant
} from '../../../models/index.js';

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

    async createIntent({ intentType, idempotencyKey, dgfyAccountId, tenantId = null, payload, expiresAt }) {
        const existing = await sequelize.query(
            'SELECT * FROM dgfy_dglaundry_intents WHERE idempotency_key = ? LIMIT 1',
            { replacements: [idempotencyKey], type: QueryTypes.SELECT }
        );
        if (existing[0]) return { row: existing[0], created: false };
        const id = crypto.randomUUID();
        try {
            await sequelize.query(
                `INSERT INTO dgfy_dglaundry_intents
                 (id, intent_type, idempotency_key, dgfy_account_id, tenant_id, payload, status, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
                { replacements: [id, intentType, idempotencyKey, dgfyAccountId, tenantId, JSON.stringify(payload || {}), expiresAt] }
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

    async audit({ action, dgfyAccountId = null, companyId = null, metadata = {} }) {
        await sequelize.query(
            `INSERT INTO dgfy_dglaundry_audit_logs
             (id, action, dgfy_account_id, dgfy_company_id, metadata)
             VALUES (?, ?, ?, ?, ?)`,
            { replacements: [crypto.randomUUID(), action, dgfyAccountId, companyId, JSON.stringify(metadata)] }
        );
    }
};
