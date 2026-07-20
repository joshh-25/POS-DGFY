import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { toValidDate, extendOneCalendarMonth } from './paymentDateUtils.js';
import { createBillingFunnelTracker } from '../../shared/billingFunnelTracker.js';

/**
 * Migrates a tenant to PayMongo recurring billing.
 * User provides their PayMongo subscription ID, which is verified and attached.
 */
export const buildMigrateToPayMongoUseCase = ({
    paymentRepository,
    paymongoService,
    trackEngagementEvent,
    logger
}) => {
    return async ({ tenantId, userId, subscriptionId, correlationId }) => {
        const tracker = createBillingFunnelTracker({
            trackEngagementEvent,
            eventPrefix: 'paymongo_migration',
            source: 'payments.migrate',
            route: '/api/v1/payments/migrate-to-paymongo',
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
                'A PayMongo subscription ID is required to migrate.',
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

        if (tenant.payment_method === 'paymongo') {
            await tracker.blocked('already_paymongo', {
                httpStatus: 409,
                failureReason: 'already_paymongo'
            });
            return fail(new DomainError(
                DomainErrorCode.CONFLICT,
                'This tenant already has PayMongo recurring billing configured.',
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
                'Only active tenants can migrate to PayMongo recurring billing.',
                { statusCode: 400 }
            ));
        }

        let subDetails;
        try {
            subDetails = await paymongoService.getSubscription(subscriptionId);
        } catch (error) {
            logger?.error?.('PayMongo verification error during migration:', error);
            await tracker.failed({
                failureCode: 'verification_exception',
                failureReason: error.message,
                httpStatus: 503
            });
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Unable to verify PayMongo subscription at this time.',
                { statusCode: 503 }
            ));
        }

        const subStatus = subDetails?.attributes?.status;
        if (!subDetails || subStatus !== 'active') {
            await tracker.blocked('unpaid', {
                httpStatus: 400,
                failureReason: `subscription_not_active_${subStatus || 'unknown'}`,
                metadata: { paymongo_status: subStatus || 'UNKNOWN' }
            });
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Subscription is not active. Current status: ${subStatus || 'Unknown'}`,
                { statusCode: 400 }
            ));
        }

        const standardPlanId = process.env.PAYMONGO_STANDARD_PLAN_ID;
        const premiumPlanId = process.env.PAYMONGO_PREMIUM_PLAN_ID;
        if (!standardPlanId || !premiumPlanId) {
            await tracker.failed({
                failureCode: 'missing_plan_env_configuration',
                failureReason: 'PAYMONGO_STANDARD_PLAN_ID and PAYMONGO_PREMIUM_PLAN_ID must be configured',
                httpStatus: 500
            });
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                'PayMongo plan configuration is incomplete. Contact support.',
                { statusCode: 500 }
            ));
        }

        const paymongoPlanId = subDetails?.attributes?.plan?.id || subDetails?.attributes?.plan_id;
        let resolvedPlan = null;
        if (paymongoPlanId === premiumPlanId) {
            resolvedPlan = 'premium';
        } else if (paymongoPlanId === standardPlanId) {
            resolvedPlan = 'standard';
        }

        if (!resolvedPlan) {
            await tracker.blocked('invalid_plan', {
                httpStatus: 400,
                failureReason: 'subscription_plan_unrecognized',
                metadata: { paymongo_plan_id: paymongoPlanId || 'unknown' }
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
                failureReason: `tenant_plan_${tenant.plan}_paymongo_plan_${resolvedPlan}`,
                metadata: {
                    tenant_plan: tenant.plan,
                    paymongo_plan: resolvedPlan,
                    paymongo_plan_id: paymongoPlanId
                }
            });
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `This PayMongo subscription is for ${resolvedPlan}, but your account is currently on ${tenant.plan}.`,
                { statusCode: 400 }
            ));
        }

        let nextBillingDate;
        let billingAnchor = tenant.billing_cycle_anchor;

        // PayMongo returns next_billing_date in subscription attributes
        const paymongoNextBillingTime = subDetails?.attributes?.next_billing_date
            ? toValidDate(subDetails.attributes.next_billing_date)
            : null;

        if (paymongoNextBillingTime) {
            nextBillingDate = paymongoNextBillingTime;
            if (!billingAnchor) billingAnchor = paymongoNextBillingTime.getDate();
        } else {
            const now = new Date();
            const anchor = billingAnchor || now.getDate();
            nextBillingDate = extendOneCalendarMonth(now, anchor);
            billingAnchor = anchor;
        }

        await tenant.update({
            paymongo_subscription_id: subscriptionId,
            payment_method: 'paymongo',
            current_period_end: nextBillingDate,
            billing_cycle_anchor: billingAnchor,
            pending_paymongo_subscription_id: null,
            paymongo_setup_initiated_at: null
        });
        await tracker.succeeded({
            metadata: {
                resolved_plan: resolvedPlan,
                paymongo_status: subStatus,
                current_period_end: nextBillingDate.toISOString()
            }
        });

        logger?.info?.(`Tenant ${tenant.name} migrated to PayMongo recurring. Next billing: ${nextBillingDate}.`);

        return ok({
            payment_method: 'paymongo',
            current_period_end: nextBillingDate,
            paymongo_subscription_id: subscriptionId
        });
    };
};
