import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const sourcePath = path.resolve(
  process.cwd(),
  'src/business/pages/StorefrontBusinessGrowPage.jsx'
);

describe('storefront business registration approval handoff', () => {
  it('routes a submitted application to the in-app confirmation page instead of POS', () => {
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("const statusReference = registrationData.application_id || registrationData.registration_id;");
    expect(source).toContain("toast.success(autoApproved");
    expect(source).toContain('buildBusinessRegistrationSubmissionPath(statusReference, { autoApproved })');
    expect(source).toContain('state: autoApproved ? { autoApproved: true } : undefined');
    expect(source).not.toContain('window.location.assign(resolveSkupervisorUrl(`/register-company/status/${registrationData.application_id}`))');
    expect(source).not.toContain('Proceed to POS');
    expect(source).not.toContain('startDgfyTenantSession');
  });
});
