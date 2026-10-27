import { describe, expect, it } from 'vitest';
import {
    categorizeComplianceAuditEvent,
    countComplianceAuditCategories,
    countComplianceReviewStatuses,
    filterComplianceAuditLogs,
    filterComplianceRecords,
    getComplianceSectionProgress,
    normalizeVerificationStatus,
    summarizeSecurityIncidents
} from '../compliancePresentation.js';

describe('tenant compliance presentation', () => {
    it('normalizes unknown and pending review statuses without treating them as verified', () => {
        expect(normalizeVerificationStatus(null)).toBe('needs_review');
        expect(normalizeVerificationStatus(' Pending_Review ')).toBe('needs_review');
        expect(normalizeVerificationStatus('for_review')).toBe('needs_review');
        expect(normalizeVerificationStatus('verified')).toBe('verified');
        expect(normalizeVerificationStatus('unknown')).toBe('unknown');
    });

    it('counts and filters artifact and peripheral review states together', () => {
        const artifacts = [{ verification_status: 'pending' }, { verification_status: 'verified' }];
        const peripherals = [{ verification_status: '' }, { verification_status: 'revoked' }];
        expect(countComplianceReviewStatuses(artifacts, peripherals)).toEqual({
            needs_review: 2, verified: 1, rejected: 0, revoked: 1, all: 4
        });
        expect(filterComplianceRecords(artifacts, 'needs_review')).toEqual([artifacts[0]]);
        expect(filterComplianceRecords(peripherals, 'all')).toEqual(peripherals);
    });

    it('projects known checklist sections and categorizes audit events', () => {
        expect(getComplianceSectionProgress({
            profile: { status: 'complete', complete: 3, total: 3 },
            artifacts: { status: 'blocked', complete: 1, total: 2 },
            future_section: { status: 'complete', complete: 1, total: 1 }
        })).toEqual([
            { key: 'profile', label: 'Profile', status: 'complete', complete: 3, total: 3 },
            { key: 'artifacts', label: 'Artifacts', status: 'blocked', complete: 1, total: 2 }
        ]);
        expect(categorizeComplianceAuditEvent('artifact_verification')).toBe('verification');
        expect(categorizeComplianceAuditEvent('security_signal')).toBe('security');
        expect(categorizeComplianceAuditEvent('blocked_operation')).toBe('blocked');
        expect(categorizeComplianceAuditEvent('mode_upgrade')).toBe('lifecycle');
        const logs = [{ event_type: 'artifact_verification' }, { event_type: 'security_signal' }, { event_type: 'other' }];
        expect(countComplianceAuditCategories(logs)).toEqual({ all: 3, verification: 1, security: 1, blocked: 0, lifecycle: 0 });
        expect(filterComplianceAuditLogs(logs, 'security')).toEqual([logs[1]]);
    });

    it('summarizes incidents while counting acknowledged items as still open', () => {
        expect(summarizeSecurityIncidents([
            { status: 'new' }, { status: 'acknowledged' }, { status: 'resolved' }
        ])).toEqual({ open: 2, acknowledged: 1, resolved: 1 });
    });
});
