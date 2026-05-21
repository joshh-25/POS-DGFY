import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

/**
 * Admin-initiated PayMongo recurring setup.
 * Generates a PayMongo payment link and emails it to the tenant's admin.
 * The user must click the link and authorize the subscription on PayMongo.
 * Once approved, PayMongo fires `subscription.created` which the
 * webhook handler picks up and promotes pending_paymongo_subscription_id.
 */
export const buildSetupPayMongoRecurringUseCase = ({
    paymentRepository,
    paymongoService,
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

        if (tenant.payment_method === 'paymongo' && tenant.paymongo_subscription_id) {
            return fail(new DomainError(
                DomainErrorCode.CONFLICT,
                'This tenant already has an active PayMongo subscription.',
                { statusCode: 409 }
            ));
        }

        if (tenant.status !== 'active') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'PayMongo setup can only be initiated for active tenants.',
                { statusCode: 400 }
            ));
        }

        const planEnvKey = tenant.plan === 'premium'
            ? process.env.PAYMONGO_PREMIUM_PLAN_ID
            : process.env.PAYMONGO_STANDARD_PLAN_ID;

        if (!planEnvKey) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                `PayMongo plan ID for "${tenant.plan}" is not configured on the server.`,
                { statusCode: 500 }
            ));
        }

        const appUrl = process.env.APP_URL || 'http://localhost:5173';
        const returnUrl = `${appUrl}/settings?tab=subscription&paymongo_setup=success`;
        const cancelUrl = `${appUrl}/settings?tab=subscription&paymongo_setup=cancelled`;

        // Create payment source (for card payment) or use other payment types
        let sourceId, checkoutLink;
        try {
            // For now, we'll create a payment link instead of a source
            // PayMongo payment links work similarly to PayPal approval links
            const paymentLink = await paymongoService.createPaymentLink({
                amount: tenant.plan === 'premium' ? 300000 : 200000, // In centavos
                currency: 'PHP',
                description: `Setup subscription for ${tenant.name}`,
                redirectUrl: {
                    success: returnUrl,
                    failed: cancelUrl
                }
            });

            sourceId = paymentLink.id;
            checkoutLink = paymentLink.checkout_url;
        } catch (error) {
            logger?.error?.('PayMongo createPaymentLink error:', error);
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Unable to create PayMongo subscription link at this time.',
                { statusCode: 503 }
            ));
        }

        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toLocaleString();
        const planAmount = tenant.plan === 'premium' ? 'PHP 3,000' : 'PHP 2,000';
        const planName = tenant.plan === 'premium' ? 'Premium Plan' : 'Standard Plan';

        await tenant.update({
            pending_paymongo_subscription_id: sourceId,
            paymongo_setup_initiated_at: new Date()
        });

        if (emailService?.isEmailConfigured?.()) {
            await emailService.sendPayMongoSetupEmail({
                email: tenant.admin_email,
                companyName: tenant.name,
                checkoutLink,
                expiresAt,
                planName,
                amount: planAmount
            }).catch(err => logger?.warn?.('Email send failed (paymongo setup):', err.message));
        }

        logger?.info?.(`Admin initiated PayMongo setup for tenant ${tenant.name}. Link ID: ${sourceId}`);

        return ok({
            sourceId,
            checkoutLink,
            expiresAt,
            email_sent: emailService?.isEmailConfigured?.() || false
        });
    };
};
