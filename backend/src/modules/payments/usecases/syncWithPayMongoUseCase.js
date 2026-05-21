import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

/**
 * Syncs tenant subscription status with PayMongo API.
 * Queries PayMongo for latest subscription details and updates local state.
 */
export const buildSyncWithPayMongoUseCase = ({
    paymentRepository,
    paymongoService,
    logger
}) => {
    return async ({ tenantId }) => {
        const tenant = await paymentRepository.findTenantById(tenantId);
        if (!tenant) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_NOT_FOUND,
                'Tenant not found',
                { statusCode: 404 }
            ));
        }

        if (tenant.payment_method !== 'paymongo' || !tenant.paymongo_subscription_id) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Tenant does not have a PayMongo subscription.',
                { statusCode: 400 }
            ));
        }

        let subDetails;
        try {
            subDetails = await paymongoService.getSubscription(tenant.paymongo_subscription_id);
        } catch (error) {
            logger?.error?.('PayMongo sync error:', error);
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Unable to sync with PayMongo at this time.',
                { statusCode: 503 }
            ));
        }

        if (!subDetails) {
            logger?.warn?.(`PayMongo subscription ${tenant.paymongo_subscription_id} not found`);
            return fail(new DomainError(
                DomainErrorCode.NOT_FOUND,
                'PayMongo subscription not found.',
                { statusCode: 404 }
            ));
        }

        const paymongoStatus = subDetails?.attributes?.status;
        let newDbStatus = 'active';

        // Map PayMongo subscription status to local status
        // PayMongo statuses: active, incomplete, incomplete_expired, past_due, cancelled
        if (paymongoStatus === 'active') {
            newDbStatus = 'active';
        } else if (paymongoStatus === 'past_due' || paymongoStatus === 'incomplete') {
            newDbStatus = 'past_due';
        } else if (paymongoStatus === 'cancelled' || paymongoStatus === 'incomplete_expired') {
            newDbStatus = 'cancelled';
        }

        const nextBillingDate = subDetails?.attributes?.next_billing_date
            ? new Date(subDetails.attributes.next_billing_date)
            : tenant.current_period_end;

        const updates = {
            subscription_status: newDbStatus,
            current_period_end: nextBillingDate
        };

        // Handle cancelled subscription
        if (newDbStatus === 'cancelled') {
            updates.cancelled_at = new Date();
        }

        await tenant.update(updates);

        logger?.info?.(`Synced tenant ${tenant.name} with PayMongo. Status: ${newDbStatus}`);

        return ok({
            success: true,
            message: 'Subscription synced with PayMongo',
            paymongo_subscription_id: tenant.paymongo_subscription_id,
            status: newDbStatus,
            current_period_end: nextBillingDate,
            paymongo_raw_status: paymongoStatus
        });
    };
};
