import dbStore from '../../../utils/dbStore.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import {
    CUSTOMER_ACCESS_MODES,
    DEFAULT_CUSTOMER_ACCESS_MODE,
    normalizeCustomerAccessMode
} from '../../shared/utils/customerAccessPolicy.js';

export const TENANT_CAPABILITY_SETTING_KEYS = Object.freeze({
    ims: 'tenant_ims_enabled',
    pos: 'tenant_pos_enabled',
    storefrontVisible: 'store_is_visible',
    customerAccessMode: 'customer_access_mode'
});

const DEFAULT_CAPABILITIES = Object.freeze({
    ims_enabled: true,
    pos_enabled: true,
    storefront_visible: false,
    customer_access_mode: DEFAULT_CUSTOMER_ACCESS_MODE
});

const parseBoolean = (value, fallback = true) => {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

const serializeBoolean = (value) => (value === true ? 'true' : 'false');

const isFiniteCoordinate = (value) => Number.isFinite(Number(value));

const buildStorefrontReadiness = async () => {
    const TenantLocation = dbStore.get('TenantLocation');
    if (!TenantLocation) {
        return {
            has_active_primary_location: false,
            has_coordinates: false,
            publishable: false,
            reason: 'tenant_location_model_unavailable'
        };
    }

    const primaryLocation = await TenantLocation.findOne({
        where: {
            is_primary_storefront: true,
            is_active: true
        },
        attributes: ['location_id', 'name', 'latitude', 'longitude', 'storefront_last_synced_at']
    });

    if (!primaryLocation) {
        return {
            has_active_primary_location: false,
            has_coordinates: false,
            publishable: false,
            reason: 'missing_active_primary_storefront_location'
        };
    }

    const plain = typeof primaryLocation.get === 'function'
        ? primaryLocation.get({ plain: true })
        : primaryLocation;
    const hasCoordinates = isFiniteCoordinate(plain.latitude) && isFiniteCoordinate(plain.longitude);

    return {
        has_active_primary_location: true,
        has_coordinates: hasCoordinates,
        publishable: hasCoordinates,
        location_id: plain.location_id ?? null,
        location_name: plain.name || null,
        storefront_last_synced_at: plain.storefront_last_synced_at || null,
        reason: hasCoordinates ? null : 'missing_primary_storefront_coordinates'
    };
};

const toSettingsMap = (rows = []) => {
    const map = {};
    rows.forEach((row) => {
        const plain = typeof row?.get === 'function' ? row.get({ plain: true }) : row;
        if (plain?.setting_key) {
            map[plain.setting_key] = plain.setting_value;
        }
    });
    return map;
};

export const normalizeTenantCapabilities = (settings = {}) => ({
    ims_enabled: parseBoolean(settings[TENANT_CAPABILITY_SETTING_KEYS.ims], DEFAULT_CAPABILITIES.ims_enabled),
    pos_enabled: parseBoolean(settings[TENANT_CAPABILITY_SETTING_KEYS.pos], DEFAULT_CAPABILITIES.pos_enabled),
    storefront_visible: parseBoolean(
        settings[TENANT_CAPABILITY_SETTING_KEYS.storefrontVisible],
        DEFAULT_CAPABILITIES.storefront_visible
    ),
    customer_access_mode: normalizeCustomerAccessMode(
        settings[TENANT_CAPABILITY_SETTING_KEYS.customerAccessMode],
        DEFAULT_CAPABILITIES.customer_access_mode
    )
});

export const readTenantCapabilities = async ({ tenant, tenantConnector }) => {
    if (!tenant?.db_name) {
        return {
            ...DEFAULT_CAPABILITIES,
            storefront_readiness: {
                has_active_primary_location: false,
                has_coordinates: false,
                publishable: false,
                visible_and_publishable: false,
                reason: 'tenant_database_unavailable'
            },
            unavailable: true
        };
    }

    const tenantSequelize = await tenantConnector.getConnection(tenant);
    const tenantModels = getTenantModels(tenantSequelize);

    return dbStore.run({
        ...tenantModels,
        sequelize: tenantSequelize,
        tenantId: tenant.id,
        tenantToken: tenant.company_token,
        tenantName: tenant.name
    }, async () => {
        const SystemSetting = dbStore.get('SystemSetting');
        const rows = await SystemSetting.findAll({
            where: { setting_key: Object.values(TENANT_CAPABILITY_SETTING_KEYS) },
            attributes: ['setting_key', 'setting_value']
        });
        const capabilities = normalizeTenantCapabilities(toSettingsMap(rows));
        const storefront_readiness = await buildStorefrontReadiness();
        return {
            ...capabilities,
            storefront_readiness: {
                ...storefront_readiness,
                visible_and_publishable: capabilities.storefront_visible === true && storefront_readiness.publishable === true
            }
        };
    });
};

export const normalizeTenantCapabilityPatch = (payload = {}) => {
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'ims_enabled')) {
        if (typeof payload.ims_enabled !== 'boolean') {
            throw new Error('ims_enabled must be a boolean');
        }
        patch[TENANT_CAPABILITY_SETTING_KEYS.ims] = serializeBoolean(payload.ims_enabled);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'pos_enabled')) {
        if (typeof payload.pos_enabled !== 'boolean') {
            throw new Error('pos_enabled must be a boolean');
        }
        patch[TENANT_CAPABILITY_SETTING_KEYS.pos] = serializeBoolean(payload.pos_enabled);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'storefront_visible')) {
        if (typeof payload.storefront_visible !== 'boolean') {
            throw new Error('storefront_visible must be a boolean');
        }
        patch[TENANT_CAPABILITY_SETTING_KEYS.storefrontVisible] = serializeBoolean(payload.storefront_visible);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'customer_access_mode')) {
        const normalized = String(payload.customer_access_mode || '').trim().toLowerCase();
        if (!CUSTOMER_ACCESS_MODES.includes(normalized)) {
            throw new Error(`customer_access_mode must be one of: ${CUSTOMER_ACCESS_MODES.join(', ')}`);
        }
        patch[TENANT_CAPABILITY_SETTING_KEYS.customerAccessMode] = normalized;
    }

    return patch;
};
