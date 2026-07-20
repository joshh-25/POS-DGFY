import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

/**
 * Admin-initiated PayPal recurring setup.
 * Generates a PayPal approval link and emails it to the tenant's admin.
 * The user must click the link and authorize the subscription on PayPal.
 * Once approved, PayPal fires BILLING.SUBSCRIPTION.ACTIVATED which the
 * webhook handler picks up and promotes pending_paypal_subscription_id.
 */
export const buildSetupPayPalRecurringUseCase = ({
    paymentRepository,
    paypalService,
    emailService,
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

        if (tenant.payment_method === 'paypal' && tenant.paypal_subscription_id) {
            return fail(new DomainError(
                DomainErrorCode.CONFLICT,
                'This tenant already has an active PayPal subscription.',
                { statusCode: 409 }
            ));
        }

        if (tenant.status !== 'active') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'PayPal setup can only be initiated for active tenants.',
                { statusCode: 400 }
            ));
        }

        const planEnvKey = tenant.plan === 'premium'
            ? process.env.PAYPAL_PREMIUM_PLAN_ID
            : process.env.PAYPAL_STANDARD_PLAN_ID;

        if (!planEnvKey) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                `PayPal plan ID for "${tenant.plan}" is not configured on the server.`,
                { statusCode: 500 }
            ));
        }

        const appUrl = process.env.APP_URL || 'http://localhost:5173';
        const returnUrl = `${appUrl}/settings?tab=subscription&paypal_setup=success`;
        const cancelUrl = `${appUrl}/settings?tab=subscription&paypal_setup=cancelled`;

        let subscriptionId, approvalUrl;
        try {
            ({ subscriptionId, approvalUrl } = await paypalService.createSubscriptionServerSide(
                planEnvKey,
                tenant.admin_email,
                returnUrl,
                cancelUrl
            ));
        } catch (error) {
            logger?.error?.('PayPal createSubscriptionServerSide error:', error);
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Unable to create PayPal subscription link at this time.',
                { statusCode: 503 }
            ));
        }

        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toLocaleString();
        const planAmount = tenant.plan === 'premium' ? '3,000' : '2,000';
        const planName = tenant.plan === 'premium' ? 'Premium Plan' : 'Standard Plan';

        await tenant.update({
            pending_paypal_subscription_id: subscriptionId,
            paypal_setup_initiated_at: new Date()
        });

        if (emailService?.isEmailConfigured?.()) {
            await emailService.sendPayPalSetupEmail({
                email: tenant.admin_email,
                companyName: tenant.name,
                approvalUrl,
                expiresAt,
                planName,
                amount: planAmount
            }).catch(err => logger?.warn?.('Email send failed (paypal setup):', err.message));
        }

        logger?.info?.(`Admin initiated PayPal setup for tenant ${tenant.name}. Sub ID: ${subscriptionId}`);

        return ok({
            subscriptionId,
            approvalUrl,
            expiresAt,
            email_sent: emailService?.isEmailConfigured?.() || false
        });
    };
};
