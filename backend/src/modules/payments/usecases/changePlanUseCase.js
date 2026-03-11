import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { extendOneCalendarMonth } from './paymentDateUtils.js';

/**
 * Change the subscription plan for a tenant.
 *
 * - PayPal tenants: calls the PayPal Revise API and queues a pending plan change
 *   that requires user re-consent. Returns an approvalUrl for the frontend to open.
 * - Manual tenants (admin `immediate = true`): updates the plan directly.
 */
export const buildChangePlanUseCase = ({
    paymentRepository,
    paypalService,
    emailService,
    logger
}) => {
    return async ({ tenantId, newPlan, immediate = false }) => {
        if (!newPlan || !['standard', 'premium'].includes(newPlan)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'newPlan must be "standard" or "premium".',
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

        if (tenant.status !== 'active') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Plan changes are only available for active accounts.',
                { statusCode: 403 }
            ));
        }

        if (tenant.plan === newPlan && !tenant.pending_plan) {
            return fail(new DomainError(
                DomainErrorCode.CONFLICT,
                `Tenant is already on the ${newPlan} plan.`,
                { statusCode: 409 }
            ));
        }

        if (tenant.pending_plan && !immediate) {
            return fail(new DomainError(
                DomainErrorCode.CONFLICT,
                `A plan change to "${tenant.pending_plan}" is already pending. Please wait for it to take effect.`,
                { statusCode: 409 }
            ));
        }

        // ── Manual tenant (admin-initiated immediate change) ──────────────────
        if (tenant.payment_method === 'manual' || immediate) {
            const now = new Date();
            const anchor = tenant.billing_cycle_anchor || now.getDate();
            const newPeriodEnd = extendOneCalendarMonth(now, anchor);

            const updates = {
                plan: newPlan,
                pending_plan: null,
                pending_plan_approved: false,
                pending_plan_change_date: null,
                subscription_status: 'active',
                current_period_end: newPeriodEnd
            };

            await tenant.update(updates);

            if (emailService?.isEmailConfigured?.()) {
                await emailService.sendPlanChangeAppliedEmail({
                    email: tenant.admin_email,
                    companyName: tenant.name,
                    oldPlan: tenant.plan,
                    newPlan
                }).catch(err => logger?.warn?.('Email send failed (plan applied):', err.message));
            }

            logger?.info?.(`Tenant ${tenant.name} plan changed to ${newPlan} (immediate).`);

            return ok({ plan: newPlan, immediate: true });
        }

        // ── PayPal tenant (requires Revise API + user re-consent) ─────────────
        if (!tenant.paypal_subscription_id) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'No PayPal subscription found for this tenant. Use the manual plan change instead.',
                { statusCode: 400 }
            ));
        }

        const planEnvKey = newPlan === 'premium'
            ? process.env.PAYPAL_PREMIUM_PLAN_ID
            : process.env.PAYPAL_STANDARD_PLAN_ID;

        if (!planEnvKey) {
            return fail(new DomainError(
                DomainErrorCode.CONFIGURATION_ERROR,
                `PayPal plan ID for "${newPlan}" is not configured in environment variables.`,
                { statusCode: 500 }
            ));
        }

        let reviseResponse;
        try {
            reviseResponse = await paypalService.reviseSubscription(
                tenant.paypal_subscription_id,
                planEnvKey
            );
        } catch (error) {
            logger?.error?.('PayPal Revise Subscription error:', error);
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Unable to initiate plan change with PayPal at this time.',
                { statusCode: 503 }
            ));
        }

        const approveLink = (reviseResponse?.links || []).find(l => l.rel === 'approve');
        const approvalUrl = approveLink?.href || null;

        await tenant.update({
            pending_plan: newPlan,
            pending_plan_change_date: new Date(),
            pending_plan_approved: false
        });

        if (emailService?.isEmailConfigured?.()) {
            await emailService.sendPlanChangePendingEmail({
                email: tenant.admin_email,
                companyName: tenant.name,
                currentPlan: tenant.plan,
                newPlan,
                approvalUrl
            }).catch(err => logger?.warn?.('Email send failed (plan pending):', err.message));
        }

        logger?.info?.(`Tenant ${tenant.name} plan change to ${newPlan} queued. Consent required.`);

        return ok({
            requiresConsent: true,
            approvalUrl,
            pending_plan: newPlan
        });
    };
};
