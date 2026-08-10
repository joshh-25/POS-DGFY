import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildCancelSubscriptionUseCase = ({
    paymentRepository,
    paypalService,
    logger
}) => {
    return async ({ tenantId }) => {
        const tenant = await paymentRepository.findTenantById(tenantId);

        if (!tenant || !tenant.paypal_subscription_id) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'No active subscription found',
                { statusCode: 400 }
            ));
        }

        await paypalService.cancelSubscription(tenant.paypal_subscription_id);
        await tenant.update({
            subscription_status: 'cancelled',
            cancelled_at: new Date()
        });

        logger.info(`Subscription cancelled for tenant ${tenant.name}`);

        return ok({
            subscription_status: 'cancelled',
            current_period_end: tenant.current_period_end
        });
    };
};
