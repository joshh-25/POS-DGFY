import { jest } from '@jest/globals';
import { buildRecordComplianceSecuritySignalUseCase } from '../src/modules/compliance/usecases/complianceUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('record compliance security signal usecase', () => {
    const originalNotifyChannel = process.env.COMPLIANCE_INCIDENT_NOTIFY_CHANNEL;
    const originalNotifyStrict = process.env.COMPLIANCE_INCIDENT_NOTIFY_STRICT;
    const originalNotifySimulate = process.env.COMPLIANCE_INCIDENT_NOTIFY_SIMULATE;
    const originalIncidentEmailTo = process.env.COMPLIANCE_INCIDENT_EMAIL_TO;
    const originalIncidentWebhookUrl = process.env.COMPLIANCE_INCIDENT_WEBHOOK_URL;

    const buildRepository = () => ({
        createAuditLog: jest.fn().mockResolvedValue({ id: 10 }),
        createAuditFailureLog: jest.fn().mockResolvedValue({ id: 11 })
    });

    afterEach(() => {
        process.env.COMPLIANCE_INCIDENT_NOTIFY_CHANNEL = originalNotifyChannel;
        process.env.COMPLIANCE_INCIDENT_NOTIFY_STRICT = originalNotifyStrict;
        process.env.COMPLIANCE_INCIDENT_NOTIFY_SIMULATE = originalNotifySimulate;
        process.env.COMPLIANCE_INCIDENT_EMAIL_TO = originalIncidentEmailTo;
        process.env.COMPLIANCE_INCIDENT_WEBHOOK_URL = originalIncidentWebhookUrl;
    });

    it('returns TENANT_CONTEXT_MISSING when tenantId is absent', async () => {
        const useCase = buildRecordComplianceSecuritySignalUseCase({
            complianceRepository: buildRepository(),
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: null,
            signalCode: 'mass_export_threshold_reached'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.TENANT_CONTEXT_MISSING);
        expect(result.error.statusCode).toBe(400);
    });

    it('records immutable security signal audit log for valid inputs', async () => {
        const complianceRepository = buildRepository();
        const useCase = buildRecordComplianceSecuritySignalUseCase({
            complianceRepository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            signalCode: 'mass_export_threshold_reached',
            severity: 'warning',
            metadata: {
                export_type: 'csv:executive_summary',
                exported_rows: 1200
            },
            actorUser: { user_id: 7 }
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            recorded: true,
            signal_code: 'mass_export_threshold_reached',
            severity: 'warning'
        });
        expect(result.data.incident_id).toEqual(expect.stringMatching(/^sig-mass_export_threshold_reached-/));
        expect(result.data.incident_status).toBe('new');
        expect(result.data.audit_persistence).toBe('primary');
        expect(result.data.dispatch_attempt).toEqual(expect.objectContaining({
            channel: 'audit_only',
            delivery_status: 'recorded',
            audit_persistence: 'primary'
        }));

        expect(complianceRepository.createAuditLog).toHaveBeenNthCalledWith(1, expect.objectContaining({
            tenant_id: 'tenant-1',
            event_type: 'security_signal',
            operation: 'security.mass_export_threshold_reached',
            reason_code: 'MASS_EXPORT_THRESHOLD_REACHED',
            actor_user_id: 7,
            metadata: expect.objectContaining({
                severity: 'warning',
                export_type: 'csv:executive_summary',
                exported_rows: 1200
            })
        }), expect.any(Object));
        expect(complianceRepository.createAuditLog).toHaveBeenNthCalledWith(2, expect.objectContaining({
            tenant_id: 'tenant-1',
            event_type: 'security_signal',
            operation: 'security.incident_notify_attempt',
            reason_code: 'SECURITY_INCIDENT_NOTIFY_ATTEMPT',
            actor_user_id: 7,
            metadata: expect.objectContaining({
                incident_id: result.data.incident_id,
                incident_status: 'new',
                signal_code: 'mass_export_threshold_reached',
                delivery_status: 'recorded'
            })
        }), expect.any(Object));
    });

    it('INC-01 marks dispatch attempt as failed in strict mode when email target is missing', async () => {
        process.env.COMPLIANCE_INCIDENT_NOTIFY_CHANNEL = 'email';
        process.env.COMPLIANCE_INCIDENT_NOTIFY_STRICT = 'true';
        process.env.COMPLIANCE_INCIDENT_EMAIL_TO = '';
        process.env.COMPLIANCE_INCIDENT_NOTIFY_SIMULATE = '';

        const complianceRepository = buildRepository();
        const useCase = buildRecordComplianceSecuritySignalUseCase({
            complianceRepository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            signalCode: 'mass_export_threshold_reached'
        });

        expect(result.success).toBe(true);
        expect(result.data.dispatch_attempt).toEqual(expect.objectContaining({
            channel: 'email',
            delivery_status: 'failed',
            error: 'email_target_missing',
            target_configured: false
        }));
    });

    it('INC-01 marks dispatch attempt as sent when webhook target is configured', async () => {
        process.env.COMPLIANCE_INCIDENT_NOTIFY_CHANNEL = 'webhook';
        process.env.COMPLIANCE_INCIDENT_NOTIFY_STRICT = 'true';
        process.env.COMPLIANCE_INCIDENT_WEBHOOK_URL = 'https://example.test/security-hook';
        process.env.COMPLIANCE_INCIDENT_NOTIFY_SIMULATE = 'sent';

        const complianceRepository = buildRepository();
        const useCase = buildRecordComplianceSecuritySignalUseCase({
            complianceRepository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            signalCode: 'mass_export_threshold_reached'
        });

        expect(result.success).toBe(true);
        expect(result.data.dispatch_attempt).toEqual(expect.objectContaining({
            channel: 'webhook',
            delivery_status: 'sent',
            error: null,
            target_configured: true,
            dispatch_reference: 'webhook:https://example.test/security-hook'
        }));
    });
});
