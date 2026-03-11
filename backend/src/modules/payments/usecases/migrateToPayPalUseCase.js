import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { toValidDate, extendOneCalendarMonth } from './paymentDateUtils.js';
import { createBillingFunnelTracker } from '../../shared/billingFunnelTracker.js';

const resolvePayPalPlanId = (subDetails = {}) => (
    subDetails?.plan_id
    || subDetails?.plan?.id
    || subDetails?.plan?.plan_id
    || subDetails?.billing_info?.plan_id
    || subDetails?.billing_info?.last_payment?.plan_id
    || null
);

export const buildMigrateToPayPalUseCase = ({
    paymentRepository,
    paypalService,
    trackEngagementEvent,
    logger
}) => {
    return async ({ tenantId, userId, subscriptionId, correlationId }) => {
        const tracker = createBillingFunnelTracker({
            trackEngagementEvent,
            eventPrefix: 'paypal_migration',
            source: 'payments.migrate',
            route: '/api/v1/payments/migrate-to-paypal',
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
                'A PayPal subscription ID is required to migrate.',
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
                'Tenant not found',
                { statusCode: 404 }
            ));
        }

        if (tenant.payment_method === 'paypal') {
            await tracker.blocked('already_paypal', {
                httpStatus: 409,
                failureReason: 'already_paypal'
            });
            return fail(new DomainError(
                DomainErrorCode.CONFLICT,
                'This tenant already has PayPal recurring billing configured.',
                { statusCode: 409 }
            ));
        }

        if (tenant.subscription_status !== 'active') {
            await tracker.blocked('not_active', {
                httpStatus: 400,
                failureReason: `subscription_status_${tenant.subscription_status}`
            });
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Only active tenants can migrate to PayPal recurring billing.',
                { statusCode: 400 }
            ));
        }

        let subDetails;
        try {
            subDetails = await paypalService.verifySubscription(subscriptionId);
        } catch (error) {
            logger?.error?.('PayPal verification error during migration:', error);
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
                `Subscription is not active. Current status: ${subDetails?.status || 'Unknown'}`,
                { statusCode: 400 }
            ));
        }

        const standardPlanId = process.env.PAYPAL_STANDARD_PLAN_ID;
        const premiumPlanId = process.env.PAYPAL_PREMIUM_PLAN_ID || process.env.PAYPAL_PLAN_ID;
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

        const paypalPlanId = resolvePayPalPlanId(subDetails);
        let resolvedPlan = null;
        if (paypalPlanId === premiumPlanId) {
            resolvedPlan = 'premium';
        } else if (paypalPlanId === standardPlanId) {
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

        if (resolvedPlan !== tenant.plan) {
            await tracker.blocked('plan_mismatch', {
                httpStatus: 400,
                failureReason: `tenant_plan_${tenant.plan}_paypal_plan_${resolvedPlan}`,
                metadata: {
                    tenant_plan: tenant.plan,
                    paypal_plan: resolvedPlan,
                    paypal_plan_id: paypalPlanId
                }
            });
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `This PayPal subscription is for ${resolvedPlan}, but your account is currently on ${tenant.plan}.`,
                { statusCode: 400 }
            ));
        }

        const paypalNextBillingTime = toValidDate(subDetails.billing_info?.next_billing_time);
        let nextBillingDate;
        let billingAnchor = tenant.billing_cycle_anchor;

        if (paypalNextBillingTime) {
            nextBillingDate = paypalNextBillingTime;
            if (!billingAnchor) billingAnchor = paypalNextBillingTime.getDate();
        } else {
            const now = new Date();
            const anchor = billingAnchor || now.getDate();
            nextBillingDate = extendOneCalendarMonth(now, anchor);
            billingAnchor = anchor;
        }

        await tenant.update({
            paypal_subscription_id: subscriptionId,
            payment_method: 'paypal',
            current_period_end: nextBillingDate,
            billing_cycle_anchor: billingAnchor,
            pending_paypal_subscription_id: null,
            paypal_setup_initiated_at: null
        });
        await tracker.succeeded({
            metadata: {
                resolved_plan: resolvedPlan,
                paypal_status: subDetails.status,
                current_period_end: nextBillingDate.toISOString()
            }
        });

        logger?.info?.(`Tenant ${tenant.name} migrated to PayPal recurring. Next billing: ${nextBillingDate}.`);

        return ok({
            payment_method: 'paypal',
            current_period_end: nextBillingDate,
            paypal_subscription_id: subscriptionId
        });
    };
};
