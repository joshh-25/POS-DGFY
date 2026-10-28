import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import { resolveRegistrationIndustry } from '../../shared/constants/registrationIndustries.js';
import { resolveRegisteredTenantPlan } from './tenantPlanPolicy.js';
import { normalizePhoneNumber } from '../../../utils/phoneNumber.js';
import { normalizeStorefrontBusinessHours } from '../../shared/utils/storefrontBusinessHours.js';
import { DGFY_LEGAL_TERM_FLOWS } from '../../shared/utils/dgfyLegalTerms.js';
import { resolveCompanyRegistrationStatusUrl, resolvePosOnboardingUrl } from '../entities/companyRegistrationStatusUrl.js';

const IMAGE_CATEGORIES = new Map([
    ['profile_image', 'profile'],
    ['cover_image', 'cover'],
    ['gallery_image', 'gallery']
]);

const MATERIALIZATION_SCHEMA_VERSION = 1;

const cloneJson = (value, fallback = {}) => {
    if (!value || typeof value !== 'object') return fallback;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return fallback;
    }
};

const asPlain = (value) => {
    if (!value) return value;
    if (typeof value.get === 'function') return value.get({ plain: true });
    return value;
};

const getLegacyBusinessTypeFromPayload = (payload) => String(payload?.business?.business_type || '').trim();

const parseSnapshot = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const toFailure = (error, fallbackMessage) => {
    if (error instanceof DomainError) return fail(error);
    return fail(new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        fallbackMessage,
        { statusCode: 500, cause: error }
    ));
};

const requireAdminActor = (actor, { allowSystemActor = false } = {}) => {
    if (
        allowSystemActor
        && actor?.actor_type === 'system'
        && actor?.source === 'public_registration'
    ) return null;
    if (actor && (actor.is_platform_admin === true || actor.admin_id || actor.id)) return null;
    return new DomainError(
        DomainErrorCode.AUTHORIZATION_FAILED,
        'Platform administrator authorization is required.',
        { statusCode: 403 }
    );
};

const normalizeCompanyName = (value) => String(value || '').trim().slice(0, 255);

const buildTenantIdentifiers = ({ name, idGenerator }) => {
    const id = idGenerator();
    const safeName = normalizeCompanyName(name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 40) || 'store';
    const suffix = String(id).split('-')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'tenant';
    return {
        id,
        dbName: `sku_tenant_${safeName}_${suffix}`,
        domain: `${safeName}-${suffix}`,
        companyToken: `token-${safeName}-${suffix}`
    };
};

const getPayloadFromDraft = (draft) => {
    const submissionSnapshot = parseSnapshot(draft?.submission_snapshot);
    const payload = submissionSnapshot.payload || draft?.draft_payload || {};
    return {
        payload: cloneJson(payload),
        submissionSnapshot,
        legalTermsSnapshot: parseSnapshot(draft?.legal_terms_snapshot)
    };
};

const getUploadsFromDraft = (draft, submissionSnapshot) => {
    const snapshotUploads = Array.isArray(submissionSnapshot?.uploads)
        ? submissionSnapshot.uploads
        : [];
    if (snapshotUploads.length > 0) return snapshotUploads.map((upload) => ({ ...upload }));
    return (Array.isArray(draft?.uploads) ? draft.uploads : [])
        .filter((upload) => upload?.upload_status !== 'removed' && !upload?.removed_at)
        .map(asPlain);
};

const resolveIndustry = async ({ industryKey, registrationIndustryRepository }) => {
    const normalizedKey = String(industryKey || '').trim();
    if (!normalizedKey) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'The submitted registration is missing a business industry.',
            { statusCode: 422, details: { error_code: 'REGISTRATION_INDUSTRY_REQUIRED' } }
        );
    }

    let row = null;
    if (registrationIndustryRepository?.findByKey) {
        row = await registrationIndustryRepository.findByKey(normalizedKey);
    }
    const resolved = row || resolveRegistrationIndustry(normalizedKey);
    if (!resolved || row?.hidden === true) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Industry "${normalizedKey}" is not currently available for registration.`,
            { statusCode: 422, details: { error_code: 'REGISTRATION_INDUSTRY_INVALID', industry_key: normalizedKey } }
        );
    }
    return {
        key: normalizedKey,
        workflowMode: normalizeWorkflowMode(resolved.workflow_mode),
        templateKey: resolved.template_key || null,
        label: String(resolved.label || normalizedKey).trim()
    };
};

const parseCoordinate = (value, field, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `A valid ${field} is required before approval.`,
            { statusCode: 422, details: { error_code: 'REGISTRATION_LOCATION_COORDINATES_REQUIRED', field } }
        );
    }
    return number;
};

const resolveMaterializableLocation = ({ payload, companyName }) => {
    const location = payload?.location && typeof payload.location === 'object'
        ? payload.location
        : {};
    const address = String(location.address_line || location.address || location.full_address || '').trim().slice(0, 2000);
    if (!address) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'A business address is required before approval.',
            { statusCode: 422, details: { error_code: 'REGISTRATION_ADDRESS_REQUIRED' } }
        );
    }
    return {
        name: companyName,
        address_line: address,
        // #2595: the merchant's street number, unit, floor or building, when the wizard captured it.
        address_details: String(location.address_details || '').trim().slice(0, 255) || null,
        latitude: parseCoordinate(location.latitude, 'latitude', -90, 90),
        longitude: parseCoordinate(location.longitude, 'longitude', -180, 180),
        operating_hours: normalizeStorefrontBusinessHours(payload?.hours),
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        is_active: true,
        is_open: true,
        is_primary_storefront: true
    };
};

const buildInitialMaterializationSnapshot = ({ draft, uploads }) => ({
    schema_version: MATERIALIZATION_SCHEMA_VERSION,
    registration_draft_id: draft.id,
    asset_uploads: {},
    location_id: null,
    settings_written: false,
    menu_upload_ids: uploads
        .filter((upload) => upload.category === 'menu_upload')
        .map((upload) => upload.id)
});

const mergeSnapshot = (value) => {
    const snapshot = parseSnapshot(value);
    return {
        schema_version: snapshot.schema_version || MATERIALIZATION_SCHEMA_VERSION,
        registration_draft_id: snapshot.registration_draft_id || null,
        asset_uploads: snapshot.asset_uploads && typeof snapshot.asset_uploads === 'object'
            ? { ...snapshot.asset_uploads }
            : {},
        location_id: snapshot.location_id || null,
        settings_written: snapshot.settings_written === true,
        menu_upload_ids: Array.isArray(snapshot.menu_upload_ids) ? [...snapshot.menu_upload_ids] : []
    };
};

const serializeSettingValue = (dataType, value) => {
    if (dataType === 'json') return JSON.stringify(value ?? null);
    if (dataType === 'boolean') return value === true ? 'true' : 'false';
    return String(value ?? '');
};

const writeSystemSetting = async (SystemSetting, {
    key,
    value,
    dataType,
    description,
    transaction
}) => {
    const settingValue = serializeSettingValue(dataType, value);
    const existing = await SystemSetting.findOne({
        where: { setting_key: key },
        transaction
    });
    if (existing) {
        await existing.update({
            setting_value: settingValue,
            data_type: dataType,
            description
        }, { transaction });
        return;
    }
    await SystemSetting.create({
        setting_key: key,
        setting_value: settingValue,
        data_type: dataType,
        description
    }, { transaction });
};

const findOrCreatePrimaryLocation = async ({ TenantLocation, location, locationId, transaction }) => {
    let primary = locationId ? await TenantLocation.findByPk(locationId, { transaction }) : null;
    if (!primary) {
        primary = await TenantLocation.findOne({
            where: { is_primary_storefront: true },
            order: [['location_id', 'ASC']],
            transaction
        });
    }

    await TenantLocation.update(
        { is_primary_storefront: false },
        { where: { is_primary_storefront: true }, transaction }
    );

    if (primary) {
        await primary.update(location, { transaction });
        return primary;
    }
    return TenantLocation.create(location, { transaction });
};

const buildGalleryEntries = ({ payload, uploads, assetUploads }) => {
    const galleryMetadata = new Map(
        (Array.isArray(payload?.storefront?.gallery) ? payload.storefront.gallery : [])
            .map((entry) => [String(entry?.upload_id || entry?.id || ''), entry])
    );
    return uploads
        .filter((upload) => upload.category === 'gallery_image')
        .map((upload, index) => {
            const asset = assetUploads[upload.id];
            if (!asset?.url && !asset?.path) return null;
            const metadata = galleryMetadata.get(String(upload.id)) || {};
            return {
                url: asset.url || null,
                path: asset.path || null,
                caption: String(metadata.caption || '').trim().slice(0, 140),
                alt: String(metadata.alt || upload.original_name || '').trim().slice(0, 140),
                sort_order: Number.isInteger(Number(metadata.sort_order))
                    ? Number(metadata.sort_order)
                    : index
            };
        })
        .filter(Boolean);
};

const materializeImages = async ({
    tenant,
    draft,
    uploads,
    snapshot,
    companyRegistrationStorage,
    storefrontAssetStorage,
    dbStore,
    tenantContext,
    repository,
    logger
}) => {
    const imageUploads = uploads.filter((upload) => IMAGE_CATEGORIES.has(upload.category));
    const assetUploads = { ...snapshot.asset_uploads };

    for (const upload of imageUploads) {
        const existing = assetUploads[upload.id];
        if (existing?.path || existing?.url) {
            const available = typeof storefrontAssetStorage.isAvailable !== 'function'
                ? true
                : await storefrontAssetStorage.isAvailable({ path: existing.path, url: existing.url });
            if (available) continue;
        }

        const sourcePath = companyRegistrationStorage.companyRegistrationStoragePathForKey(upload.storage_key);
        const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-registration-materialize-'));
        const extension = path.extname(String(upload.original_name || '')).replace(/[^a-z0-9.]/gi, '').slice(0, 12) || '.upload';
        const tempPath = path.join(tempDirectory, `${upload.id}${extension}`);
        try {
            await fs.copyFile(sourcePath, tempPath);
            const stored = await dbStore.run(tenantContext, () => storefrontAssetStorage.store({
                assetType: IMAGE_CATEGORIES.get(upload.category),
                originalName: upload.original_name,
                reportedMime: upload.mime_type,
                tempPath
            }));
            assetUploads[upload.id] = {
                upload_id: upload.id,
                sha256: upload.sha256 || null,
                path: stored?.path || null,
                url: stored?.url || null,
                variants: stored?.variants || null,
                image_variants: stored?.image_variants || null,
                status: 'materialized'
            };
            snapshot.asset_uploads = assetUploads;
            draft.materialization_snapshot = snapshot;
            await repository.updateMaterializationSnapshot({
                draftId: snapshot.registration_draft_id,
                materializationSnapshot: snapshot,
                transaction: null
            });
        } catch (error) {
            logger?.error?.('[RegistrationMaterialization] Asset copy failed', {
                tenant_id: tenant.id,
                upload_id: upload.id,
                error: error.message
            });
            throw new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                `Unable to materialize registration upload ${upload.id}.`,
                {
                    statusCode: 500,
                    details: { error_code: 'REGISTRATION_ASSET_MATERIALIZATION_FAILED', upload_id: upload.id },
                    cause: error
                }
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
        }
    }

    return assetUploads;
};

export const buildMaterializeCompanyRegistrationDraftUseCase = ({
    repository,
    tenantConnector,
    getTenantModels,
    dbStore,
    companyRegistrationStorage,
    storefrontAssetStorage,
    syncStorefrontDiscoveryWithReliability,
    logger
}) => async ({ draft, tenant }) => {
    const plainDraft = asPlain(draft);
    const plainTenant = asPlain(tenant);
    const { payload, submissionSnapshot } = getPayloadFromDraft(plainDraft);
    const uploads = getUploadsFromDraft(plainDraft, submissionSnapshot);
    const companyName = normalizeCompanyName(payload?.business?.company_name || plainTenant?.name);
    const location = resolveMaterializableLocation({ payload, companyName });
    const snapshot = mergeSnapshot(plainDraft.materialization_snapshot);
    snapshot.registration_draft_id = plainDraft.id;
    snapshot.menu_upload_ids = uploads
        .filter((upload) => upload.category === 'menu_upload')
        .map((upload) => upload.id);

    const tenantSequelize = await tenantConnector.getConnection(plainTenant, 'usecase.company-registration-draft');
    const tenantModels = getTenantModels(tenantSequelize);
    const tenantContext = {
        ...tenantModels,
        sequelize: tenantSequelize,
        tenantId: plainTenant.id,
        tenantToken: plainTenant.company_token,
        tenantName: plainTenant.name
    };

    const assetUploads = await materializeImages({
        tenant: plainTenant,
        draft: plainDraft,
        uploads,
        snapshot,
        companyRegistrationStorage,
        storefrontAssetStorage,
        dbStore,
        tenantContext,
        repository,
        logger
    });

    const profileUploadId = String(payload?.storefront?.profile_upload_id || '');
    const coverUploadId = String(payload?.storefront?.cover_upload_id || '');
    const profileAsset = assetUploads[profileUploadId] || null;
    const coverAsset = assetUploads[coverUploadId] || null;
    const gallery = buildGalleryEntries({ payload, uploads, assetUploads });
    const normalizedHours = normalizeStorefrontBusinessHours(payload?.hours);
    const storefront = payload?.storefront || {};

    await dbStore.run(tenantContext, () => tenantSequelize.transaction(async (transaction) => {
        const TenantLocation = tenantModels.TenantLocation;
        const SystemSetting = tenantModels.SystemSetting;
        if (!TenantLocation || !SystemSetting) {
            throw new Error('Tenant storefront models are unavailable.');
        }

        const primaryLocation = await findOrCreatePrimaryLocation({
            TenantLocation,
            location,
            locationId: snapshot.location_id,
            transaction
        });
        snapshot.location_id = primaryLocation.location_id;

        const legacyBusinessType = getLegacyBusinessTypeFromPayload(payload);
        const settings = [
            ['pos_business_name', companyName, 'string', 'Business name used by POS and tenant-facing receipts.'],
            ...(legacyBusinessType ? [['registration_business_type', legacyBusinessType, 'string', 'Legacy business type captured during company registration.']] : []),
            ['storefront_email', String(storefront.store_email || '').trim().toLowerCase(), 'string', 'Public Storefront contact email.'],
            ['storefront_phone', normalizePhoneNumber(storefront.store_phone || '') || String(storefront.store_phone || '').trim(), 'string', 'Public Storefront contact phone.'],
            ['storefront_tagline', String(storefront.tagline || '').trim(), 'string', 'Public Storefront tagline.'],
            ['storefront_about', String(storefront.about || '').trim(), 'string', 'Public Storefront About us content.'],
            ['storefront_social_links', storefront.social_links || {}, 'json', 'Public Storefront social links.'],
            ['storefront_delivery_partners', Array.isArray(storefront.delivery_partners) ? storefront.delivery_partners : [], 'json', 'Configured Storefront delivery partners.'],
            ['storefront_hours', normalizedHours, 'json', 'Configured Storefront business hours.'],
            ['storefront_gallery_images', gallery, 'json', 'Storefront gallery images approved during registration.'],
            ['store_has_no_location', false, 'boolean', 'Whether the Storefront intentionally has no map location.'],
            ['store_is_visible', false, 'boolean', 'Whether the Storefront is visible after Platform Admin enablement.']
        ];

        if (Array.isArray(storefront.categories)) {
            settings.push(['storefront_categories', storefront.categories, 'json', 'Storefront categories captured during registration.']);
        }
        if (profileAsset?.url || profileAsset?.path) {
            settings.push(['storefront_profile_image_url', profileAsset.url || '', 'string', 'Public Storefront profile image URL.']);
            settings.push(['storefront_profile_image_path', profileAsset.path || '', 'string', 'Tenant Storefront profile image path.']);
        }
        if (coverAsset?.url || coverAsset?.path) {
            settings.push(['storefront_cover_image_url', coverAsset.url || '', 'string', 'Public Storefront cover image URL.']);
            settings.push(['storefront_cover_image_path', coverAsset.path || '', 'string', 'Tenant Storefront cover image path.']);
        }

        for (const [key, value, dataType, description] of settings) {
            await writeSystemSetting(SystemSetting, { key, value, dataType, description, transaction });
        }
        snapshot.settings_written = true;
    }));

    await repository.updateMaterializationSnapshot({
        draftId: plainDraft.id,
        materializationSnapshot: snapshot,
        transaction: null
    });
    plainDraft.materialization_snapshot = snapshot;

    const imageUploadIds = uploads
        .filter((upload) => IMAGE_CATEGORIES.has(upload.category))
        .map((upload) => upload.id);
    const menuUploadIds = uploads
        .filter((upload) => upload.category === 'menu_upload')
        .map((upload) => upload.id);
    const updateUploadStates = (transaction) => repository.updateUploadMaterializationStates({
        draftId: plainDraft.id,
        imageUploadIds,
        menuUploadIds,
        transaction
    });
    if (repository.transaction) {
        await repository.transaction(updateUploadStates);
    } else {
        await updateUploadStates(null);
    }

    const discovery = await syncStorefrontDiscoveryWithReliability({
        tenantId: plainTenant.id,
        source: 'company_registration_materialization'
    });
    if (!discovery?.ok) {
        await dbStore.run(tenantContext, () => tenantSequelize.transaction(async (transaction) => {
            const SystemSetting = tenantModels.SystemSetting;
            await writeSystemSetting(SystemSetting, {
                key: 'store_is_visible',
                value: false,
                dataType: 'boolean',
                description: 'Storefront remains hidden until discovery synchronization succeeds.',
                transaction
            });
        })).catch((visibilityError) => logger?.error?.('[RegistrationMaterialization] Failed to hide degraded Storefront', {
            tenant_id: plainTenant.id,
            error: visibilityError.message
        }));
        throw new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'Storefront discovery synchronization is not ready; retry materialization.',
            { statusCode: 503, details: { error_code: 'STOREFRONT_DISCOVERY_SYNC_FAILED' } }
        );
    }

    return {
        snapshot,
        locationId: snapshot.location_id,
        imageUploadIds,
        menuUploadIds
    };
};

export const buildApproveCompanyRegistrationDraftUseCase = ({
    repository,
    tenantAdminRepository,
    companyRegistrationRepository,
    dgfyAccountRepository,
    registrationIndustryRepository,
    provisionTenant,
    materializeCompanyRegistrationDraft,
    idGenerator = uuidv4,
    now = () => new Date(),
    logger,
    emailService,
    allowSystemActor = false,
    runInBackground = (work) => setImmediate(() => { void work(); }),
    background = true
}) => {
    const markFailure = async ({ draftId, tenantId, error, snapshot }) => {
        await repository.markMaterializationOutcome({
            draftId,
            succeeded: false,
            materializationError: error?.message || 'Materialization failed.',
            materializationSnapshot: snapshot,
            materializedAt: null,
            transaction: null
        }).catch((markError) => logger?.error?.('[RegistrationMaterialization] Failed to record failure', {
            draft_id: draftId,
            error: markError.message
        }));
        await companyRegistrationRepository.markProvisioningOutcome({
            tenantId,
            succeeded: false,
            details: {
                source: 'company_registration_materialization',
                error: error?.message || 'Materialization failed.'
            }
        }).catch((markError) => logger?.error?.('[RegistrationMaterialization] Failed to record application failure', {
            tenant_id: tenantId,
            error: markError.message
        }));
    };

    const sendOnboardingEmail = async ({ application, tenant }) => {
        const delivery = application?.onboardingEmailDelivery
            || await companyRegistrationRepository.findOnboardingEmailDelivery?.(application?.id);
        if (
            !delivery
            || delivery.status === 'sent_to_provider'
            || !emailService?.isEmailConfigured?.()
            || typeof emailService?.sendCompanyOnboardingEmail !== 'function'
        ) return;

        try {
            const deliveryResult = await emailService.sendCompanyOnboardingEmail({
                email: tenant.admin_email,
                companyName: tenant.name,
                statusUrl: resolveCompanyRegistrationStatusUrl(application.id),
                posUrl: resolvePosOnboardingUrl(tenant.id)
            });
            await companyRegistrationRepository.updateEmailDelivery(delivery, {
                status: 'sent_to_provider',
                provider_message_id: deliveryResult?.messageId || null,
                sent_at: new Date(),
                last_error_summary: null
            });
        } catch (error) {
            await companyRegistrationRepository.updateEmailDelivery(delivery, {
                status: 'failed',
                last_error_summary: String(error.message || 'Onboarding email failed.').slice(0, 500)
            }).catch(() => {});
            logger?.warn?.('[RegistrationMaterialization] POS onboarding email failed', {
                application_id: application.id,
                error: error.message
            });
        }
    };

    const runMaterialization = async ({ claim, retry }) => {
        const tenant = claim.tenant;
        let snapshot = mergeSnapshot(claim.draft.materialization_snapshot);
        try {
            if (!retry) {
                const provisioned = await provisionTenant({
                    tenantId: tenant.id,
                    name: tenant.name,
                    dbName: tenant.db_name,
                    companyToken: tenant.company_token,
                    adminEmail: tenant.admin_email,
                    adminPhone: tenant.admin_phone,
                    adminPasswordHash: tenant.admin_password_hash,
                    workflowMode: claim.industry.workflowMode,
                    templateKey: claim.industry.templateKey,
                    tenantCapabilities: { pos_enabled: false }
                });
                await dgfyAccountRepository.upsertFounderMembership({
                    dgfyAccountId: tenant.owner_dgfy_account_id,
                    tenantId: tenant.id,
                    tenantUserId: provisioned?.admin_user_id || null,
                    role: 'admin'
                });
            }

            const materialized = await materializeCompanyRegistrationDraft({
                draft: claim.draft,
                tenant
            });
            snapshot = materialized.snapshot || mergeSnapshot(claim.draft.materialization_snapshot);
            await repository.markMaterializationOutcome({
                draftId: claim.draft.id,
                succeeded: true,
                materializationSnapshot: materialized.snapshot,
                materializedAt: now(),
                transaction: null
            });
            await companyRegistrationRepository.markProvisioningOutcome({
                tenantId: tenant.id,
                succeeded: true,
                details: {
                    source: 'company_registration_materialization',
                    location_id: materialized.locationId,
                    image_upload_count: materialized.imageUploadIds.length,
                    menu_upload_count: materialized.menuUploadIds.length
                }
            });
            await sendOnboardingEmail({ application: claim.application, tenant });
            logger?.info?.('[RegistrationMaterialization] Completed', {
                draft_id: claim.draft.id,
                tenant_id: tenant.id,
                retry
            });
        } catch (error) {
            snapshot = mergeSnapshot(claim.draft.materialization_snapshot || snapshot);
            await markFailure({
                draftId: claim.draft.id,
                tenantId: tenant.id,
                error,
                snapshot
            });
            logger?.error?.('[RegistrationMaterialization] Failed', {
                draft_id: claim.draft.id,
                tenant_id: tenant.id,
                retry,
                error: error.message
            });
        }
    };

    const claim = async ({ draftId, actor, retry }) => tenantAdminRepository.transaction(async (transaction) => {
        const draft = await repository.findForAdminForUpdate(draftId, transaction);
        if (!draft) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Registration draft not found.', { statusCode: 404 });
        }

        const plainDraft = asPlain(draft);
        if (!retry && plainDraft.materialization_status === 'succeeded') {
            return {
                alreadyMaterialized: true,
                draft: plainDraft,
                tenantId: plainDraft.materialized_tenant_id
            };
        }
        const { payload, submissionSnapshot, legalTermsSnapshot } = getPayloadFromDraft(plainDraft);
        const companyName = normalizeCompanyName(payload?.business?.company_name);
        if (!companyName) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The submitted registration is missing a company name.', { statusCode: 422 });
        }
        const industry = await resolveIndustry({
            industryKey: payload?.business?.industry_key,
            registrationIndustryRepository
        });
        const location = resolveMaterializableLocation({ payload, companyName });
        const uploads = getUploadsFromDraft(plainDraft, submissionSnapshot);

        if (retry) {
            if (plainDraft.status !== 'approved' || plainDraft.materialization_status !== 'failed' || !plainDraft.materialized_tenant_id) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Only a failed approved registration materialization can be retried.',
                    { statusCode: 409 }
                );
            }
            const tenant = await tenantAdminRepository.findTenantById(plainDraft.materialized_tenant_id, { transaction });
            if (!tenant) {
                throw new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'The materialization tenant no longer exists.', { statusCode: 404 });
            }
            const retried = await repository.claimRetryForMaterialization({
                draftId,
                reviewedAt: now(),
                transaction
            });
            if (!retried) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'This registration materialization is already being processed.', { statusCode: 409 });
            }
            return { draft: asPlain(retried), tenant, industry, payload, location, uploads, retry: true };
        }

        if (plainDraft.status !== 'pending_review' || plainDraft.materialization_status !== 'not_started') {
            throw new DomainError(DomainErrorCode.CONFLICT, 'This registration is not waiting for approval.', { statusCode: 409 });
        }

        const existingTenant = await tenantAdminRepository.findTenantByName(companyName, { transaction });
        if (existingTenant) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'A company with this name already exists.', { statusCode: 409 });
        }
        const account = await dgfyAccountRepository.findById(plainDraft.dgfy_account_id, { transaction });
        if (!account || account.deleted_at || account.is_active === false) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The DGFY account linked to this registration is unavailable.', { statusCode: 422 });
        }
        if (!account.password_hash) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The DGFY account has no password credential for tenant provisioning.', { statusCode: 422 });
        }

        const identifiers = buildTenantIdentifiers({ name: companyName, idGenerator });
        const normalizedPhone = normalizePhoneNumber(account.phone || '') || String(account.phone || '').trim() || null;
        const legacyBusinessType = getLegacyBusinessTypeFromPayload(payload);
        const industryTag = String(payload?.business?.industry_tag ?? payload?.business?.industryTag ?? '').trim().slice(0, 120) || industry.label;
        const tenant = await tenantAdminRepository.createTenant({
            id: identifiers.id,
            name: companyName,
            domain: identifiers.domain,
            db_name: identifiers.dbName,
            company_token: identifiers.companyToken,
            status: 'pending',
            admin_email: String(account.email || plainDraft.registration_email_snapshot || '').trim().toLowerCase(),
            admin_phone: normalizedPhone,
            admin_password_hash: account.password_hash,
            plan: resolveRegisteredTenantPlan(),
            subscription_status: 'inactive',
            compliance_mode_state: 'non_compliant_active',
            compliance_mode_choice_required: false,
            compliance_mode_selected_at: now(),
            compliance_mode_selected_by: 'registration_materialization',
            compliance_policy_version: '2026.04.07',
            compliance_profile: {},
            owner_dgfy_account_id: account.id,
            provisioning_source: 'public_registration',
            ownership_status: 'claimed',
            settings: {
                workflow_mode: industry.workflowMode,
                industry_tag: industryTag,
                registration_industry: industry.key,
                store_template_key: industry.templateKey,
                ...(legacyBusinessType ? { business_type: legacyBusinessType } : {}),
                registration_draft_id: plainDraft.id,
                registration_access_mode: 'catalog_only',
                store_is_visible: false
            }
        }, { transaction });

        if (typeof dgfyAccountRepository.recordLegalAcknowledgement !== 'function') {
            throw new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Legal acknowledgement persistence is unavailable.', { statusCode: 500 });
        }
        if (
            legalTermsSnapshot.accepted_company_terms !== true
            || legalTermsSnapshot.accepted_marketplace_terms !== true
            || !legalTermsSnapshot.company_terms_version
            || !legalTermsSnapshot.marketplace_terms_version
            || !legalTermsSnapshot.acknowledgement_text
            || !legalTermsSnapshot.acknowledgement_hash
        ) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'The submitted legal acknowledgement is incomplete or outdated.',
                { statusCode: 422, details: { error_code: 'REGISTRATION_LEGAL_SNAPSHOT_INVALID' } }
            );
        }
        await dgfyAccountRepository.recordLegalAcknowledgement({
            flow: DGFY_LEGAL_TERM_FLOWS.COMPANY_REGISTRATION,
            dgfy_account_id: account.id,
            tenant_id: tenant.id,
            terms_version: legalTermsSnapshot.terms_version || null,
            privacy_version: legalTermsSnapshot.privacy_version || null,
            company_terms_version: legalTermsSnapshot.company_terms_version || null,
            marketplace_terms_version: legalTermsSnapshot.marketplace_terms_version,
            acknowledgement_text: legalTermsSnapshot.acknowledgement_text,
            acknowledgement_hash: legalTermsSnapshot.acknowledgement_hash,
            ip_address: legalTermsSnapshot.ip_address || null,
            user_agent: legalTermsSnapshot.user_agent || null,
            request_id: legalTermsSnapshot.request_id || null,
            accepted_at: legalTermsSnapshot.accepted_at ? new Date(legalTermsSnapshot.accepted_at) : now()
        }, { transaction });

        const application = await companyRegistrationRepository.createApprovedProjection({
            tenant,
            dgfyAccount: account,
            submissionSnapshot: {
                ...submissionSnapshot,
                registration_draft_id: plainDraft.id
            },
            legalTermsSnapshot,
            workflowMode: industry.workflowMode,
            industryTag,
            registrationIndustry: industry.key,
            storeTemplateKey: industry.templateKey,
            actor,
            transaction
        });
        await dgfyAccountRepository.upsertPendingFounderMembership({
            dgfyAccountId: account.id,
            tenantId: tenant.id,
            role: 'admin'
        }, { transaction });

        const initialSnapshot = buildInitialMaterializationSnapshot({ draft: plainDraft, uploads });
        const approved = await repository.markApprovedForMaterialization({
            draftId,
            reviewedAt: now(),
            materializedTenantId: tenant.id,
            materializedApplicationId: application.id,
            materializationSnapshot: initialSnapshot,
            transaction
        });
        if (!approved) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'This registration was changed before approval completed.', { statusCode: 409 });
        }

        return {
            draft: asPlain(approved),
            tenant,
            application,
            industry,
            payload,
            location,
            uploads,
            retry: false
        };
    });

    return async ({ draftId, actor, retry = false }) => {
        const actorError = requireAdminActor(actor, { allowSystemActor });
        if (actorError) return fail(actorError);

        try {
            const claimed = await claim({ draftId, actor, retry });
            if (claimed.alreadyMaterialized) {
                return ok({
                    statusCode: 200,
                    payload: {
                        success: true,
                        message: 'This registration has already been materialized.',
                        data: {
                            draft_id: claimed.draft.id,
                            tenant_id: claimed.tenantId,
                            materialization_status: 'succeeded'
                        }
                    }
                });
            }

            if (retry) {
                try {
                    const application = await companyRegistrationRepository.markProvisioningStarted({
                        tenantId: claimed.tenant.id,
                        actor,
                        retry: true
                    });
                    if (!application) {
                        throw new DomainError(DomainErrorCode.CONFLICT, 'The linked registration application is not retryable.', { statusCode: 409 });
                    }
                    claimed.application = application;
                } catch (error) {
                    await repository.markMaterializationOutcome({
                        draftId,
                        succeeded: false,
                        materializationError: error.message,
                        materializationSnapshot: claimed.draft.materialization_snapshot,
                        materializedAt: null,
                        transaction: null
                    }).catch(() => {});
                    throw error;
                }
            }

            const work = () => runMaterialization({ claim: claimed, retry });
            if (background) {
                runInBackground(work);
            } else {
                await work();
            }

            return ok({
                statusCode: 202,
                payload: {
                    success: true,
                    message: retry
                        ? 'Registration materialization retry accepted.'
                        : 'Registration approved; tenant provisioning and Storefront materialization are running.',
                    data: {
                        draft_id: claimed.draft.id,
                        tenant_id: claimed.tenant.id,
                        application_id: claimed.application?.id || claimed.draft.materialized_application_id || null,
                        review_status: 'approved',
                        provisioning_status: 'in_progress',
                        registration_access_mode: 'catalog_only',
                        materialization_status: 'in_progress'
                    }
                }
            });
        } catch (error) {
            logger?.error?.('[RegistrationMaterialization] Approval request failed', {
                draft_id: draftId,
                retry,
                error: error.message
            });
            return toFailure(error, 'Unable to approve the registration.');
        }
    };
};
