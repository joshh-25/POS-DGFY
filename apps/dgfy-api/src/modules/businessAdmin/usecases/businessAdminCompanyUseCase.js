import dbStore from '../../../utils/dbStore.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const ok = (data) => ({ success: true, data });
const denied = (message) => ({ success: false, error: new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, message, { statusCode: 403, details: { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' } }) });
const parseJson = (value, fallback = null) => {
    if (value && typeof value === 'object') return value;
    try { return typeof value === 'string' ? JSON.parse(value) : fallback; } catch { return fallback; }
};

export const buildGetBusinessAdminCompanyUseCase = ({ businessAdminOverviewRepository }) => async ({ user = {}, tenant = null } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return denied(access.reason);
    const assignedLocationIds = access.scope === 'all' ? [] : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (access.scope === 'assigned' && assignedLocationIds.length === 0) return denied('No branch access is assigned to this user.');

    const Application = dbStore.get('CompanyRegistrationApplication');
    const Attempt = dbStore.get('CompanyRegistrationAttempt');
    const Upload = dbStore.get('CompanyRegistrationUpload');
    const TenantLocation = dbStore.get('TenantLocation');
    const SystemSetting = dbStore.get('SystemSetting');
    const application = tenant?.id ? await Application.findOne({
        where: { tenant_id: tenant.id },
        include: [
            { model: Attempt, as: 'attempts', separate: true, order: [['attempt_no', 'DESC']], limit: 1 },
            { model: Upload, as: 'uploads', separate: true, order: [['created_at', 'DESC']] }
        ]
    }) : null;
    const [settings, locations] = await Promise.all([
        SystemSetting.findAll({ raw: true }),
        TenantLocation.findAll({ where: { is_active: true }, order: [['is_primary_storefront', 'DESC'], ['name', 'ASC']], raw: true })
    ]);
    const settingMap = Object.fromEntries(settings.map((setting) => [setting.setting_key, parseJson(setting.setting_value, setting.setting_value)]));
    const snapshot = application?.attempts?.[0]?.submission_snapshot || {};
    const uploads = (application?.uploads || []).map((upload) => ({
        id: upload.id,
        asset_kind: upload.asset_kind,
        original_filename: upload.original_filename,
        byte_size: Number(upload.byte_size),
        mime_type: upload.mime_type,
        extraction_status: upload.extraction_status,
        review_status: upload.review_status,
        expires_at: upload.expires_at,
        purged_at: upload.purged_at,
        created_at: upload.createdAt || upload.created_at
    }));
    const visibleLocations = access.scope === 'all' ? locations : locations.filter((location) => assignedLocationIds.includes(Number(location.location_id)));
    const primaryLocation = visibleLocations.find((location) => location.is_primary_storefront) || visibleLocations[0] || null;
    const profileReady = Boolean(settingMap.pos_business_name || snapshot.company_name) && Boolean(snapshot.storefront_profile?.description || settingMap.storefront_about);
    const locationReady = Boolean(primaryLocation?.address_line && Number.isFinite(Number(primaryLocation?.latitude)) && Number.isFinite(Number(primaryLocation?.longitude)));
    const hoursReady = (Array.isArray(snapshot.hours) && snapshot.hours.length > 0)
        || Boolean(settingMap.storefront_hours?.weekly && Object.values(settingMap.storefront_hours.weekly).some((day) => day?.enabled === true));
    const pendingUploads = uploads.filter((upload) => upload.review_status === 'pending');
    const extractionReady = uploads.filter((upload) => upload.asset_kind === 'menu').every((upload) => ['succeeded', 'not_applicable'].includes(upload.extraction_status));
    const readiness = {
        company_profile: profileReady,
        storefront: Boolean(settingMap.pos_business_name),
        location: locationReady,
        hours: hoursReady,
        uploads_reviewed: pendingUploads.length === 0,
        menu_extraction: extractionReady,
        company_ready: Boolean(application?.provisioning_status === 'succeeded' && profileReady && locationReady && hoursReady && pendingUploads.length === 0)
    };
    const nextAction = application?.review_status === 'pending' ? 'Await platform review.'
        : application?.provisioning_status !== 'succeeded' ? 'Complete company provisioning.'
            : !readiness.company_profile ? 'Complete the company profile in Settings.'
                : !readiness.location ? 'Add a primary location with valid coordinates.'
                    : !readiness.hours ? 'Configure business hours.'
                        : pendingUploads.length > 0 ? 'Wait for registration uploads to be reviewed.'
                            : 'Company setup is ready.';

    return ok({
        identity: { tenant_id: tenant?.id || null, name: tenant?.name || snapshot.company_name || 'Company', business_type: snapshot.business_type || tenant?.settings?.industry_tag || null },
        registration: { application_id: application?.id || null, review_status: application?.review_status || null, provisioning_status: application?.provisioning_status || null, current_attempt_no: application?.current_attempt_no || null },
        storefront: { profile: snapshot.storefront_profile || {}, delivery_partners: snapshot.delivery_partners || [], uploads },
        location: { primary: primaryLocation ? { location_id: primaryLocation.location_id, name: primaryLocation.name, address_line: primaryLocation.address_line, operating_hours: primaryLocation.operating_hours } : null, visible_count: visibleLocations.length, scope: access.scope },
        readiness,
        next_action: nextAction,
        authorized_actions: { settings_profile: '/settings/profile', storefront_settings: '/settings/storefront', locations: '/settings/branches', registration_status: application?.id ? `/company-registration/${application.id}` : null }
    });
};
