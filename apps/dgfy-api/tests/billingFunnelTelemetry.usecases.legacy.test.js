import { jest } from '@jest/globals';
import { buildRegisterCompanyRequestUseCase } from '../src/modules/tenants/usecases/registerCompanyRequestUseCase.js';
import { buildUpgradeToPremiumUseCase } from '../src/modules/payments/usecases/upgradeToPremiumUseCase.js';
import { buildHandleWebhookUseCase } from '../src/modules/payments/usecases/handleWebhookUseCase.js';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/shared/utils/dgfyLegalTerms.js';

const makeLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
});

const getEventTypes = (trackEngagementEvent) => (
    trackEngagementEvent.mock.calls.map(([payload]) => payload.eventType)
);

describe('billing funnel telemetry hardening', () => {
    describe('registerCompanyRequestUseCase', () => {
        const baseTenantAdminRepository = () => ({
            transaction: jest.fn(async (callback) => callback('tx-company')),
            findTenantByName: jest.fn().mockResolvedValue(null),
            createTenant: jest.fn()
        });

        const baseEmailService = () => ({
            isEmailConfigured: jest.fn().mockReturnValue(false),
            sendCompanyApprovedEmail: jest.fn()
        });

        const baseDgfyAccountRepository = () => ({
            recordLegalAcknowledgement: jest.fn().mockResolvedValue({ acknowledgement_id: 'ack-1' }),
            upsertFounderMembership: jest.fn().mockResolvedValue({ membership_id: 'membership-1' })
        });

        const validDgfyAccount = {
            id: 'dgfy-account-1',
            first_name: 'Owner',
            username: 'Owner',
            email: 'owner@example.com',
            phone: '+639123456789',
            password_hash: 'hashed-password',
            email_verified_at: new Date('2026-05-21T00:00:00.000Z')
        };

        const validRegistrationBody = {
            name: 'Acme',
            workflowMode: 'msme',
            accepted_company_terms: true,
            company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
            marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
        };

        it('emits a terminal failed event for missing required fields', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const tenantAdminRepository = baseTenantAdminRepository();
            const useCase = buildRegisterCompanyRequestUseCase({
                tenantAdminRepository,
                paypalService: { verifySubscription: jest.fn() },
                trackEngagementEvent,
                addEmailTenantMapping: jest.fn(),
                dgfyAccountRepository: baseDgfyAccountRepository(),
                provisionTenant: jest.fn(),
                emailService: baseEmailService(),
                idGenerator: jest.fn(),
                logger: makeLogger()
            });

            const result = await useCase({
                body: {
                    name: 'Acme',
                    adminEmail: 'owner@example.com'
                },
                dgfyAccount: null,
                correlationId: 'req-register-missing-fields'
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('VALIDATION_FAILED');
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'company_registration_attempted',
                'company_registration_failed'
            ]);

            const failedEvent = trackEngagementEvent.mock.calls[1][0];
            expect(failedEvent.metadata.failure_code).toBe('validation_failed');
            expect(failedEvent.metadata.failure_reason).toBe('missing_required_fields');
            expect(failedEvent.metadata.missing_fields).toEqual([
                'dgfyAccount',
                'adminEmail',
                'adminPhone',
                'adminPasswordHash',
                'workflowMode'
            ]);
        });

        it('emits a terminal failed event for duplicate company conflicts', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const tenantAdminRepository = baseTenantAdminRepository();
            tenantAdminRepository.findTenantByName.mockResolvedValue({ id: 'existing-tenant' });

            const useCase = buildRegisterCompanyRequestUseCase({
                tenantAdminRepository,
                paypalService: { verifySubscription: jest.fn() },
                trackEngagementEvent,
                addEmailTenantMapping: jest.fn(),
                dgfyAccountRepository: baseDgfyAccountRepository(),
                provisionTenant: jest.fn(),
                emailService: baseEmailService(),
                idGenerator: jest.fn(),
                logger: makeLogger()
            });

            const result = await useCase({
                body: validRegistrationBody,
                dgfyAccount: validDgfyAccount,
                correlationId: 'req-register-conflict'
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('CONFLICT');
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'company_registration_attempted',
                'company_registration_failed'
            ]);

            const failedEvent = trackEngagementEvent.mock.calls[1][0];
            expect(failedEvent.metadata.failure_code).toBe('tenant_name_conflict');
            expect(failedEvent.metadata.failure_reason).toBe('duplicate_company_name');
            expect(failedEvent.metadata.company_name).toBe('Acme');
        });

        it('does not emit success before premium auto-provisioning succeeds', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const tenantAdminRepository = baseTenantAdminRepository();
            tenantAdminRepository.createTenant.mockResolvedValue({
                id: 'tenant-123',
                name: 'Premium Co',
                status: 'active',
                db_name: 'sku_tenant_premium',
                company_token: 'token-premium',
                admin_email: 'paid@premium.test',
                admin_password_hash: 'hashed'
            });

            const useCase = buildRegisterCompanyRequestUseCase({
                tenantAdminRepository,
                paypalService: {
                    verifySubscription: jest.fn().mockResolvedValue({
                        status: 'ACTIVE',
                        billing_info: { next_billing_time: '2026-04-01T00:00:00Z' }
                    })
                },
                trackEngagementEvent,
                addEmailTenantMapping: jest.fn().mockResolvedValue(undefined),
                dgfyAccountRepository: baseDgfyAccountRepository(),
                provisionTenant: jest.fn().mockRejectedValue(new Error('provisioning exploded')),
                emailService: baseEmailService(),
                idGenerator: jest.fn().mockReturnValue('11111111-2222-3333-4444-555555555555'),
                logger: makeLogger()
            });

            const result = await useCase({
                body: {
                    ...validRegistrationBody,
                    name: 'Premium Co',
                    plan: 'premium',
                    subscriptionId: 'I-PREMIUM-001',
                    workflowMode: 'food_manufacturing'
                },
                dgfyAccount: {
                    ...validDgfyAccount,
                    email: 'paid@premium.test'
                },
                correlationId: 'req-register-provision-fail'
            });

            expect(result.success).toBe(false);
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'company_registration_attempted',
                'company_registration_failed'
            ]);

            const failedEvent = trackEngagementEvent.mock.calls[1][0];
            expect(failedEvent.tenantId).toBe('tenant-123');
            expect(failedEvent.metadata.failure_code).toBe('post_creation_failure');
            expect(failedEvent.metadata.failure_reason).toBe('provisioning exploded');
        });
    });

    describe('upgradeToPremiumUseCase', () => {
        const basePaymentRepository = () => ({
            findTenantById: jest.fn().mockResolvedValue({
                id: 'tenant-1',
                name: 'Acme',
                billing_cycle_anchor: null,
                current_period_end: null,
                update: jest.fn().mockResolvedValue(true)
            })
        });

        it('emits a terminal failed event when PayPal verification throws', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const paymentRepository = basePaymentRepository();
            const useCase = buildUpgradeToPremiumUseCase({
                paymentRepository,
                paypalService: {
                    verifySubscription: jest.fn().mockRejectedValue(new Error('paypal timeout'))
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-1',
                userId: 7,
                subscriptionId: 'I-UPGRADE-FAIL',
                correlationId: 'req-upgrade-verify-fail'
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'premium_upgrade_attempted',
                'premium_upgrade_failed'
            ]);

            const failedEvent = trackEngagementEvent.mock.calls[1][0];
            expect(failedEvent.metadata.failure_code).toBe('verification_exception');
            expect(failedEvent.metadata.failure_reason).toBe('paypal timeout');
            expect(failedEvent.metadata.http_status).toBe(503);
        });

        it('emits a terminal failed event when tenant persistence fails', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const tenant = {
                id: 'tenant-1',
                name: 'Acme',
                billing_cycle_anchor: null,
                current_period_end: null,
                update: jest.fn().mockRejectedValue(new Error('write failed'))
            };
            const paymentRepository = {
                findTenantById: jest.fn().mockResolvedValue(tenant)
            };
            const useCase = buildUpgradeToPremiumUseCase({
                paymentRepository,
                paypalService: {
                    verifySubscription: jest.fn().mockResolvedValue({
                        status: 'ACTIVE',
                        billing_info: { next_billing_time: '2026-04-01T00:00:00Z' }
                    })
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-1',
                userId: 7,
                subscriptionId: 'I-UPGRADE-PERSIST',
                correlationId: 'req-upgrade-persist-fail'
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('INTERNAL_ERROR');
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'premium_upgrade_attempted',
                'premium_upgrade_failed'
            ]);

            const failedEvent = trackEngagementEvent.mock.calls[1][0];
            expect(failedEvent.metadata.failure_code).toBe('persistence_failed');
            expect(failedEvent.metadata.failure_reason).toBe('write failed');
        });
    });

    describe('handleWebhookUseCase', () => {
        const basePaymentRepository = () => ({
            findTenantBySubscriptionId: jest.fn(),
            runInTransaction: jest.fn().mockImplementation(async (callback) => callback({})),
            createPayment: jest.fn().mockResolvedValue(true),
            findWebhookLog: jest.fn().mockResolvedValue(null),
            findOrCreateWebhookLog: jest.fn().mockResolvedValue([
                { update: jest.fn().mockResolvedValue(true) }
            ])
        });

        const baseBody = (eventType, resource = {}, id = 'WH-1') => ({
            id,
            event_type: eventType,
            resource
        });

        const baseHeaders = {
            'paypal-transmission-id': 'tx-1'
        };

        it('records invalid signature attempts as telemetry', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const useCase = buildHandleWebhookUseCase({
                paymentRepository: basePaymentRepository(),
                paypalService: {
                    verifyWebhookSignature: jest.fn().mockResolvedValue(false)
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                body: baseBody('PAYMENT.SALE.COMPLETED'),
                headers: baseHeaders
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('AUTHENTICATION_FAILED');
            expect(getEventTypes(trackEngagementEvent)).toEqual(['paypal_webhook_invalid_signature']);
        });

        it('records duplicate webhook replays as ignored telemetry', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const paymentRepository = basePaymentRepository();
            paymentRepository.findWebhookLog.mockResolvedValue({ status: 'processed' });

            const useCase = buildHandleWebhookUseCase({
                paymentRepository,
                paypalService: {
                    verifyWebhookSignature: jest.fn().mockResolvedValue(true)
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                body: baseBody('PAYMENT.SALE.COMPLETED'),
                headers: baseHeaders
            });

            expect(result.success).toBe(true);
            expect(getEventTypes(trackEngagementEvent)).toEqual(['paypal_webhook_replayed']);
        });

        it('records unknown-tenant payment webhooks as ignored telemetry', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const paymentRepository = basePaymentRepository();
            paymentRepository.findTenantBySubscriptionId.mockResolvedValue(null);

            const useCase = buildHandleWebhookUseCase({
                paymentRepository,
                paypalService: {
                    verifyWebhookSignature: jest.fn().mockResolvedValue(true)
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                body: baseBody('PAYMENT.SALE.COMPLETED', {
                    id: 'TX-1',
                    billing_agreement_id: 'I-UNKNOWN',
                    amount: { total: '29.99', currency: 'USD' }
                }),
                headers: baseHeaders
            });

            expect(result.success).toBe(true);
            expect(getEventTypes(trackEngagementEvent)).toEqual(['paypal_payment_sale_ignored_unknown_tenant']);
        });

        it('records subscription activation telemetry for known tenants', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const tenant = {
                id: 'tenant-1',
                name: 'Acme',
                plan: 'standard',
                subscription_status: 'inactive',
                billing_cycle_anchor: null,
                update: jest.fn().mockResolvedValue(true),
                save: jest.fn().mockResolvedValue(true)
            };
            const paymentRepository = basePaymentRepository();
            paymentRepository.findTenantBySubscriptionId.mockResolvedValue(tenant);

            const useCase = buildHandleWebhookUseCase({
                paymentRepository,
                paypalService: {
                    verifyWebhookSignature: jest.fn().mockResolvedValue(true)
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                body: baseBody('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-ACTIVE-1' }),
                headers: baseHeaders
            });

            expect(result.success).toBe(true);
            expect(getEventTypes(trackEngagementEvent)).toEqual(['paypal_subscription_activated']);
        });

        it('records subscription cancellation telemetry for known tenants', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const tenant = {
                id: 'tenant-1',
                name: 'Acme',
                subscription_status: 'active',
                cancelled_at: null,
                save: jest.fn().mockResolvedValue(true)
            };
            const paymentRepository = basePaymentRepository();
            paymentRepository.findTenantBySubscriptionId.mockResolvedValue(tenant);

            const useCase = buildHandleWebhookUseCase({
                paymentRepository,
                paypalService: {
                    verifyWebhookSignature: jest.fn().mockResolvedValue(true)
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                body: baseBody('BILLING.SUBSCRIPTION.CANCELLED', { id: 'I-CANCEL-1' }),
                headers: baseHeaders
            });

            expect(result.success).toBe(true);
            expect(getEventTypes(trackEngagementEvent)).toEqual(['paypal_subscription_cancelled']);
        });

        it('records webhook processing failures with a terminal failed event', async () => {
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const tenant = {
                id: 'tenant-1',
                name: 'Acme',
                current_period_end: null,
                billing_cycle_anchor: null,
                plan: 'standard',
                subscription_status: 'inactive',
                save: jest.fn().mockResolvedValue(true)
            };
            const paymentRepository = basePaymentRepository();
            paymentRepository.findTenantBySubscriptionId.mockResolvedValue(tenant);
            paymentRepository.createPayment.mockRejectedValue(new Error('db explode'));

            const useCase = buildHandleWebhookUseCase({
                paymentRepository,
                paypalService: {
                    verifyWebhookSignature: jest.fn().mockResolvedValue(true)
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                body: baseBody('PAYMENT.SALE.COMPLETED', {
                    id: 'TX-1',
                    billing_agreement_id: 'I-FAIL-1',
                    amount: { total: '29.99', currency: 'USD' }
                }),
                headers: baseHeaders
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('INTERNAL_ERROR');
            expect(getEventTypes(trackEngagementEvent)).toEqual(['paypal_webhook_failed']);
        });
    });
});
