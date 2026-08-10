import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildUpdatePricingSettingsUseCase = ({ tenantAdminRepository, logger }) => {
    return async ({ body }) => {
        try {
            const { premium_plan_price, standard_plan_price, paypal_product_id } = body || {};

            const updates = [
                { key: 'premium_plan_price', value: premium_plan_price },
                { key: 'standard_plan_price', value: standard_plan_price },
                { key: 'paypal_product_id', value: paypal_product_id }
            ];

            for (const update of updates) {
                if (update.value !== undefined) {
                    await tenantAdminRepository.updateSystemSetting(update.key, update.value);
                }
            }

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    message: 'Pricing settings updated successfully'
                }
            });
        } catch (error) {
            logger?.error?.('Update pricing settings error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message,
                { statusCode: 500 }
            ));
        }
    };
};
