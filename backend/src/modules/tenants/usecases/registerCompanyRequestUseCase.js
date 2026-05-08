import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { toValidDate, extendOneCalendarMonth } from './tenantBillingDateUtils.js';
import { createBillingFunnelTracker } from '../../../services/billingFunnelTelemetryService.js';
import {
    isWorkflowMode,
    normalizeWorkflowMode,
    WORKFLOW_MODE_VALUES
} from '../../shared/constants/workflowModes.js';
import { TENANT_REGISTRATION_APPROVAL_MODES } from '../../../config/tenantRegistrationApproval.js';
import {
    isValidTenantPlan,
    normalizeRequestedTenantPlan,
    resolveRegisteredTenantPlan
} from './tenantPlanPolicy.js';

export const buildRegisterCompanyRequestUseCase = ({
    tenantAdminRepository,
    paypalService,
    trackEngagementEvent,
    addEmailTenantMapping,
    provisionTenant,
    emailService,
    hashPassword,
    idGenerator,
    getTenantRegistrationApprovalMode = () => TENANT_REGISTRATION_APPROVAL_MODES.MANUAL,
    logger
}) => {
    return async ({ body, correlationId }) => {
        const {
            name,
            adminEmail,
            adminPassword,
            plan = 'premium',
            subscriptionId,
            complianceMode,
            workflowMode
        } = body || {};
        const requestedPlan = normalizeRequestedTenantPlan(plan || resolveRegisteredTenantPlan());
        const normalizedPlan = resolveRegisteredTenantPlan();
        const normalizedComplianceMode = typeof complianceMode === 'string'
            ? complianceMode.trim().toLowerCase()
            : '';
        const normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);
        const complianceModeState = normalizedComplianceMode === 'compliant'
            ? 'compliant_pending'
            : normalizedComplianceMode === 'non_compliant'
                ? 'non_compliant_active'
                : null;
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
                plan: normalizedPlan,
                email_domain: adminEmailDomain,
                compliance_mode: normalizedComplianceMode || null,
                workflow_mode: normalizedWorkflowMode || null
            }
        });
        let tenant = null;
        let validatedSubscriptionId = null;

        try {
            await tracker.attempt();

            const workflowModeMissing = workflowMode === undefined || workflowMode === null || String(workflowMode).trim() === '';
            if (!name || !adminEmail || !adminPassword || !complianceModeState || workflowModeMissing) {
                const missingFields = [
                    !name ? 'name' : null,
                    !adminEmail ? 'adminEmail' : null,
                    !adminPassword ? 'adminPassword' : null,
                    !complianceModeState ? 'complianceMode' : null,
                    workflowModeMissing ? 'workflowMode' : null
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
                    'Missing required fields: name, adminEmail, adminPassword, complianceMode, workflowMode',
                    { statusCode: 400 }
                ));
            }

            if (!['non_compliant', 'compliant'].includes(normalizedComplianceMode)) {
                await tracker.failed({
                    failureCode: 'validation_failed',
                    failureReason: 'invalid_compliance_mode',
                    httpStatus: 400,
                    metadata: {
                        compliance_mode: complianceMode
                    }
                });

                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'complianceMode must be either non_compliant or compliant.',
                    { statusCode: 400 }
                ));
            }

            if (!isWorkflowMode(workflowMode)) {
                await tracker.failed({
                    failureCode: 'validation_failed',
                    failureReason: 'invalid_workflow_mode',
                    httpStatus: 400,
                    metadata: {
                        workflow_mode: workflowMode
                    }
                });

                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `workflowMode must be one of: ${WORKFLOW_MODE_VALUES.join(', ')}`,
                    { statusCode: 400 }
                ));
            }

            if (!isValidTenantPlan(requestedPlan)) {
                await tracker.failed({
                    failureCode: 'validation_failed',
                    failureReason: 'invalid_plan',
                    httpStatus: 400,
                    metadata: {
                        plan: requestedPlan
                    }
                });

                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Plan must be either standard or premium.',
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
            let paymentMethod = 'manual';
            let autoApprovalSource = null;
            let shouldProvisionImmediately = false;

            const approvalMode = getTenantRegistrationApprovalMode();
            const shouldAutoApproveStandard = !subscriptionId
                && approvalMode === TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD;

            if (shouldAutoApproveStandard) {
                shouldProvisionImmediately = true;
                autoApprovalSource = 'auto_standard';
            }

            // Both Standard and Premium support PayPal (if subscriptionId provided) OR manual path.
            if (subscriptionId) {
                try {
                    const subDetails = await paypalService.verifySubscription(subscriptionId);
                    if (subDetails && subDetails.status === 'ACTIVE') {
                        initialStatus = 'active';
                        shouldProvisionImmediately = true;
                        subscriptionStatus = 'active';
                        paymentMethod = 'paypal';
                        validatedSubscriptionId = subscriptionId;
                        autoApprovalSource = 'paypal';

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
            // No subscriptionId uses manual approval unless auto-standard mode is explicitly enabled.

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
                status: shouldProvisionImmediately ? 'pending' : initialStatus,
                admin_email: adminEmail,
                admin_password_hash: passwordHash,
                plan: normalizedPlan,
                subscription_status: subscriptionStatus,
                paypal_subscription_id: validatedSubscriptionId,
                current_period_end: currentPeriodEnd,
                billing_cycle_anchor: billingCycleAnchor,
                payment_method: paymentMethod,
                compliance_mode_state: complianceModeState,
                compliance_mode_choice_required: false,
                compliance_mode_selected_at: new Date(),
                compliance_mode_selected_by: 'registration',
                compliance_policy_version: '2026.04.07',
                compliance_profile: {},
                settings: {
                    workflow_mode: normalizedWorkflowMode
                }
            });

            if (!shouldProvisionImmediately) {
                try {
                    await addEmailTenantMapping(adminEmail, tenant.id);
                } catch (mappingError) {
                    logger?.warn?.(
                        `[Registration] Failed to create email-tenant mapping for ${adminEmail}: ${mappingError.message}`
                    );
                }
            }

            if (shouldProvisionImmediately) {
                logger?.info?.(
                    `[Registration] Auto-provisioning ${normalizedPlan} tenant (${autoApprovalSource || 'active'}): ${name}`
                );
                const provisionedTenant = await provisionTenant({
                    tenantId: tenant.id,
                    name: tenant.name,
                    dbName: tenant.db_name,
                    companyToken: tenant.company_token,
                    adminEmail: tenant.admin_email,
                    adminPasswordHash: tenant.admin_password_hash,
                    workflowMode: normalizedWorkflowMode
                });

                let emailSent = false;
                if (emailService?.isEmailConfigured?.()) {
                    try {
                        await emailService.sendCompanyApprovedEmail({
                            email: tenant.admin_email,
                            companyName: tenant.name,
                            companyToken: tenant.company_token
                        });
                        emailSent = true;
                        logger?.info?.(`[Registration] Approval email sent to ${tenant.admin_email}`);
                    } catch (emailError) {
                        logger?.warn?.(
                            `[Registration] Failed to send approval email to ${tenant.admin_email}: ${emailError.message}`
                        );
                    }
                }

                await tracker.succeeded({
                    tenantId: tenant.id,
                    subscriptionId: validatedSubscriptionId,
                    metadata: {
                        status: provisionedTenant?.status || 'active',
                        auto_approved: true,
                        auto_approval_source: autoApprovalSource,
                        email_sent: emailSent
                    }
                });

                const activeMessage = autoApprovalSource === 'auto_standard'
                    ? 'Company registered and activated successfully. You can sign in now.'
                    : `Company registered and activated successfully! Welcome to ${normalizedPlan.charAt(0).toUpperCase() + normalizedPlan.slice(1)}.`;

                return ok({
                    statusCode: 201,
                    payload: {
                        success: true,
                        message: activeMessage,
                        data: {
                            id: tenant.id,
                            name: tenant.name,
                            status: 'active',
                            plan: normalizedPlan,
                            compliance_mode_state: complianceModeState,
                            workflow_mode: normalizedWorkflowMode,
                            company_token: tenant.company_token,
                            email_sent: emailSent
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
                    message: `Your ${normalizedPlan} plan registration has been submitted for review. You will be notified once approved.`,
                        data: {
                            id: tenant.id,
                            name: tenant.name,
                            status: 'pending',
                            plan: normalizedPlan,
                            compliance_mode_state: complianceModeState,
                            workflow_mode: normalizedWorkflowMode,
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
