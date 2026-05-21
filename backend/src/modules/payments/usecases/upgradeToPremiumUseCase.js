import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { toValidDate, maxDate, extendOneCalendarMonth } from './paymentDateUtils.js';
import { createBillingFunnelTracker } from '../../../services/billingFunnelTelemetryService.js';

export const buildUpgradeToPremiumUseCase = ({
    paymentRepository,
    paypalService,
    trackEngagementEvent,
    logger
}) => {
    return async ({
        tenantId,
        userId,
        subscriptionId,
        correlationId
    }) => {
        const tracker = createBillingFunnelTracker({
            trackEngagementEvent,
            eventPrefix: 'premium_upgrade',
            source: 'payments.upgrade',
            route: '/api/v1/payments/upgrade',
            tenantId,
            userId,
            subscriptionId: subscriptionId || null,
            correlationId
        });

        await tracker.attempt();

        if (!subscriptionId) {
            await tracker.blocked('missing_subscription', {
                httpStatus: 400,
                failureReason: 'missing_subscription_id',
                metadata: {
                    reason: 'missing_subscription_id'
                }
            });

            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Subscription ID is required',
                { statusCode: 400 }
            ));
        }

        let subDetails;
        try {
            subDetails = await paypalService.verifySubscription(subscriptionId);
        } catch (error) {
            await tracker.failed({
                failureCode: 'verification_exception',
                failureReason: error.message,
                httpStatus: 503,
                metadata: {
                    provider: 'paypal'
                }
            });

            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Unable to verify PayPal subscription at this time',
                { statusCode: 503 }
            ));
        }

        if (!subDetails || subDetails.status !== 'ACTIVE') {
            await tracker.blocked('unpaid', {
                httpStatus: 400,
                failureReason: 'subscription_not_active',
                metadata: {
                    paypal_status: subDetails?.status || 'UNKNOWN'
                }
            });

            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Subscription is not active. Current status: ${subDetails?.status || 'Unknown'}`,
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

        let nextBillingDate;
        const paypalNextBillingTime = toValidDate(subDetails.billing_info?.next_billing_time);
        let resolvedBillingAnchor = tenant.billing_cycle_anchor || null;

        if (paypalNextBillingTime) {
            nextBillingDate = paypalNextBillingTime;
            if (!resolvedBillingAnchor) {
                resolvedBillingAnchor = paypalNextBillingTime.getDate();
            }
        } else {
            const now = new Date();
            const anchor = resolvedBillingAnchor || now.getDate();
            nextBillingDate = extendOneCalendarMonth(now, anchor);
            resolvedBillingAnchor = anchor;
        }

        nextBillingDate = maxDate(nextBillingDate, toValidDate(tenant.current_period_end));
        if (!nextBillingDate) {
            await tracker.failed({
                failureCode: 'billing_date_resolution_failed',
                failureReason: 'unable_to_resolve_next_billing_date',
                httpStatus: 500
            });

            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                'Unable to resolve next billing date',
                { statusCode: 500 }
            ));
        }

        try {
            await tenant.update({
                plan: 'premium',
                subscription_status: 'active',
                paypal_subscription_id: subscriptionId,
                current_period_end: nextBillingDate,
                billing_cycle_anchor: resolvedBillingAnchor,
                payment_method: 'paypal'
            });
        } catch (error) {
            await tracker.failed({
                failureCode: 'persistence_failed',
                failureReason: error.message,
                httpStatus: 500
            });

            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                'Failed to persist premium upgrade',
                { statusCode: 500 }
            ));
        }

        await tracker.succeeded({
            metadata: {
                paypal_status: subDetails.status,
                current_period_end: nextBillingDate.toISOString()
            }
        });

        logger.info(`Tenant ${tenant.name} upgraded to Premium. Expiry set to ${nextBillingDate}.`);

        return ok({
            plan: 'premium',
            subscription_status: 'active',
            current_period_end: nextBillingDate
        });
    };
};
