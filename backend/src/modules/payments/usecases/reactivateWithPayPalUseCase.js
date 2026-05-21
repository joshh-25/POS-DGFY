import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { extendOneCalendarMonth } from './paymentDateUtils.js';
import { createBillingFunnelTracker } from '../../shared/billingFunnelTracker.js';

const resolvePayPalPlanId = (subDetails = {}) => (
    subDetails?.plan_id
    || subDetails?.plan?.id
    || subDetails?.plan?.plan_id
    || subDetails?.billing_info?.plan_id
    || subDetails?.billing_info?.last_payment?.plan_id
    || null
);

/**
 * An inactive tenant self-reactivates by providing a new active PayPal subscription.
 * Verifies the subscription, resolves the plan from the PayPal plan_id, and restores
 * the tenant to active status without requiring admin intervention.
 */
export const buildReactivateWithPayPalUseCase = ({
    paymentRepository,
    paypalService,
    trackEngagementEvent,
    logger
}) => {
    return async ({ tenantId, userId, subscriptionId, correlationId }) => {
        const tracker = createBillingFunnelTracker({
            trackEngagementEvent,
            eventPrefix: 'paypal_reactivation',
            source: 'payments.reactivate_with_paypal',
            route: '/api/v1/payments/reactivate-with-paypal',
            tenantId,
            userId,
            subscriptionId: subscriptionId || null,
            correlationId
        });

        await tracker.attempt();

        if (!subscriptionId) {
            await tracker.blocked('missing_subscription', {
                httpStatus: 400,
                failureReason: 'missing_subscription_id'
            });
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'A PayPal subscription ID is required.',
                { statusCode: 400 }
            ));
        }

        const tenant = await paymentRepository.findTenantById(tenantId);
        if (!tenant) {
            await tracker.failedSpecific('tenant_not_found', {
                httpStatus: 404
            });
            return fail(new DomainError(
                DomainErrorCode.TENANT_NOT_FOUND,
                'Tenant not found.',
                { statusCode: 404 }
            ));
        }

        if (tenant.status !== 'inactive') {
            await tracker.blocked('not_inactive', {
                httpStatus: 400,
                failureReason: `tenant_status_${tenant.status}`
            });
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Only inactive accounts can use this reactivation path.',
                { statusCode: 400 }
            ));
        }

        let subDetails;
        try {
            subDetails = await paypalService.verifySubscription(subscriptionId);
        } catch (error) {
            logger?.error?.('PayPal verification error during reactivation:', error);
            await tracker.failed({
                failureCode: 'verification_exception',
                failureReason: error.message,
                httpStatus: 503
            });
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Unable to verify PayPal subscription at this time.',
                { statusCode: 503 }
            ));
        }

        if (!subDetails || subDetails.status !== 'ACTIVE') {
            await tracker.blocked('unpaid', {
                httpStatus: 400,
                failureReason: `subscription_not_active_${subDetails?.status || 'unknown'}`,
                metadata: { paypal_status: subDetails?.status || 'UNKNOWN' }
            });
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `PayPal subscription is not active. Status: ${subDetails?.status || 'Unknown'}`,
                { statusCode: 400 }
            ));
        }

        // Resolve plan from PayPal plan_id
        const standardPlanId = process.env.PAYPAL_STANDARD_PLAN_ID;
        const premiumPlanId = process.env.PAYPAL_PREMIUM_PLAN_ID || process.env.PAYPAL_PLAN_ID;
        const paypalPlanId = resolvePayPalPlanId(subDetails);

        if (!standardPlanId || !premiumPlanId) {
            await tracker.failed({
                failureCode: 'missing_plan_env_configuration',
                failureReason: 'PAYPAL_STANDARD_PLAN_ID and PAYPAL_PREMIUM_PLAN_ID/PAYPAL_PLAN_ID must be configured',
                httpStatus: 500
            });
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                'PayPal plan configuration is incomplete. Contact support.',
                { statusCode: 500 }
            ));
        }

        let resolvedPlan = null;
        if (premiumPlanId && paypalPlanId === premiumPlanId) {
            resolvedPlan = 'premium';
        } else if (standardPlanId && paypalPlanId === standardPlanId) {
            resolvedPlan = 'standard';
        }

        if (!resolvedPlan) {
            await tracker.blocked('invalid_plan', {
                httpStatus: 400,
                failureReason: 'subscription_plan_unrecognized',
                metadata: { paypal_plan_id: paypalPlanId || 'unknown' }
            });
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Subscription plan could not be identified. Please ensure you subscribed to a valid SKUpervisor plan.',
                { statusCode: 400 }
            ));
        }

        const now = new Date();
        const anchorDay = tenant.billing_cycle_anchor || now.getDate();
        const nextBillingDate = extendOneCalendarMonth(now, anchorDay);

        await tenant.update({
            status: 'active',
            subscription_status: 'active',
            paypal_subscription_id: subscriptionId,
            payment_method: 'paypal',
            plan: resolvedPlan,
            current_period_end: nextBillingDate,
            cancelled_at: null,
            reactivation_requested_at: null,
            grace_period_end: null
        });
        await tracker.succeeded({
            metadata: {
                resolved_plan: resolvedPlan,
                paypal_status: subDetails.status,
                current_period_end: nextBillingDate.toISOString()
            }
        });

        logger?.info?.(`Tenant ${tenant.name} self-reactivated via PayPal. Plan: ${resolvedPlan}.`);

        return ok({
            message: 'Account reactivated successfully.',
            plan: resolvedPlan
        });
    };
};
