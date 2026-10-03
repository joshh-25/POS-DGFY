import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import tenantConnector from '../../../utils/TenantConnector.js';
import { normalizeStorefrontBusinessHours } from '../../shared/utils/storefrontBusinessHours.js';

const upsertSetting = async (SystemSetting, key, value, dataType, description, transaction) => {
    const serialized = dataType === 'json' ? JSON.stringify(value) : String(value ?? '');
    const existing = await SystemSetting.findOne({ where: { setting_key: key }, transaction });
    if (existing) {
        await existing.update({ setting_value: serialized, data_type: dataType, description }, { transaction });
        return existing;
    }
    return SystemSetting.create({ setting_key: key, setting_value: serialized, data_type: dataType, description }, { transaction });
};

const parseSnapshot = (application) => {
    const attempts = application?.attempts || [];
    return attempts[0]?.submission_snapshot || {};
};

const DAY_KEY_BY_TOKEN = Object.freeze({
    sun: 'sun', sunday: 'sun',
    mon: 'mon', monday: 'mon',
    tue: 'tue', tues: 'tue', tuesday: 'tue',
    wed: 'wed', wednesday: 'wed',
    thu: 'thu', thur: 'thu', thurs: 'thu', thursday: 'thu',
    fri: 'fri', friday: 'fri',
    sat: 'sat', saturday: 'sat'
});

const toCanonicalBusinessHours = (hours) => {
    const weekly = {};
    for (const day of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) {
        weekly[day] = { enabled: false, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] };
    }
    for (const entry of Array.isArray(hours) ? hours : []) {
        const key = DAY_KEY_BY_TOKEN[String(entry?.day || '').trim().toLowerCase()];
        if (!key) continue;
        const open = String(entry?.open || '09:00').trim();
        const close = String(entry?.close || '18:00').trim();
        weekly[key] = {
            enabled: entry?.closed !== true,
            open,
            close,
            intervals: [{ open, close }]
        };
    }
    return normalizeStorefrontBusinessHours({ mode: 'weekly', timezone: 'Asia/Manila', weekly });
};

export const buildMaterializeApprovedCompanyRegistration = ({ connector = tenantConnector, modelFactory = getTenantModels, logger = console } = {}) => async ({ tenant, application }) => {
    const snapshot = parseSnapshot(application);
    const sequelize = await connector.getConnection(tenant);
    const models = modelFactory(sequelize);
    const { SystemSetting, TenantLocation } = models;
    if (!SystemSetting) throw new Error('Tenant SystemSetting model is unavailable.');

    return sequelize.transaction(async (transaction) => {
        await upsertSetting(SystemSetting, 'pos_business_name', snapshot.company_name || tenant.name, 'string', 'Business name captured during approved company registration.', transaction);
        await upsertSetting(SystemSetting, 'storefront_about', snapshot.storefront_profile?.description || '', 'string', 'Storefront description captured during approved company registration.', transaction);
        await upsertSetting(SystemSetting, 'storefront_phone', snapshot.storefront_profile?.phone || '', 'string', 'Storefront phone captured during approved company registration.', transaction);
        await upsertSetting(SystemSetting, 'storefront_email', snapshot.storefront_profile?.email || '', 'string', 'Storefront email captured during approved company registration.', transaction);
        await upsertSetting(SystemSetting, 'storefront_social_links', {
            facebook: snapshot.storefront_profile?.facebook || null,
            instagram: snapshot.storefront_profile?.instagram || null
        }, 'json', 'Storefront social links captured during approved company registration.', transaction);
        await upsertSetting(SystemSetting, 'storefront_delivery_partners', snapshot.delivery_partners || [], 'json', 'Delivery partners captured during approved company registration.', transaction);
        await upsertSetting(SystemSetting, 'storefront_hours', toCanonicalBusinessHours(snapshot.hours), 'json', 'Business hours captured during approved company registration.', transaction);
        await upsertSetting(SystemSetting, 'company_registration_snapshot', {
            application_id: application.id,
            attempt_no: application.current_attempt_no,
            business_type: snapshot.business_type || null,
            location: snapshot.location || {},
            menu_catalog_publication: 'explicit_review_required'
        }, 'json', 'Approved registration source snapshot. Menu uploads are never auto-published.', transaction);
        await upsertSetting(SystemSetting, 'company_registration_materialization', {
            application_id: application.id,
            attempt_no: application.current_attempt_no,
            materialization_key: `${application.id}:${application.current_attempt_no}`,
            materialized_at: new Date().toISOString()
        }, 'json', 'Idempotency marker for approved company registration materialization.', transaction);

        const location = snapshot.location || {};
        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);
        let locationMaterialized = false;
        if (TenantLocation && location.address_line && Number.isFinite(latitude) && Number.isFinite(longitude)) {
            const existing = await TenantLocation.findOne({ where: { is_primary_storefront: true }, transaction });
            const values = {
                name: location.name || snapshot.company_name || tenant.name,
                address_line: location.address_line,
                latitude,
                longitude,
                operating_hours: snapshot.hours || [],
                is_primary_storefront: true,
                is_active: true
            };
            if (existing) await existing.update(values, { transaction });
            else await TenantLocation.create(values, { transaction });
            locationMaterialized = true;
        } else {
            logger?.warn?.('[TenantApproval] Registration location is not complete; readiness will remain incomplete.', { tenant_id: tenant.id, application_id: application.id });
        }

        return { application_id: application.id, attempt_no: application.current_attempt_no, location_materialized: locationMaterialized, menu_catalog_published: false };
    });
};

export const materializeApprovedCompanyRegistration = buildMaterializeApprovedCompanyRegistration();
