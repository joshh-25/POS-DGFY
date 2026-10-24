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
    isLaundryWorkflowMode,
    normalizeWorkflowMode,
    WORKFLOW_MODE_VALUES
} from '../../shared/constants/workflowModes.js';
import { resolveRegistrationIndustry } from '../../shared/constants/registrationIndustries.js';
import { TENANT_REGISTRATION_APPROVAL_MODES } from '../../../config/tenantRegistrationApproval.js';
import {
    isValidTenantPlan,
    normalizeRequestedTenantPlan,
    resolveRegisteredTenantPlan
} from './tenantPlanPolicy.js';
import { isValidPhoneNumber, normalizePhoneNumber } from '../../../utils/phoneNumber.js';
import { resolveCompanyRegistrationStatusUrl, resolvePosOnboardingUrl } from '../entities/companyRegistrationStatusUrl.js';
import { normalizeCompanyRegistrationSnapshot } from '../entities/companyRegistrationPayload.js';

const buildRuntimeOwnershipSettings = (workflowMode) => (
    isLaundryWorkflowMode(workflowMode)
        ? {
            business_mode: 'laundry',
            runtime_owner: 'dglaundry',
            dgfy_storefront: true,
            ims: false,
            pos: false,
            operations_url: 'https://laundry.dgfy.ph'
        }
        : {}
);

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
    companyRegistrationRepository,
    paypalService,
    trackEngagementEvent,
    addEmailTenantMapping,
    dgfyAccountRepository,
    registrationIndustryRepository = null,
    emailService,
    idGenerator,
    getTenantRegistrationApprovalMode = () => TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD,
    provisionTenant = null,
    materializeApprovedCompanyRegistration = async () => null,
    createPayMongoChildAccountForTenant = null,
    shouldAutoCreatePayMongoChildAccounts = () => false,
    logger
}) => {
    const parseTenantSettings = (tenant) => {
        const rawSettings = tenant?.settings;
        if (!rawSettings) return {};
        if (typeof rawSettings === 'object') return rawSettings;
        try {
            return JSON.parse(rawSettings) || {};
        } catch {
            return {};
        }
    };

    const runAutoProvisioningInBackground = async ({ tenant, application }) => {
        let result;
        try {
            if (typeof provisionTenant !== 'function') {
                throw new Error('Automatic registration provisioning is not configured.');
            }
            result = await provisionTenant({
                tenantId: tenant.id,
                name: tenant.name,
                dbName: tenant.db_name,
                companyToken: tenant.company_token,
                adminEmail: tenant.admin_email,
                adminPhone: tenant.admin_phone,
                adminPasswordHash: tenant.admin_password_hash,
                workflowMode: normalizeWorkflowMode(parseTenantSettings(tenant)?.workflow_mode),
                templateKey: parseTenantSettings(tenant)?.store_template_key || null,
                tenantCapabilities: { pos_enabled: false }
            });
            const registrationReview = typeof companyRegistrationRepository.findAdminReview === 'function'
                ? await companyRegistrationRepository.findAdminReview(tenant.id)
                : application;
            await materializeApprovedCompanyRegistration({
                tenant,
                application: registrationReview || application
            });
            if (typeof dgfyAccountRepository?.upsertFounderMembership === 'function') {
                await dgfyAccountRepository.upsertFounderMembership({
                    dgfyAccountId: tenant.owner_dgfy_account_id,
                    tenantId: tenant.id,
                    tenantUserId: result?.admin_user_id || null,
                    role: 'admin'
                });
            }
            await companyRegistrationRepository.markProvisioningOutcome({
                tenantId: tenant.id,
                succeeded: true
            });
        } catch (provisioningError) {
            await companyRegistrationRepository.markProvisioningOutcome({
                tenantId: tenant.id,
                succeeded: false,
                details: { error: provisioningError.message }
            }).catch(() => {});
            logger?.error?.('[Registration] Automatic background provisioning failed', {
                tenant_id: tenant.id,
                error: provisioningError.message
            });
            return;
        }

        if (shouldAutoCreatePayMongoChildAccounts() && typeof createPayMongoChildAccountForTenant === 'function') {
            try {
                await createPayMongoChildAccountForTenant({
                    tenantId: tenant.id,
                    payload: { trade_name: tenant.name },
                    actor: 'tenant_registration'
                });
            } catch (paymongoError) {
                logger?.warn?.('[Registration] PayMongo child account creation failed after provisioning', {
                    tenant_id: tenant.id,
                    error: paymongoError.message
                });
            }
        }

        const onboardingDelivery = application.onboardingEmailDelivery || application.submissionEmailDelivery;
        if (onboardingDelivery && emailService?.isEmailConfigured?.() && typeof emailService.sendCompanyOnboardingEmail === 'function') {
            try {
                const deliveryResult = await emailService.sendCompanyOnboardingEmail({
                    email: tenant.admin_email,
                    companyName: tenant.name,
                    statusUrl: resolveCompanyRegistrationStatusUrl(application.id),
                    posUrl: resolvePosOnboardingUrl(tenant.id)
                });
                await companyRegistrationRepository.updateEmailDelivery(onboardingDelivery, {
                    status: 'sent_to_provider',
                    provider_message_id: deliveryResult?.messageId || null,
                    sent_at: new Date(),
                    last_error_summary: null
                });
            } catch (emailError) {
                await companyRegistrationRepository.updateEmailDelivery(onboardingDelivery, {
                    status: 'failed',
                    last_error_summary: String(emailError.message || 'Onboarding email failed.').slice(0, 500)
                }).catch(() => {});
                logger?.warn?.('[Registration] POS onboarding email failed', {
                    application_id: application.id,
                    error: emailError.message
                });
            }
        }

        logger?.info?.('[Registration] Automatic background provisioning completed', {
            tenant_id: tenant.id
        });
    };

    return async ({ body, dgfyAccount, correlationId, metadata = {} }) => {
        const {
            name,
            subscriptionId,
            workflowMode: rawWorkflowMode,
            industryTag,
            industryKey,
            business_type: businessType,
            businessType: businessTypeAlias
        } = body || {};
        const adminEmail = String(dgfyAccount?.email || '').trim().toLowerCase();
        const adminPhone = String(dgfyAccount?.phone || '').trim();
        const adminPasswordHash = dgfyAccount?.password_hash || null;
        const plan = resolveRegisteredTenantPlan();
        const complianceModeState = 'non_compliant_active';
        const normalizedComplianceMode = 'non_compliant';
        const requestedPlan = normalizeRequestedTenantPlan(plan);
        const normalizedPlan = resolveRegisteredTenantPlan();

        // The client sends industryKey (the Industry picker's choice) OR the
        // raw workflowMode (older/unmigrated callers) - never a raw
        // templateKey, so no arbitrary template can ever be requested from
        // outside. When industryKey resolves, it is the single source of
        // truth for both workflowMode and the store template; a workflowMode
        // sent alongside it must agree or the request is rejected below
        // (issue #178 "templates become the Operating Mode" follow-up).
        //
        // Resolution is DB-first (issue #316): registrationIndustryRepository
        // is queried for the row, with REGISTRATION_INDUSTRIES (now the seed
        // baseline that table was populated from) as the fail-open fallback
        // on any lookup error, when no repository is injected, or when the
        // DB simply has no row for the key (there is no delete path for a
        // seeded key, so this can only mean an unmigrated/unseeded
        // environment). The row and the constant entry share field names
        // (workflow_mode, template_key), so every derivation below is
        // unchanged regardless of which one resolvedIndustry came from.
        const normalizedIndustryKey = typeof industryKey === 'string' ? industryKey.trim() : '';
        let industryRow = null;
        if (normalizedIndustryKey && registrationIndustryRepository) {
            try {
                industryRow = await registrationIndustryRepository.findByKey(normalizedIndustryKey);
            } catch (industryLookupError) {
                logger?.warn?.('[Registration] Industry catalog lookup failed; falling back to the seed-baseline constant', {
                    industry_key: normalizedIndustryKey,
                    error: industryLookupError.message
                });
            }
        }
        const resolvedIndustry = normalizedIndustryKey
            ? (industryRow || resolveRegistrationIndustry(normalizedIndustryKey))
            : null;
        // A constant-fallback resolution never hides an industry - only a
        // real DB row can carry hidden: true, so this fails open by
        // construction on every lookup-failure/absent-repository path above.
        const industryHidden = industryRow?.hidden === true;
        const industryKeyUnresolvable = Boolean(normalizedIndustryKey) && !resolvedIndustry;
        const rawWorkflowModeProvided = rawWorkflowMode !== undefined && rawWorkflowMode !== null && String(rawWorkflowMode).trim() !== '';
        const industryModeConflict = Boolean(resolvedIndustry)
            && rawWorkflowModeProvided
            && normalizeWorkflowMode(rawWorkflowMode) !== resolvedIndustry.workflow_mode;
        const workflowMode = resolvedIndustry ? resolvedIndustry.workflow_mode : rawWorkflowMode;
        const storeTemplateKey = resolvedIndustry ? resolvedIndustry.template_key : null;

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
        try {
            await tracker.attempt();

            if (industryKeyUnresolvable) {
                await tracker.failed({
                    failureCode: 'validation_failed',
                    failureReason: 'unknown_industry_key',
                    httpStatus: 400,
                    metadata: { industry_key: normalizedIndustryKey }
                });

                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `industryKey "${normalizedIndustryKey}" is not a recognized business industry.`,
                    { statusCode: 400 }
                ));
            }

            if (industryModeConflict) {
                await tracker.failed({
                    failureCode: 'validation_failed',
                    failureReason: 'industry_workflow_mode_conflict',
                    httpStatus: 400,
                    metadata: { industry_key: normalizedIndustryKey, workflow_mode: rawWorkflowMode }
                });

                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'workflowMode does not match the selected industryKey. Send only industryKey, or omit workflowMode.',
                    { statusCode: 400 }
                ));
            }

            // Admin hide (issue #178 Phase 39, folded into the catalog row by
            // issue #316): an industry an admin has hidden from registration
            // is rejected here even though the client can technically still
            // send its key (the frontend filters it out of the picker, but
            // nothing stops a direct API call). industryHidden was already
            // resolved fail-open above, alongside resolvedIndustry itself.
            if (industryHidden) {
                await tracker.failed({
                    failureCode: 'validation_failed',
                    failureReason: 'hidden_industry_key',
                    httpStatus: 400,
                    metadata: { industry_key: normalizedIndustryKey }
                });

                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `industryKey "${normalizedIndustryKey}" is not currently open for registration.`,
                    { statusCode: 400 }
                ));
            }

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

            const registrationSnapshot = normalizeCompanyRegistrationSnapshot({
                body: { ...body, business_type: businessType ?? businessTypeAlias },
                companyName: name,
                workflowMode: normalizedWorkflowMode,
                industryTag: normalizedIndustryTag,
                registrationIndustry: resolvedIndustry ? normalizedIndustryKey : null,
                storeTemplateKey
            });

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

            const approvalMode = getTenantRegistrationApprovalMode();
            const autoApprove = approvalMode === TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD;

            // Both Standard and Premium support PayPal (if subscriptionId provided) OR manual path.
            if (subscriptionId) {
                try {
                    const subDetails = await paypalService.verifySubscription(subscriptionId);
                    if (subDetails && subDetails.status === 'ACTIVE') {
                        initialStatus = 'pending';
                        subscriptionStatus = 'active';
                        paymentMethod = 'paypal';
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
                        status: initialStatus,
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
                            industry_tag: normalizedIndustryTag,
                            registration_industry: resolvedIndustry ? normalizedIndustryKey : null,
                            store_template_key: storeTemplateKey,
                            ...(autoApprove ? { registration_access_mode: 'catalog_only' } : {}),
                            ...buildRuntimeOwnershipSettings(normalizedWorkflowMode)
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

                    const application = await companyRegistrationRepository.createInitial({
                        tenant: createdTenant,
                        dgfyAccount,
                        legalAcknowledgement,
                        workflowMode: normalizedWorkflowMode,
                        industryTag: normalizedIndustryTag,
                        registrationIndustry: resolvedIndustry ? normalizedIndustryKey : null,
                        storeTemplateKey,
                        registrationSnapshot,
                        emailEventType: autoApprove ? 'onboarding_ready' : 'submission_received',
                        transaction
                    });

                    if (dgfyAccountRepository?.upsertPendingFounderMembership) {
                        await dgfyAccountRepository.upsertPendingFounderMembership({
                            dgfyAccountId: dgfyAccount.id,
                            tenantId: createdTenant.id,
                            tenantUserId: null,
                            role: 'admin'
                        }, { transaction });
                    }

                    return { tenant: createdTenant, application };
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

            const registrationApplication = tenant.application;
            tenant = tenant.tenant;
            try {
                await addEmailTenantMapping(adminEmail, tenant.id);
            } catch (mappingError) {
                logger?.warn?.(
                    `[Registration] Failed to create email-tenant mapping for ${adminEmail}: ${mappingError.message}`
                );
            }

            if (autoApprove) {
                if (typeof companyRegistrationRepository.markAutoProvisioningStarted !== 'function') {
                    throw new DomainError(
                        DomainErrorCode.INTERNAL_ERROR,
                        'Automatic registration provisioning is not configured.',
                        { statusCode: 500 }
                    );
                }
                const claimedApplication = await companyRegistrationRepository.markAutoProvisioningStarted({
                    tenantId: tenant.id
                });
                if (!claimedApplication) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'This company registration is already being processed.',
                        { statusCode: 409 }
                    );
                }
                void runAutoProvisioningInBackground({
                    tenant,
                    application: registrationApplication
                }).catch((backgroundError) => {
                    logger?.error?.('[Registration] Unexpected automatic provisioning error', {
                        tenant_id: tenant.id,
                        error: backgroundError.message
                    });
                });
            }

            await tracker.succeeded({
                tenantId: tenant.id,
                subscriptionId: validatedSubscriptionId,
                metadata: {
                    status: tenant.status,
                    auto_approved: autoApprove
                }
            });

            const submissionDelivery = registrationApplication.submissionEmailDelivery;
            if (!autoApprove && submissionDelivery && emailService?.isEmailConfigured?.()) {
                try {
                    const deliveryResult = await emailService.sendCompanySubmissionReceivedEmail({
                        email: adminEmail,
                        companyName: tenant.name,
                        statusUrl: resolveCompanyRegistrationStatusUrl(registrationApplication.id)
                    });
                    await companyRegistrationRepository.updateEmailDelivery(submissionDelivery, {
                        status: 'sent_to_provider',
                        provider_message_id: deliveryResult?.messageId || null,
                        sent_at: new Date(),
                        last_error_summary: null
                    });
                } catch (emailError) {
                    await companyRegistrationRepository.updateEmailDelivery(submissionDelivery, {
                        status: 'failed',
                        last_error_summary: String(emailError.message || 'Submission email failed.').slice(0, 500)
                    }).catch(() => {});
                    logger?.warn?.('[Registration] Submission confirmation email failed', {
                        application_id: registrationApplication.id,
                        error: emailError.message
                    });
                }
            }

            return ok({
                statusCode: autoApprove ? 202 : 201,
                payload: {
                    success: true,
                    message: autoApprove
                        ? `Your ${normalizedPlan} plan company is being prepared. We will email your POS onboarding link when it is ready.`
                        : `Your ${normalizedPlan} plan registration has been submitted for review. You will be notified once approved.`,
                    data: {
                        id: tenant.id,
                        name: tenant.name,
                        status: autoApprove ? 'setting_up_company' : 'pending',
                        review_status: autoApprove ? 'approved' : 'pending',
                        provisioning_status: autoApprove ? 'in_progress' : 'not_started',
                        plan: normalizedPlan,
                        compliance_mode_state: complianceModeState,
                        workflow_mode: normalizedWorkflowMode,
                        industry_tag: normalizedIndustryTag,
                        registration_industry: resolvedIndustry ? normalizedIndustryKey : null,
                        store_template_key: storeTemplateKey,
                        application_id: registrationApplication.id,
                        ...(autoApprove ? { registration_access_mode: 'catalog_only' } : {})
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
