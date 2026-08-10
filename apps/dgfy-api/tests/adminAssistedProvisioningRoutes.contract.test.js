import fs from 'fs';
import path from 'path';

const routeSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/routes/adminTenants.js'),
  'utf8'
);

describe('admin assisted provisioning route contracts', () => {
  it('registers assisted provisioning and handover routes behind platform admin auth', () => {
    expect(routeSource).toContain("router.post('/admin-provision', authenticateAdmin, createAdminProvisionedTenant)");
    expect(routeSource).toContain("router.post('/admin-provision-with-account', authenticateAdmin, createAdminProvisionedAccountAndTenant)");
    expect(routeSource).toContain("router.post('/:id/owner', authenticateAdmin, assignTenantOwnerByAdmin)");
  });

  it('keeps public company registration on the DGFY-authenticated registration route', () => {
    expect(routeSource).toContain("router.post('/register', tenantRegistrationLimiter, authenticateDgfyAccount, registerCompanyRequest)");
  });
});
