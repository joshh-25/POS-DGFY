import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    deriveStorefrontSlug,
    isValidStorefrontSlug
} from '../../shared/utils/storefrontSlug.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';

const STOREFRONT_SLUG_KEY = 'store_tenant_slug';
const RETRY_SUFFIX_LENGTHS = Object.freeze([6, 10, 16]);

const isHandleConflict = (result) => (
    result?.success === false
    && result?.error?.code === DomainErrorCode.CONFLICT
    && result?.error?.details?.reason_code === 'STOREFRONT_HANDLE_NOT_UNIQUE'
);

export const buildGenerateStorefrontSlugUseCase = ({
    settingsRepository,
    updateSettingByKeyUseCase
}) => {
    return async ({ context = {}, actorUser = null } = {}) => {
        try {
            const currentSettings = await settingsRepository.getSettingsByKeys([STOREFRONT_SLUG_KEY]);
            const currentSlug = String(currentSettings?.[STOREFRONT_SLUG_KEY]?.value || '')
                .trim()
                .toLowerCase();

            if (isValidStorefrontSlug(currentSlug)) {
                return ok({
                    store_tenant_slug: currentSlug,
                    storefront_path: `/tenant-store/${currentSlug}`,
                    generated: false
                });
            }

            const tenantId = context.tenantId || context.tenant_id || '';
            const tenantName = context.tenantName || context.tenant_name || '';
            if (!tenantId || tenantId === 'default') {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_CONTEXT_MISSING,
                    'A company context is required to generate the Storefront ID.'
                ));
            }

            let lastConflictResult = null;
            for (const suffixLength of RETRY_SUFFIX_LENGTHS) {
                const candidate = deriveStorefrontSlug({
                    tenantName,
                    tenantId,
                    suffixLength
                });
                const updateResult = await updateSettingByKeyUseCase({
                    key: STOREFRONT_SLUG_KEY,
                    value: candidate,
                    actorUser
                });

                if (updateResult?.success) {
                    return ok({
                        store_tenant_slug: candidate,
                        storefront_path: `/tenant-store/${candidate}`,
                        generated: true
                    });
                }
                if (!isHandleConflict(updateResult)) {
                    return updateResult;
                }
                lastConflictResult = updateResult;
            }

            return lastConflictResult || fail(new DomainError(
                DomainErrorCode.CONFLICT,
                'Unable to reserve a unique Storefront ID for this company.'
            ));
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to generate Storefront ID'));
        }
    };
};

