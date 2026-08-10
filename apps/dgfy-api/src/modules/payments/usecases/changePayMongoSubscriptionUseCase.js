import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { extendOneCalendarMonth, toValidDate } from './paymentDateUtils.js';

/**
 * Changes a PayMongo subscription plan.
 * For immediate change: Updates the subscription directly
 * For future change: Queues the change for next billing cycle
 */
export const buildChangePayMongoSubscriptionUseCase = ({
    paymentRepository,
    paymongoService,
    logger
}) => {
    return async ({ tenantId, newPlan, effectiveDate = null }) => {
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
                'Tenant does not have an active PayMongo subscription.',
                { statusCode: 400 }
            ));
        }

        if (!['standard', 'premium'].includes(newPlan)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Invalid plan. Must be "standard" or "premium".',
                { statusCode: 400 }
            ));
        }

        if (newPlan === tenant.plan) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'The new plan is the same as the current plan.',
                { statusCode: 400 }
            ));
        }

        // Determine if change is immediate or for next billing cycle
        const now = new Date();
        const changeDate = effectiveDate ? toValidDate(effectiveDate) : null;
        const isImmediate = !changeDate || changeDate <= now;

        if (isImmediate) {
            // Immediate change via PayMongo API
            const newPlanId = newPlan === 'premium'
                ? process.env.PAYMONGO_PREMIUM_PLAN_ID
                : process.env.PAYMONGO_STANDARD_PLAN_ID;

            if (!newPlanId) {
                return fail(new DomainError(
                    DomainErrorCode.INTERNAL_ERROR,
                    `PayMongo plan ID for "${newPlan}" is not configured.`,
                    { statusCode: 500 }
                ));
            }

            try {
                await paymongoService.updateSubscription(tenant.paymongo_subscription_id, {
                    plan_id: newPlanId
                });

                await tenant.update({
                    plan: newPlan,
                    pending_plan: null,
                    pending_plan_change_date: null,
                    pending_plan_approved: false
                });

                logger?.info?.(`Plan change applied immediately for tenant ${tenant.name}: ${newPlan}`);

                return ok({
                    success: true,
                    message: 'Plan changed immediately',
                    plan: newPlan,
                    effective_immediately: true
                });
            } catch (error) {
                logger?.error?.('PayMongo updateSubscription error:', error);
                return fail(new DomainError(
                    DomainErrorCode.SERVICE_UNAVAILABLE,
                    'Unable to update PayMongo subscription at this time.',
                    { statusCode: 503 }
                ));
            }
        } else {
            // Queue for next billing cycle
            const anchorDate = tenant.billing_cycle_anchor || now.getDate();
            const nextBillingDate = extendOneCalendarMonth(now, anchorDate);

            await tenant.update({
                pending_plan: newPlan,
                pending_plan_change_date: changeDate || nextBillingDate,
                pending_plan_approved: false
            });

            logger?.info?.(`Plan change queued for tenant ${tenant.name}: ${newPlan} on ${changeDate || nextBillingDate}`);

            return ok({
                success: true,
                message: 'Plan change scheduled for next billing cycle',
                pending_plan: newPlan,
                effective_date: changeDate || nextBillingDate,
                effective_immediately: false
            });
        }
    };
};
