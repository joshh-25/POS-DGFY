import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tenantManagerPath = path.resolve(__dirname, '../../../Pages/admin/TenantManager.jsx');

describe('TenantManager compliance review contracts', () => {
  let tenantManagerContent = '';

  beforeAll(() => {
    tenantManagerContent = fs.readFileSync(tenantManagerPath, 'utf8');
  });

  it('normalizes pending review statuses into a canonical needs_review queue', () => {
    expect(tenantManagerContent).toContain("const normalizeVerificationStatus = (value) => {");
    expect(tenantManagerContent).toContain("['pending', 'pending_review', 'needs_review', 'for_review'].includes(normalized)");
    expect(tenantManagerContent).toContain("if (!normalized) return 'needs_review';");
  });

  it('keeps review filters explicit and count-aware for queue triage', () => {
    expect(tenantManagerContent).toContain('const COMPLIANCE_REVIEW_FILTERS = [');
    expect(tenantManagerContent).toContain('Review queue: {complianceFilterCounts.needs_review} pending decision');
    expect(tenantManagerContent).toContain('{entry.label} ({complianceFilterCounts[entry.value] || 0})');
  });

  it('surfaces checklist section progress in admin compliance modal', () => {
    expect(tenantManagerContent).toContain('const complianceSectionProgressEntries = useMemo(() => {');
    expect(tenantManagerContent).toContain('complianceChecklist?.section_progress');
    expect(tenantManagerContent).toContain('Activation readiness: {complianceChecklist.ready_for_compliant_activation ? \'Ready\' : \'Blocked\'}');
    expect(tenantManagerContent).toContain('sectionProgressBadgeClass(entry.status)');
  });

  it('renders normalized verification badges for artifacts and peripherals', () => {
    expect(tenantManagerContent).toContain('verificationStatusBadgeClass(normalizedStatus)');
    expect(tenantManagerContent).toContain('const normalizedStatus = normalizeVerificationStatus(artifact.verification_status);');
    expect(tenantManagerContent).toContain('const normalizedStatus = normalizeVerificationStatus(peripheral.verification_status);');
  });

  it('loads and filters tenant compliance audit logs in the review modal', () => {
    expect(tenantManagerContent).toContain('adminService.listTenantComplianceAuditLogs(tenantId, { limit: 120 })');
    expect(tenantManagerContent).toContain('const COMPLIANCE_AUDIT_FILTERS = [');
    expect(tenantManagerContent).toContain('const complianceAuditFilterCounts = useMemo(() => {');
    expect(tenantManagerContent).toContain('Audit Trail Evidence');
  });

  it('renders security incident dispatch status in the admin workflow panel', () => {
    expect(tenantManagerContent).toContain('Dispatch: {incident.dispatch.delivery_status || \'recorded\'}');
    expect(tenantManagerContent).toContain('incident.dispatch.channel ? ` via ${incident.dispatch.channel}` : \'\'');
    expect(tenantManagerContent).toContain('Dispatch target is not configured for this channel.');
    expect(tenantManagerContent).toContain('Dispatch reference: {incident.dispatch.dispatch_reference}');
    expect(tenantManagerContent).toContain('Dispatch error: {incident.dispatch.error}');
  });
});
