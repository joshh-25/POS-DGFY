import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { toValidDate, maxDate } from './paymentDateUtils.js';

export const buildSyncWithPayPalUseCase = ({
    paymentRepository,
    paypalService
}) => {
    return async ({ tenantId }) => {
        const tenant = await paymentRepository.findTenantById(tenantId);

        if (!tenant || !tenant.paypal_subscription_id) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'No subscription ID for this tenant',
                { statusCode: 400 }
            ));
        }

        const details = await paypalService.getSubscriptionDetails(tenant.paypal_subscription_id);
        if (!details) {
            return fail(new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                'Subscription not found in PayPal',
                { statusCode: 404 }
            ));
        }

        let localStatus = 'inactive';
        if (details.status === 'ACTIVE') localStatus = 'active';
        else if (details.status === 'CANCELLED') localStatus = 'cancelled';
        else if (details.status === 'SUSPENDED') localStatus = 'past_due';

        const paypalPeriodEnd = toValidDate(details.billing_info?.next_billing_time);
        const currentPeriodEnd = toValidDate(tenant.current_period_end);
        const resolvedPeriodEnd = maxDate(paypalPeriodEnd, currentPeriodEnd);
        const updatePayload = {
            subscription_status: localStatus,
            current_period_end: resolvedPeriodEnd,
            billing_cycle_anchor: tenant.billing_cycle_anchor || (
                resolvedPeriodEnd
                    ? resolvedPeriodEnd.getDate()
                    : null
            )
        };

        if (details.status === 'ACTIVE') {
            updatePayload.plan = 'premium';
        }

        await tenant.update(updatePayload);

        return ok({
            status: localStatus,
            current_period_end: updatePayload.current_period_end
        });
    };
};
