import { Op } from 'sequelize';
import { Tenant, StorefrontDiscoveryIndex } from '../models/index.js';
import tenantConnector from '../utils/TenantConnector.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';

const VISIBILITY_SETTING_KEY = 'store_is_visible';
const STORE_HAS_NO_LOCATION_SETTING_KEY = 'store_has_no_location';

const parseBooleanSetting = (value) => {
    if (value === true || value === false) return value;
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    return null;
};

const toPlain = (entry) => {
    if (!entry) return null;
    if (typeof entry.get === 'function') return entry.get({ plain: true });
    if (typeof entry.toJSON === 'function') return entry.toJSON();
    return entry;
};

const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLocation = (entry) => {
    const plain = toPlain(entry) || {};
    const locationId = Number(plain.location_id);
    return {
        location_id: Number.isInteger(locationId) && locationId > 0 ? locationId : null,
        name: plain.name || null,
        is_active: plain.is_active === true || plain.is_active === 1 || plain.is_active === '1',
        is_primary_storefront: plain.is_primary_storefront === true
            || plain.is_primary_storefront === 1
            || plain.is_primary_storefront === '1',
        latitude: toNumberOrNull(plain.latitude),
        longitude: toNumberOrNull(plain.longitude)
    };
};

const hasFiniteCoordinates = (location) => (
    toNumberOrNull(location?.latitude) !== null && toNumberOrNull(location?.longitude) !== null
);

const addIssue = (issues, severity, code, message) => {
    issues.push({ severity, code, message });
};

const summarizeSeverity = (issues) => {
    if (issues.some((issue) => issue.severity === 'critical')) return 'critical';
    if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
    return 'healthy';
};

const inspectTenant = async ({
    tenant,
    indexModel,
    tenantConnectorService,
    tenantModelFactory,
    repairMissingSettings = false
}) => {
    const tenantPlain = toPlain(tenant) || {};
    const tenantId = tenantPlain.id || null;
    const indexRow = toPlain(await indexModel.findOne({ where: { tenant_id: tenantId } }));
    const indexIsVisible = indexRow?.is_visible === true || indexRow?.is_visible === 1 || indexRow?.is_visible === '1';
    const rawIndexLocationId = toNumberOrNull(indexRow?.location_id);
    const indexLocationId = Number.isInteger(rawIndexLocationId) && rawIndexLocationId > 0
        ? rawIndexLocationId
        : null;
    const indexHasCoordinates = hasFiniteCoordinates(indexRow);

    const issues = [];
    let settingValue = null;
    let settingMissing = true;
    let noLocationSettingValue = null;
    let noLocationSettingMissing = true;
    let locations = [];
    let repairedMissingSetting = false;

    try {
        const tenantSequelize = await tenantConnectorService.getConnection(tenantPlain);
        const { SystemSetting, TenantLocation } = tenantModelFactory(tenantSequelize);

        const settingsRows = await SystemSetting.findAll({
            where: { setting_key: { [Op.in]: [VISIBILITY_SETTING_KEY, STORE_HAS_NO_LOCATION_SETTING_KEY] } }
        });
        const settingRowsByKey = new Map((settingsRows || []).map((row) => {
            const plain = toPlain(row);
            return [plain?.setting_key, plain];
        }));
        const settingRow = settingRowsByKey.get(VISIBILITY_SETTING_KEY);
        const noLocationSettingRow = settingRowsByKey.get(STORE_HAS_NO_LOCATION_SETTING_KEY);
        settingMissing = !settingRow;
        settingValue = parseBooleanSetting(settingRow?.setting_value);
        noLocationSettingMissing = !noLocationSettingRow;
        noLocationSettingValue = parseBooleanSetting(noLocationSettingRow?.setting_value);

        if (settingMissing && repairMissingSettings) {
            const repairedValue = indexIsVisible === true;
            await tenantSequelize.query(
                `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
                 VALUES (?, ?, 'boolean', ?, NOW())
                 ON DUPLICATE KEY UPDATE setting_key = setting_key`,
                {
                    replacements: [
                        VISIBILITY_SETTING_KEY,
                        repairedValue ? 'true' : 'false',
                        'Controls whether the tenant appears in public discovery and public storefront profile reads'
                    ]
                }
            );
            settingMissing = false;
            settingValue = repairedValue;
            repairedMissingSetting = true;
        }

        const locationRows = await TenantLocation.findAll({
            where: { is_active: true },
            order: [
                ['is_primary_storefront', 'DESC'],
                ['updated_at', 'DESC'],
                ['location_id', 'DESC']
            ]
        });
        locations = (locationRows || []).map(normalizeLocation);
    } catch (error) {
        addIssue(
            issues,
            'critical',
            'tenant_inspection_failed',
            `Tenant database inspection failed: ${error?.message || 'unknown_error'}`
        );
    }

    const activePrimary = locations.find((location) => (
        location.is_active === true
        && location.is_primary_storefront === true
        && hasFiniteCoordinates(location)
    )) || null;
    const activeIndexedLocation = locations.find((location) => (
        location.location_id === indexLocationId
        && location.is_active === true
        && hasFiniteCoordinates(location)
    )) || null;

    if (repairedMissingSetting) {
        addIssue(
            issues,
            'warning',
            'repaired_missing_store_is_visible_setting',
            'Tenant was missing store_is_visible; audit inserted an explicit value matching current index visibility'
        );
    } else if (settingMissing) {
        addIssue(
            issues,
            indexIsVisible ? 'critical' : 'warning',
            'missing_store_is_visible_setting',
            'Tenant is missing an explicit store_is_visible setting'
        );
    } else if (settingValue == null) {
        addIssue(
            issues,
            'critical',
            'invalid_store_is_visible_setting',
            'Tenant store_is_visible setting is not a recognizable boolean'
        );
    }

    if (settingValue === false && indexRow) {
        addIssue(
            issues,
            'critical',
            'hidden_tenant_indexed',
            'Tenant is hidden but still has a storefront discovery index row'
        );
    }

    if (settingValue === true && !activePrimary) {
        if (noLocationSettingValue === true) {
            // Searchable no-location storefronts are explicitly valid without a public map pin.
        } else if (indexRow && indexIsVisible && !indexHasCoordinates && indexLocationId === null) {
            addIssue(
                issues,
                'critical',
                'missing_store_has_no_location_setting_for_nullable_index',
                'Tenant has a nullable-coordinate discovery row but is not explicitly marked as a no-location storefront'
            );
        } else {
        addIssue(
            issues,
            'warning',
            'visible_without_active_primary_pin',
            'Tenant is public-visible but has no active primary storefront pin with finite coordinates'
        );
        }
    }

    if (settingValue === true && noLocationSettingValue === true && indexRow && indexIsVisible && (indexHasCoordinates || indexLocationId !== null)) {
        addIssue(
            issues,
            'critical',
            'no_location_store_indexed_with_coordinates',
            'Tenant is marked as no-location but discovery index still publishes a map location'
        );
    }

    if (settingValue === true && activePrimary && !indexRow) {
        addIssue(
            issues,
            'warning',
            'visible_tenant_not_indexed',
            'Tenant is public-visible with an active primary pin but has no discovery index row'
        );
    }

    if (settingValue === true && noLocationSettingValue === true && !indexRow) {
        addIssue(
            issues,
            'warning',
            'visible_no_location_store_not_indexed',
            'Tenant is public-visible and marked no-location but has no searchable discovery index row'
        );
    }

    if (indexRow && indexIsVisible && noLocationSettingValue !== true && activeIndexedLocation && activeIndexedLocation.is_primary_storefront !== true) {
        addIssue(
            issues,
            'warning',
            'fallback_location_publication',
            'Discovery index is publishing an active non-primary fallback location'
        );
    }

    if (indexRow && indexIsVisible && noLocationSettingValue !== true && !activeIndexedLocation) {
        addIssue(
            issues,
            'critical',
            'indexed_location_not_active_or_missing',
            'Discovery index points to a missing, inactive, or coordinate-invalid location'
        );
    }

    return {
        tenant_id: tenantId,
        tenant_name: tenantPlain.name || null,
        db_name: tenantPlain.db_name || null,
        slug: indexRow?.slug || null,
        store_is_visible: settingValue,
        store_is_visible_missing: settingMissing,
        store_has_no_location: noLocationSettingValue,
        store_has_no_location_missing: noLocationSettingMissing,
        store_is_visible_repaired: repairedMissingSetting,
        discovery_indexed: Boolean(indexRow),
        discovery_index_visible: indexIsVisible,
        discovery_location_id: indexLocationId,
        active_primary_location_id: activePrimary?.location_id || null,
        active_location_count: locations.filter((location) => location.is_active === true).length,
        issues,
        status: summarizeSeverity(issues)
    };
};

export const auditStorefrontPublicVisibility = async ({
    tenantIds = null,
    repairMissingSettings = false,
    tenantModel = Tenant,
    indexModel = StorefrontDiscoveryIndex,
    tenantConnectorService = tenantConnector,
    tenantModelFactory = getTenantModels
} = {}) => {
    const normalizedTenantIds = Array.isArray(tenantIds)
        ? tenantIds.map((id) => String(id || '').trim()).filter(Boolean)
        : null;
    const where = { status: 'active' };
    if (normalizedTenantIds && normalizedTenantIds.length > 0) {
        where.id = { [Op.in]: normalizedTenantIds };
    }

    const tenants = await tenantModel.findAll({
        where,
        attributes: ['id', 'name', 'db_name', 'status']
    });

    const tenantsResult = [];
    for (const tenant of tenants || []) {
        tenantsResult.push(await inspectTenant({
            tenant,
            indexModel,
            tenantConnectorService,
            tenantModelFactory,
            repairMissingSettings
        }));
    }

    const summary = tenantsResult.reduce((acc, row) => {
        acc.total += 1;
        acc[row.status] = (acc[row.status] || 0) + 1;
        for (const issue of row.issues || []) {
            acc.issue_counts[issue.code] = (acc.issue_counts[issue.code] || 0) + 1;
        }
        return acc;
    }, {
        total: 0,
        healthy: 0,
        warning: 0,
        critical: 0,
        issue_counts: {}
    });

    return {
        status: summary.critical > 0 ? 'critical' : summary.warning > 0 ? 'warning' : 'healthy',
        checked_at: new Date().toISOString(),
        summary,
        tenants: tenantsResult
    };
};

export default {
    auditStorefrontPublicVisibility
};
