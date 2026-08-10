import { jest } from '@jest/globals';
import {
    buildListComplianceSecurityIncidentsUseCase,
    buildUpdateComplianceSecurityIncidentStatusUseCase
} from '../src/modules/compliance/usecases/complianceUseCases.js';

describe('compliance security incidents usecases', () => {
    const buildRepository = (logs = []) => ({
        listAuditLogsByTenantId: jest.fn().mockResolvedValue(logs),
        createAuditLog: jest.fn().mockResolvedValue({
            tenant_compliance_audit_log_id: 101
        }),
        createAuditFailureLog: jest.fn().mockResolvedValue({
            tenant_compliance_audit_failure_id: 202
        })
    });

    it('aggregates security incidents with deterministic counts', async () => {
        const repository = buildRepository([
            {
                tenant_compliance_audit_log_id: 1,
                tenant_id: 'tenant-a',
                event_type: 'security_signal',
                operation: 'security.mass_export_threshold_reached',
                reason_code: 'MASS_EXPORT_THRESHOLD_REACHED',
                metadata: {
                    incident_id: 'sig-001',
                    incident_status: 'new',
                    signal_code: 'mass_export_threshold_reached',
                    severity: 'warning'
                },
                created_at: '2026-04-08T00:00:00.000Z'
            },
            {
                tenant_compliance_audit_log_id: 2,
                tenant_id: 'tenant-a',
                event_type: 'security_signal',
                operation: 'security.incident_acknowledged',
                reason_code: 'SECURITY_INCIDENT_ACKNOWLEDGED',
                metadata: {
                    incident_id: 'sig-001',
                    incident_status: 'acknowledged',
                    signal_code: 'mass_export_threshold_reached',
                    severity: 'warning',
                    note: 'Triaged by compliance lead'
                },
                created_at: '2026-04-08T01:00:00.000Z'
            },
            {
                tenant_compliance_audit_log_id: 21,
                tenant_id: 'tenant-a',
                event_type: 'security_signal',
                operation: 'security.incident_notify_attempt',
                reason_code: 'SECURITY_INCIDENT_NOTIFY_ATTEMPT',
                metadata: {
                    incident_id: 'sig-001',
                    incident_status: 'acknowledged',
                    signal_code: 'mass_export_threshold_reached',
                    severity: 'warning',
                    channel: 'email',
                    delivery_status: 'queued',
                    attempted_at: '2026-04-08T01:05:00.000Z'
                },
                created_at: '2026-04-08T01:05:00.000Z'
            },
            {
                tenant_compliance_audit_log_id: 3,
                tenant_id: 'tenant-a',
                event_type: 'security_signal',
                operation: 'security.login_anomaly',
                reason_code: 'LOGIN_ANOMALY',
                metadata: {
                    incident_id: 'sig-002',
                    incident_status: 'resolved',
                    signal_code: 'login_anomaly',
                    severity: 'critical'
                },
                created_at: '2026-04-08T02:00:00.000Z'
            }
        ]);

        const useCase = buildListComplianceSecurityIncidentsUseCase({
            complianceRepository: repository
        });

        const result = await useCase({ tenantId: 'tenant-a', limit: 200 });
        expect(result.success).toBe(true);
        expect(result.data.counts).toEqual({
            total: 2,
            requires_action: 1,
            new: 0,
            acknowledged: 1,
            resolved: 1
        });
        expect(result.data.incidents[0]).toEqual(expect.objectContaining({
            incident_id: 'sig-002',
            status: 'resolved',
            severity: 'critical'
        }));
        const acknowledged = result.data.incidents.find((entry) => entry.incident_id === 'sig-001');
        expect(acknowledged).toEqual(expect.objectContaining({
            status: 'acknowledged',
            dispatch: expect.objectContaining({
                channel: 'email',
                delivery_status: 'queued',
                attempted_at: '2026-04-08T01:05:00.000Z',
                target_configured: false
            })
        }));
    });

    it('appends immutable audit event when acknowledging incident', async () => {
        const repository = buildRepository([
            {
                tenant_compliance_audit_log_id: 11,
                tenant_id: 'tenant-a',
                event_type: 'security_signal',
                operation: 'security.mass_export_threshold_reached',
                reason_code: 'MASS_EXPORT_THRESHOLD_REACHED',
                metadata: {
                    incident_id: 'sig-ack-1',
                    incident_status: 'new',
                    signal_code: 'mass_export_threshold_reached',
                    severity: 'warning'
                },
                created_at: '2026-04-08T00:00:00.000Z'
            }
        ]);

        const listUseCase = buildListComplianceSecurityIncidentsUseCase({
            complianceRepository: repository
        });
        const updateUseCase = buildUpdateComplianceSecurityIncidentStatusUseCase({
            complianceRepository: repository,
            listComplianceSecurityIncidentsUseCase: async (params) => listUseCase(params),
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await updateUseCase({
            tenantId: 'tenant-a',
            incidentId: 'sig-ack-1',
            status: 'acknowledged',
            actorUser: {
                is_platform_admin: true,
                user_id: 77
            },
            note: 'Reviewed and under investigation',
            evidenceRef: 'SEC-INC-77'
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            incident_id: 'sig-ack-1',
            status: 'acknowledged',
            dispatch: expect.objectContaining({
                channel: 'audit_only',
                delivery_status: 'recorded',
                target_configured: true
            }),
            dispatch_attempt_append_result: 'primary',
            unchanged: false
        }));
        expect(repository.createAuditLog).toHaveBeenNthCalledWith(1, expect.objectContaining({
            tenant_id: 'tenant-a',
            event_type: 'security_signal',
            operation: 'security.incident_acknowledged',
            actor_user_id: 77,
            metadata: expect.objectContaining({
                incident_id: 'sig-ack-1',
                incident_status: 'acknowledged',
                note: 'Reviewed and under investigation',
                evidence_ref: 'SEC-INC-77'
            })
        }), expect.any(Object));
        expect(repository.createAuditLog).toHaveBeenNthCalledWith(2, expect.objectContaining({
            tenant_id: 'tenant-a',
            event_type: 'security_signal',
            operation: 'security.incident_notify_attempt',
            actor_user_id: 77,
            metadata: expect.objectContaining({
                incident_id: 'sig-ack-1',
                incident_status: 'acknowledged',
                delivery_status: 'recorded'
            })
        }), expect.any(Object));
    });
});
