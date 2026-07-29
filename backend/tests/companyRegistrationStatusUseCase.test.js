import { toCompanyRegistrationPublicStatus } from '../src/modules/tenants/usecases/companyRegistrationStatusUseCase.js';

describe('company registration applicant status', () => {
  const application = (overrides = {}) => ({
    id: 'application-1', review_status: 'pending', provisioning_status: 'not_started', registration_email_snapshot: 'owner@example.test', createdAt: new Date('2026-07-28T00:00:00.000Z'),
    tenant: { id: 'tenant-private-id', name: 'Example Company', status: 'pending', rejection_reason: null, settings: { workflow_mode: 'retail' } },
    attempts: [{ submission_snapshot: { company_name: 'Example Company', workflow_mode: 'retail' } }],
    ...overrides
  });

  test('does not disclose the tenant identifier before provisioning succeeds', () => {
    const status = toCompanyRegistrationPublicStatus(application());
    expect(status).toMatchObject({ application_id: 'application-1', status: 'pending_review', registration_email_masked: 'ow***@example.test' });
    expect(status).not.toHaveProperty('tenant_id');
  });

  test('discloses the tenant identifier only for the explicit ready continuation', () => {
    const status = toCompanyRegistrationPublicStatus(application({ review_status: 'approved', provisioning_status: 'succeeded' }));
    expect(status).toMatchObject({ status: 'ready', tenant_id: 'tenant-private-id' });
  });
});
