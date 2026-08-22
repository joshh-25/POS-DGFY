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

    expect(source).toContain("toast.success('Registration submitted for approval.')");
    expect(source).toContain('registrationData.application_id');
    expect(source).toContain('buildBusinessRegistrationSubmissionPath(registrationData.application_id)');
    expect(source).not.toContain('window.location.assign(resolveSkupervisorUrl(`/register-company/status/${registrationData.application_id}`))');
    expect(source).not.toContain('Proceed to POS');
    expect(source).not.toContain('startDgfyTenantSession');
  });
});
