import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const PRICING_KEYS = ['premium_plan_price', 'standard_plan_price', 'paypal_product_id'];

export const buildGetPricingSettingsUseCase = ({ tenantAdminRepository, logger }) => {
    return async () => {
        try {
            const settings = await tenantAdminRepository.findSystemSettings(PRICING_KEYS);
            const data = {};
            settings.forEach((setting) => {
                data[setting.setting_key] = setting.setting_value;
            });

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    data
                }
            });
        } catch (error) {
            logger?.error?.('Get pricing settings error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message,
                { statusCode: 500 }
            ));
        }
    };
};
