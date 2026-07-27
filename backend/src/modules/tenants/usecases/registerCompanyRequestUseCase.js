import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    assertDgfyLegalAcknowledgement,
    DGFY_LEGAL_TERM_FLOWS
} from '../../shared/utils/dgfyLegalTerms.js';
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
import { isValidPhoneNumber, normalizePhoneNumber } from '../../../utils/phoneNumber.js';

const buildLegalPersistenceError = () => new DomainError(
    DomainErrorCode.INTERNAL_ERROR,
    'DGFY legal acknowledgement persistence is unavailable.',
    {
        statusCode: 500,
        details: {
            error_code: 'LEGAL_ACKNOWLEDGEMENT_PERSISTENCE_UNAVAILABLE'
        }
    }
);

const toLegalPersistenceFailure = (error) => (
    error instanceof DomainError
        ? error
        : new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            'Company registration failed while saving legal acknowledgement evidence.',
            {
                statusCode: 500,
                details: {
                    error_code: 'LEGAL_ACKNOWLEDGEMENT_PERSISTENCE_FAILED'
                }
            }
        )
);

export const buildRegisterCompanyRequestUseCase = ({
    tenantAdminRepository,
    paypalService,
    trackEngagementEvent,
    addEmailTenantMapping,
    dgfyAccountRepository,
    provisionTenant,
    createPayMongoChildAccountForTenant = null,
    shouldAutoCreatePayMongoChildAccounts = () => false,
    emailService,
    idGenerator,
    getTenantRegistrationApprovalMode = () => TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD,
    logger
}) => {
    return async ({ body, dgfyAccount, correlationId, metadata = {} }) => {
        const {
            name,
            subscriptionId,
            workflowMode,
            industryTag
        } = body || {};
        const adminEmail = String(dgfyAccount?.email || '').trim().toLowerCase();
        const adminPhone = String(dgfyAccount?.phone || '').trim();
        const adminUsername = String(dgfyAccount?.first_name || dgfyAccount?.username || 'Admin').trim() || 'Admin';
        const adminPasswordHash = dgfyAccount?.password_hash || null;
        const plan = resolveRegisteredTenantPlan();
        const complianceModeState = 'non_compliant_active';
        const normalizedComplianceMode = 'non_compliant';
        const requestedPlan = normalizeRequestedTenantPlan(plan);
        const normalizedPlan = resolveRegisteredTenantPlan();
        const normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);
        const workflowModeMissing = workflowMode === undefined || workflowMode === null || String(workflowMode).trim() === '';
        // Purely descriptive — how the merchant would describe their business — kept
        // separate from workflowMode (the engineering operating mode) so the two are
        // never conflated. Optional; not used to drive any platform behavior.
        const normalizedIndustryTag = String(industryTag || '').trim().slice(0, 120) || null;
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
        let paymongoChildAccountStatus;

        const createPendingPayMongoChildAccount = async ({ source }) => {
            if (!shouldAutoCreatePayMongoChildAccounts() || typeof createPayMongoChildAccountForTenant !== 'function') {
                return 'skipped';
            }

            try {
                const result = await createPayMongoChildAccountForTenant({
                    tenantId: tenant.id,
                    payload: { trade_name: tenant.name },
                    actor: source
                });
                if (result?.success === false || result?.error) {
                    logger?.warn?.('[Registration] PayMongo child account creation did not complete', {
                        tenant_id: tenant.id,
                        error: result?.error?.message || result?.message || 'unknown_error'
                    });
                    return 'failed';
                }
                return result?.data?.idempotent_replay ? 'existing' : 'created';
            } catch (paymongoError) {
                logger?.warn?.('[Registration] PayMongo child account creation failed after tenant provisioning', {
                    tenant_id: tenant.id,
                    error: paymongoError.message
                });
                return 'failed';
            }
        };

        try {
            await tracker.attempt();

            const normalizedAdminPhone = normalizePhoneNumber(adminPhone);
            if (!dgfyAccount?.id || !name || !adminEmail || !normalizedAdminPhone || !adminPasswordHash || workflowModeMissing) {
                const missingFields = [
                    !dgfyAccount?.id ? 'dgfyAccount' : null,
                    !name ? 'name' : null,
                    !adminEmail ? 'adminEmail' : null,
                    !normalizedAdminPhone ? 'adminPhone' : null,
                    !adminPasswordHash ? 'adminPasswordHash' : null,
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
                    'A signed-in DGFY account, company name, and business industry are required.',
                    { statusCode: 400 }
                ));
            }

            if (!isValidPhoneNumber(normalizedAdminPhone)) {
                await tracker.failed({
                    failureCode: 'validation_failed',
                    failureReason: 'invalid_admin_phone',
                    httpStatus: 400
                });

                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'adminPhone must be a valid phone number.',
                    { statusCode: 400 }
                ));
            }

            let legalAcknowledgement;
            try {
                legalAcknowledgement = assertDgfyLegalAcknowledgement({
                    flow: DGFY_LEGAL_TERM_FLOWS.COMPANY_REGISTRATION,
                    body
                });
            } catch (legalError) {
                await tracker.failed({
                    failureCode: 'terms_acknowledgement_required',
                    failureReason: legalError.message,
                    httpStatus: legalError.statusCode || 422,
                    metadata: legalError.details || null
                });

                return fail(legalError);
            }

            if (typeof dgfyAccountRepository?.recordLegalAcknowledgement !== 'function'
                || typeof tenantAdminRepository?.transaction !== 'function') {
                const persistenceError = buildLegalPersistenceError();
                await tracker.failed({
                    failureCode: 'legal_acknowledgement_persistence_unavailable',
                    failureReason: persistenceError.message,
                    httpStatus: persistenceError.statusCode,
                    metadata: persistenceError.details || null
                });

                return fail(persistenceError);
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
            // No subscriptionId provisions immediately by default unless manual approval is explicitly configured.

            const uuid = idGenerator();
            const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const dbName = `sku_tenant_${safeName}_${uuid.split('-')[0]}`;
            const subdomain = `${safeName}-${uuid.split('-')[0]}`;
            const companyToken = `token-${safeName}-${uuid.split('-')[0]}`;
            try {
                tenant = await tenantAdminRepository.transaction(async (transaction) => {
                    const createdTenant = await tenantAdminRepository.createTenant({
                        id: uuid,
                        name,
                        domain: subdomain,
                        db_name: dbName,
                        company_token: companyToken,
                        status: shouldProvisionImmediately ? 'pending' : initialStatus,
                        admin_email: adminEmail,
                        admin_phone: normalizedAdminPhone,
                        admin_password_hash: adminPasswordHash,
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
                        owner_dgfy_account_id: dgfyAccount.id,
                        settings: {
                            workflow_mode: normalizedWorkflowMode,
                            industry_tag: normalizedIndustryTag
                        }
                    }, { transaction });

                    await dgfyAccountRepository.recordLegalAcknowledgement({
                        ...legalAcknowledgement,
                        dgfy_account_id: dgfyAccount.id,
                        tenant_id: createdTenant.id,
                        ip_address: metadata.ip_address || null,
                        user_agent: metadata.user_agent || null,
                        request_id: metadata.request_id || correlationId || null,
                        accepted_at: new Date()
                    }, { transaction });

                    if (!shouldProvisionImmediately && dgfyAccountRepository?.upsertFounderMembership) {
                        await dgfyAccountRepository.upsertFounderMembership({
                            dgfyAccountId: dgfyAccount.id,
                            tenantId: createdTenant.id,
                            tenantUserId: null,
                            role: 'admin'
                        }, { transaction });
                    }

                    return createdTenant;
                });
            } catch (legalPersistenceError) {
                const persistenceError = toLegalPersistenceFailure(legalPersistenceError);
                await tracker.failed({
                    failureCode: 'legal_acknowledgement_persistence_failed',
                    failureReason: persistenceError.message,
                    httpStatus: persistenceError.statusCode,
                    metadata: persistenceError.details || null
                });

                return fail(persistenceError);
            }

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
                    adminPhone: tenant.admin_phone,
                    adminUsername,
                    adminPasswordHash: tenant.admin_password_hash,
                    workflowMode: normalizedWorkflowMode
                });

                if (dgfyAccountRepository?.upsertFounderMembership) {
                    await dgfyAccountRepository.upsertFounderMembership({
                        dgfyAccountId: dgfyAccount.id,
                        tenantId: tenant.id,
                        tenantUserId: provisionedTenant?.admin_user_id || null,
                        role: 'admin'
                    });
                    if (!tenant.owner_dgfy_account_id) {
                        await tenant.update({ owner_dgfy_account_id: dgfyAccount.id }).catch(() => {});
                    }
                }

                paymongoChildAccountStatus = await createPendingPayMongoChildAccount({
                    source: 'company_registration_auto_provision'
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
                        email_sent: emailSent,
                        paymongo_child_account_status: paymongoChildAccountStatus
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
                            industry_tag: normalizedIndustryTag,
                            company_token: tenant.company_token,
                            email_sent: emailSent,
                            paymongo_child_account_status: paymongoChildAccountStatus
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
                        industry_tag: normalizedIndustryTag,
                        company_token: tenant.company_token
                    }
                }
            });
        } catch (error) {
            logger?.error?.('Registration request error:', error);
            const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
            const isClientError = statusCode >= 400 && statusCode < 500;

            await tracker.failed({
                tenantId: tenant?.id || null,
                subscriptionId: validatedSubscriptionId || subscriptionId || null,
                failureCode: isClientError ? (error.code || 'validation_failed') : (tenant ? 'post_creation_failure' : 'unexpected_error'),
                failureReason: error.message,
                httpStatus: statusCode,
                metadata: {
                    error: error.message
                }
            });

            return fail(new DomainError(
                isClientError ? DomainErrorCode.VALIDATION_FAILED : DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Registration failed',
                { statusCode, details: error.code ? { error_code: error.code } : null }
            ));
        }
    };
};
