import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { toValidDate, extendOneCalendarMonth } from './tenantBillingDateUtils.js';
import { createBillingFunnelTracker } from '../../../services/billingFunnelTelemetryService.js';

export const buildRegisterCompanyRequestUseCase = ({
    tenantAdminRepository,
    paypalService,
    trackEngagementEvent,
    addEmailTenantMapping,
    provisionTenant,
    emailService,
    hashPassword,
    idGenerator,
    logger
}) => {
    return async ({ body, correlationId }) => {
        const { name, adminEmail, adminPassword, plan = 'standard', subscriptionId } = body || {};
        const adminEmailDomain = typeof adminEmail === 'string' && adminEmail.includes('@')
            ? adminEmail.split('@')[1].toLowerCase()
            : null;
        const tracker = createBillingFunnelTracker({
            trackEngagementEvent,
            eventPrefix: 'company_registration',
            source: 'admin.tenants.register',
            route: '/api/v1/admin/tenants/register',
            subscriptionId: subscriptionId || null,
            correlationId,
            baseMetadata: {
                plan,
                email_domain: adminEmailDomain
            }
        });
        let tenant = null;
        let validatedSubscriptionId = null;

        try {
            await tracker.attempt();

            if (!name || !adminEmail || !adminPassword) {
                const missingFields = [
                    !name ? 'name' : null,
                    !adminEmail ? 'adminEmail' : null,
                    !adminPassword ? 'adminPassword' : null
                ].filter(Boolean);

                await tracker.failed({
                    failureCode: 'validation_failed',
                    failureReason: 'missing_required_fields',
                    httpStatus: 400,
                    metadata: {
                        missing_fields: missingFields
                    }
                });

                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Missing required fields: name, adminEmail, adminPassword',
                    { statusCode: 400 }
                ));
            }

            const existing = await tenantAdminRepository.findTenantByName(name);
            if (existing) {
                await tracker.failed({
                    failureCode: 'tenant_name_conflict',
                    failureReason: 'duplicate_company_name',
                    httpStatus: 400,
                    metadata: {
                        company_name: name
                    }
                });

                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    'A company with this name already exists',
                    { statusCode: 400 }
                ));
            }

            let initialStatus = 'pending';
            let subscriptionStatus = 'inactive';
            let currentPeriodEnd = null;
            let billingCycleAnchor = null;

            if (plan === 'premium') {
                if (!subscriptionId) {
                    await tracker.blocked('missing_subscription', {
                        httpStatus: 400
                    });

                    return fail(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Premium plan requires a valid PayPal subscription ID',
                        { statusCode: 400 }
                    ));
                }

                try {
                    const subDetails = await paypalService.verifySubscription(subscriptionId);
                    if (subDetails && subDetails.status === 'ACTIVE') {
                        initialStatus = 'active';
                        subscriptionStatus = 'active';
                        validatedSubscriptionId = subscriptionId;

                        const paypalNextBillingTime = toValidDate(subDetails.billing_info?.next_billing_time);
                        if (paypalNextBillingTime) {
                            currentPeriodEnd = paypalNextBillingTime;
                            billingCycleAnchor = paypalNextBillingTime.getDate();
                        } else {
                            const now = new Date();
                            const fallbackAnchor = now.getDate();
                            currentPeriodEnd = extendOneCalendarMonth(now, fallbackAnchor);
                            billingCycleAnchor = fallbackAnchor;
                        }
                    } else {
                        throw new Error('Subscription verification failed. Status: ' + (subDetails?.status || 'Unknown'));
                    }
                } catch (verificationError) {
                    logger?.error?.('PayPal Verification Failed:', verificationError);

                    await tracker.blocked('unpaid', {
                        subscriptionId,
                        httpStatus: 400,
                        failureReason: 'subscription_verification_failed',
                        metadata: {
                            paypal_status: verificationError?.message || 'verification_failed'
                        }
                    });

                    return fail(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Payment verification failed: ${verificationError.message}`,
                        { statusCode: 400 }
                    ));
                }
            }

            const uuid = idGenerator();
            const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const dbName = `sku_tenant_${safeName}_${uuid.split('-')[0]}`;
            const subdomain = `${safeName}-${uuid.split('-')[0]}`;
            const companyToken = `token-${safeName}-${uuid.split('-')[0]}`;
            const passwordHash = await hashPassword(adminPassword, 10);

            tenant = await tenantAdminRepository.createTenant({
                id: uuid,
                name,
                domain: subdomain,
                db_name: dbName,
                company_token: companyToken,
                status: initialStatus,
                admin_email: adminEmail,
                admin_password_hash: passwordHash,
                plan,
                subscription_status: subscriptionStatus,
                paypal_subscription_id: validatedSubscriptionId,
                current_period_end: currentPeriodEnd,
                billing_cycle_anchor: billingCycleAnchor
            });

            try {
                await addEmailTenantMapping(adminEmail, tenant.id);
            } catch (mappingError) {
                logger?.warn?.(
                    `[Registration] Failed to create email-tenant mapping for ${adminEmail}: ${mappingError.message}`
                );
            }

            if (initialStatus === 'active') {
                logger?.info?.(`Auto-provisioning Premium Tenant: ${name}`);
                await provisionTenant({
                    tenantId: tenant.id,
                    name: tenant.name,
                    dbName: tenant.db_name,
                    companyToken: tenant.company_token,
                    adminEmail: tenant.admin_email,
                    adminPasswordHash: tenant.admin_password_hash
                });

                if (emailService?.isEmailConfigured?.()) {
                    await emailService.sendCompanyApprovedEmail({
                        email: tenant.admin_email,
                        companyName: tenant.name,
                        companyToken: tenant.company_token
                    });
                }

                await tracker.succeeded({
                    tenantId: tenant.id,
                    subscriptionId: validatedSubscriptionId,
                    metadata: {
                        status: tenant.status,
                        auto_approved: true
                    }
                });

                return ok({
                    statusCode: 201,
                    payload: {
                        success: true,
                        message: 'Company registered and activated successfully! Welcome to Premium.',
                        data: {
                            id: tenant.id,
                            name: tenant.name,
                            status: 'active',
                            plan: 'premium',
                            company_token: tenant.company_token
                        }
                    }
                });
            }

            await tracker.succeeded({
                tenantId: tenant.id,
                subscriptionId: validatedSubscriptionId,
                metadata: {
                    status: tenant.status,
                    auto_approved: false
                }
            });

            return ok({
                statusCode: 201,
                payload: {
                    success: true,
                    message: 'Your company registration has been submitted for review. You will be notified once approved.',
                    data: {
                        id: tenant.id,
                        name: tenant.name,
                        status: 'pending',
                        plan: 'standard',
                        company_token: tenant.company_token
                    }
                }
            });
        } catch (error) {
            logger?.error?.('Registration request error:', error);

            await tracker.failed({
                tenantId: tenant?.id || null,
                subscriptionId: validatedSubscriptionId || subscriptionId || null,
                failureCode: tenant ? 'post_creation_failure' : 'unexpected_error',
                failureReason: error.message,
                httpStatus: 500,
                metadata: {
                    error: error.message
                }
            });

            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Registration failed',
                { statusCode: 500 }
            ));
        }
    };
};
