import crypto from 'crypto';
import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (
    value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

const normalizeDesign = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
};

const serialize = (row) => {
    if (!row) return null;
    const payload = toPlain(row) || {};
    return {
        storefront_qr_code_id: Number(payload.storefront_qr_code_id),
        public_token: payload.public_token,
        location_id: Number(payload.location_id),
        target_type: payload.target_type,
        folder_id: payload.folder_id == null ? null : Number(payload.folder_id),
        label: payload.label || '',
        design: normalizeDesign(payload.design),
        is_active: payload.is_active !== false,
        created_by: payload.created_by == null ? null : Number(payload.created_by),
        updated_by: payload.updated_by == null ? null : Number(payload.updated_by),
        created_at: payload.created_at || null,
        updated_at: payload.updated_at || null,
        location: payload.location ? toPlain(payload.location) : null,
        folder: payload.folder ? toPlain(payload.folder) : null
    };
};

const nextPublicToken = () => `DGFYQR_${crypto.randomBytes(18).toString('base64url')}`;

const parseStorefrontSlug = (setting) => {
    if (!setting) return '';
    const rawValue = setting.data_type === 'json'
        ? (() => {
            try { return JSON.parse(setting.setting_value); } catch { return ''; }
        })()
        : setting.setting_value;
    return String(rawValue || '').trim().toLowerCase();
};

const locationInclude = ({ activeOnly = true } = {}) => ({
    model: dbStore.get('TenantLocation'),
    as: 'location',
    required: true,
    ...(activeOnly ? { where: { is_active: true } } : {}),
    attributes: ['location_id', 'name', 'address_line', 'is_active', 'is_open', 'is_primary_storefront']
});

const folderInclude = () => ({
    model: dbStore.get('ItemFolder'),
    as: 'folder',
    required: false,
    where: { is_active: true, deleted_at: null },
    attributes: ['folder_id', 'name', 'description', 'is_active', 'deleted_at', 'sort_order']
});

export const storefrontQrCodeRepository = {
    async getStorefrontSlug() {
        const SystemSetting = dbStore.get('SystemSetting');
        if (!SystemSetting?.findOne) return null;
        const setting = await SystemSetting.findOne({
            where: { setting_key: 'store_tenant_slug' },
            attributes: ['setting_value', 'data_type']
        });
        return parseStorefrontSlug(setting) || null;
    },

    async list({ locationId = null, allowedLocationIds = null } = {}) {
        const StorefrontQrCode = dbStore.get('StorefrontQrCode');
        const where = {};
        const normalizedLocationId = Number.parseInt(locationId, 10);
        if (Number.isInteger(normalizedLocationId) && normalizedLocationId > 0) {
            where.location_id = normalizedLocationId;
        } else if (Array.isArray(allowedLocationIds)) {
            where.location_id = { [Op.in]: allowedLocationIds };
        }

        const rows = await StorefrontQrCode.findAll({
            where,
            include: [locationInclude(), folderInclude()],
            order: [
                ['is_active', 'DESC'],
                ['updated_at', 'DESC'],
                ['storefront_qr_code_id', 'DESC']
            ]
        });
        return rows.map(serialize);
    },

    async findById(id) {
        const StorefrontQrCode = dbStore.get('StorefrontQrCode');
        const row = await StorefrontQrCode.findByPk(id, {
            include: [locationInclude({ activeOnly: false }), folderInclude()]
        });
        return serialize(row);
    },

    async findActiveByToken({ token, requestedLocationId = null } = {}) {
        const StorefrontQrCode = dbStore.get('StorefrontQrCode');
        const row = await StorefrontQrCode.findOne({
            where: {
                public_token: String(token || '').trim(),
                is_active: true
            },
            include: [locationInclude(), folderInclude()]
        });
        if (!row) return { status: 'not_found', reason_code: 'QR_CODE_NOT_FOUND' };

        const payload = serialize(row);
        const normalizedRequestedLocationId = Number.parseInt(requestedLocationId, 10);
        if (
            Number.isInteger(normalizedRequestedLocationId)
            && normalizedRequestedLocationId > 0
            && normalizedRequestedLocationId !== payload.location_id
        ) {
            return {
                status: 'location_mismatch',
                reason_code: 'QR_CODE_BRANCH_MISMATCH',
                location_id: payload.location_id
            };
        }

        if (payload.target_type === 'category' && !payload.folder) {
            return { status: 'not_found', reason_code: 'QR_CODE_CATEGORY_NOT_FOUND' };
        }

        return { status: 'resolved', reason_code: null, qr_code: payload };
    },

    async findActiveLocation(locationId) {
        const TenantLocation = dbStore.get('TenantLocation');
        const row = await TenantLocation.findOne({
            where: { location_id: locationId, is_active: true },
            attributes: ['location_id', 'name', 'address_line', 'is_active', 'is_open', 'is_primary_storefront']
        });
        return toPlain(row);
    },

    async findActiveFolder(folderId) {
        const ItemFolder = dbStore.get('ItemFolder');
        const row = await ItemFolder.findOne({
            where: { folder_id: folderId, is_active: true, deleted_at: null },
            attributes: ['folder_id', 'name', 'description', 'is_active', 'deleted_at', 'sort_order']
        });
        return toPlain(row);
    },

    async create(values = {}) {
        const StorefrontQrCode = dbStore.get('StorefrontQrCode');
        let publicToken = nextPublicToken();
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const existing = await StorefrontQrCode.findOne({ where: { public_token: publicToken }, attributes: ['storefront_qr_code_id'] });
            if (!existing) break;
            publicToken = nextPublicToken();
        }

        const row = await StorefrontQrCode.create({
            ...values,
            public_token: publicToken
        });
        return this.findById(row.storefront_qr_code_id);
    },

    async update(id, values = {}) {
        const StorefrontQrCode = dbStore.get('StorefrontQrCode');
        await StorefrontQrCode.update(values, { where: { storefront_qr_code_id: id } });
        return this.findById(id);
    },

    async deactivate(id, updatedBy = null) {
        return this.update(id, { is_active: false, updated_by: updatedBy });
    }
};

export default storefrontQrCodeRepository;
