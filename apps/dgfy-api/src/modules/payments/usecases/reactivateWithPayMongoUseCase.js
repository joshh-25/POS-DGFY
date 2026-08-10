import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { extendOneCalendarMonth, toValidDate } from './paymentDateUtils.js';

/**
 * Reactivates an inactive tenant via PayMongo.
 * User must provide a valid PayMongo subscription ID.
 * This is typically called by a public reactivation endpoint.
 */
export const buildReactivateWithPayMongoUseCase = ({
    paymentRepository,
    paymongoService,
    logger
}) => {
    return async ({ tenantId, subscriptionId }) => {
        if (!subscriptionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'PayMongo subscription ID is required.',
                { statusCode: 400 }
            ));
        }

        const tenant = await paymentRepository.findTenantById(tenantId);
        if (!tenant) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_NOT_FOUND,
                'Tenant not found',
                { statusCode: 404 }
            ));
        }

        // Verify tenant is inactive
        if (tenant.subscription_status !== 'inactive' && tenant.subscription_status !== 'past_due') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Tenant cannot be reactivated from status: ${tenant.subscription_status}`,
                { statusCode: 400 }
            ));
        }

        // Verify PayMongo subscription
        let subDetails;
        try {
            subDetails = await paymongoService.getSubscription(subscriptionId);
        } catch (error) {
            logger?.error?.('PayMongo verification error during reactivation:', error);
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Unable to verify PayMongo subscription.',
                { statusCode: 503 }
            ));
        }

        const subStatus = subDetails?.attributes?.status;
        if (!subDetails || subStatus !== 'active') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `PayMongo subscription is not active. Status: ${subStatus || 'unknown'}`,
                { statusCode: 400 }
            ));
        }

        // Validate plan matches
        const standardPlanId = process.env.PAYMONGO_STANDARD_PLAN_ID;
        const premiumPlanId = process.env.PAYMONGO_PREMIUM_PLAN_ID;
        const paymongoPlanId = subDetails?.attributes?.plan?.id || subDetails?.attributes?.plan_id;

        let resolvedPlan = null;
        if (paymongoPlanId === premiumPlanId) {
            resolvedPlan = 'premium';
        } else if (paymongoPlanId === standardPlanId) {
            resolvedPlan = 'standard';
        }

        if (!resolvedPlan) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Subscription plan is not recognized.',
                { statusCode: 400 }
            ));
        }

        // Get next billing date from PayMongo
        const paymongoNextBilling = subDetails?.attributes?.next_billing_date
            ? toValidDate(subDetails.attributes.next_billing_date)
            : null;

        let nextBillingDate;
        let billingAnchor = tenant.billing_cycle_anchor;

        if (paymongoNextBilling) {
            nextBillingDate = paymongoNextBilling;
            if (!billingAnchor) billingAnchor = paymongoNextBilling.getDate();
        } else {
            const now = new Date();
            const anchor = billingAnchor || now.getDate();
            nextBillingDate = extendOneCalendarMonth(now, anchor);
            billingAnchor = anchor;
        }

        // Update tenant
        await tenant.update({
            paymongo_subscription_id: subscriptionId,
            payment_method: 'paymongo',
            subscription_status: 'active',
            plan: resolvedPlan,
            current_period_end: nextBillingDate,
            billing_cycle_anchor: billingAnchor,
            grace_period_end: null,
            cancelled_at: null,
            reactivation_requested_at: null
        });

        logger?.info?.(`Tenant ${tenant.name} reactivated via PayMongo subscription ${subscriptionId}`);

        return ok({
            success: true,
            message: 'Tenant reactivated successfully',
            payment_method: 'paymongo',
            paymongo_subscription_id: subscriptionId,
            plan: resolvedPlan,
            current_period_end: nextBillingDate,
            subscription_status: 'active'
        });
    };
};
