import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

/**
 * Cancels a PayMongo subscription.
 * Sets subscription status to cancelled in both PayMongo and local database.
 */
export const buildCancelPayMongoSubscriptionUseCase = ({
    paymentRepository,
    paymongoService,
    emailService,
    logger
}) => {
    return async ({ tenantId, reason = null }) => {
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

        if (tenant.subscription_status === 'cancelled') {
            return fail(new DomainError(
                DomainErrorCode.CONFLICT,
                'This subscription is already cancelled.',
                { statusCode: 409 }
            ));
        }

        // Cancel via PayMongo API
        try {
            await paymongoService.cancelSubscription(tenant.paymongo_subscription_id);
        } catch (error) {
            logger?.error?.('PayMongo cancelSubscription error:', error);
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Unable to cancel PayMongo subscription. Please try again later.',
                { statusCode: 503 }
            ));
        }

        // Update tenant status
        await tenant.update({
            subscription_status: 'cancelled',
            payment_method: 'manual',
            paymongo_subscription_id: null,
            cancelled_at: new Date()
        });

        // Send cancellation email if configured
        if (emailService?.isEmailConfigured?.()) {
            await emailService.sendSubscriptionCancelledEmail({
                email: tenant.admin_email,
                companyName: tenant.name,
                reason: reason || 'No reason provided'
            }).catch(err => logger?.warn?.('Email send failed (cancellation):', err.message));
        }

        logger?.info?.(`PayMongo subscription cancelled for tenant ${tenant.name}. Reason: ${reason || 'User initiated'}`);

        return ok({
            success: true,
            message: 'Subscription cancelled successfully',
            subscription_status: 'cancelled',
            payment_method: 'manual'
        });
    };
};
