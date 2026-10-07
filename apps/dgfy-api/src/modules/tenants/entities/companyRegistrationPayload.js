import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const MAX_TEXT = Object.freeze({
    businessType: 120,
    description: 2000,
    url: 500,
    address: 500,
    city: 120,
    province: 120,
    postalCode: 32,
    country: 80,
    social: 500,
    partner: 80
});

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const optionalText = (value, max) => {
    const normalized = text(value, max);
    return normalized || null;
};
const objectOrEmpty = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const validationError = (message, details = {}) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 422, details: { error_code: 'COMPANY_REGISTRATION_PAYLOAD_INVALID', ...details } }
);

const normalizeCoordinate = (value, field, min, max) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        throw validationError(`${field} must be a valid coordinate.`, { field });
    }
    return Number(parsed.toFixed(8));
};

const normalizeHours = (value) => {
    if (value === undefined || value === null || value === '') return [];
    if (!Array.isArray(value)) throw validationError('hours must be an array.', { field: 'hours' });
    if (value.length > 7) throw validationError('hours may contain at most seven entries.', { field: 'hours' });
    return value.map((entry, index) => {
        const item = objectOrEmpty(entry);
        const day = text(item.day ?? item.day_of_week ?? item.dayOfWeek, 20).toLowerCase();
        if (!day) throw validationError('Each business-hours entry needs a day.', { field: `hours[${index}].day` });
        return {
            day,
            open: optionalText(item.open ?? item.open_time ?? item.openTime, 10),
            close: optionalText(item.close ?? item.close_time ?? item.closeTime, 10),
            closed: item.closed === true || item.closed === 'true'
        };
    });
};

const normalizePartners = (value) => {
    if (value === undefined || value === null || value === '') return [];
    if (!Array.isArray(value)) throw validationError('delivery_partners must be an array.', { field: 'delivery_partners' });
    if (value.length > 3) throw validationError('A company may configure at most three delivery partners.', { field: 'delivery_partners', max: 3 });
    return value.map((partner) => {
        if (typeof partner === 'string') return text(partner, MAX_TEXT.partner);
        const item = objectOrEmpty(partner);
        return {
            name: text(item.name ?? item.provider ?? item.label, MAX_TEXT.partner),
            enabled: item.enabled !== false
        };
    }).filter((partner) => typeof partner === 'string' ? partner : partner.name);
};

export const normalizeCompanyRegistrationSnapshot = ({
    body = {},
    companyName,
    workflowMode,
    industryTag = null,
    registrationIndustry = null,
    storeTemplateKey = null
} = {}) => {
    const storefront = objectOrEmpty(body.storefront_profile ?? body.storefrontProfile ?? body.storefront);
    const contact = objectOrEmpty(body.contact);
    const locationInput = objectOrEmpty(body.location);
    const location = {
        name: optionalText(locationInput.name ?? body.location_name, MAX_TEXT.address),
        address_line: optionalText(locationInput.address_line ?? locationInput.addressLine ?? body.address_line ?? body.address, MAX_TEXT.address),
        barangay: optionalText(locationInput.barangay ?? body.barangay, MAX_TEXT.city),
        city: optionalText(locationInput.city ?? body.city, MAX_TEXT.city),
        province: optionalText(locationInput.province ?? body.province, MAX_TEXT.province),
        postal_code: optionalText(locationInput.postal_code ?? locationInput.postalCode ?? body.postal_code, MAX_TEXT.postalCode),
        country: optionalText(locationInput.country ?? body.country, MAX_TEXT.country) || 'Philippines',
        latitude: normalizeCoordinate(locationInput.latitude ?? body.latitude, 'latitude', -90, 90),
        longitude: normalizeCoordinate(locationInput.longitude ?? body.longitude, 'longitude', -180, 180)
    };

    return {
        company_name: text(companyName, 255),
        business_type: text(body.business_type ?? body.businessType ?? body.industry_tag ?? industryTag ?? workflowMode, MAX_TEXT.businessType),
        workflow_mode: text(workflowMode, 120),
        industry_tag: optionalText(industryTag, 120),
        registration_industry: optionalText(registrationIndustry, 120),
        store_template_key: optionalText(storeTemplateKey, 120),
        storefront_profile: {
            description: optionalText(storefront.description ?? body.description, MAX_TEXT.description),
            phone: optionalText(storefront.phone ?? contact.phone ?? body.storefront_phone, 64),
            email: optionalText(storefront.email ?? contact.email ?? body.storefront_email, 255),
            website: optionalText(storefront.website ?? body.website, MAX_TEXT.url),
            facebook: optionalText(storefront.facebook ?? storefront.facebook_url ?? body.facebook, MAX_TEXT.social),
            instagram: optionalText(storefront.instagram ?? storefront.instagram_url ?? body.instagram, MAX_TEXT.social),
            content: objectOrEmpty(storefront.content ?? body.storefront_content)
        },
        location,
        hours: normalizeHours(body.hours ?? body.business_hours ?? body.businessHours),
        delivery_partners: normalizePartners(body.delivery_partners ?? body.deliveryPartners),
        // Upload identifiers are server-owned records created by the private
        // upload endpoint. Never persist client-supplied IDs into the
        // approval snapshot, where they could be mistaken for owned media.
        media: { profile: null, cover: null, gallery: [] },
        menu_upload_id: null
    };
};

export const assertCompanyRegistrationSnapshot = (snapshot) => {
    if (!snapshot?.company_name) throw validationError('Company name is required.', { field: 'name' });
    if (!snapshot?.workflow_mode) throw validationError('Business industry is required.', { field: 'workflowMode' });
    return snapshot;
};
