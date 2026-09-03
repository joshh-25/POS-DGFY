import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// #1451 (Phase 254): the shared route-authorization sweep. Consolidates the source-text route
// contracts that were previously one file per route module -- each `describe` block below is a
// verbatim carry-over from its own source file (same title, same assertions), grouped here so the
// "grep a route file for its authorization middleware" pattern has one home instead of N.

describe('item category route contract', () => {
  const routeSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/items.js'), 'utf8');

  it('keeps category mutation endpoints behind tenant-admin authorization', () => {
    expect(routeSource).toContain('requireTenantAdmin');
    expect(routeSource).toContain("router.post('/folders', requireTenantAdmin, validateCreateFolder, itemController.createFolder);");
    expect(routeSource).toContain("router.patch('/folders/:folder_id', requireTenantAdmin, validateFolderIdParam, validateUpdateFolder, itemController.updateFolder);");
    expect(routeSource).toContain("router.delete('/folders/:folder_id', requireTenantAdmin, validateFolderIdParam, validateDeleteFolder, itemController.deleteFolder);");
  });
});

describe('admin assisted provisioning route contracts', () => {
  const routeSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/adminTenants.js'), 'utf8');

  it('registers assisted provisioning and handover routes behind platform admin auth', () => {
    expect(routeSource).toContain("router.post('/admin-provision', authenticateAdmin, createAdminProvisionedTenant)");
    expect(routeSource).toContain("router.post('/admin-provision-with-account', authenticateAdmin, createAdminProvisionedAccountAndTenant)");
    expect(routeSource).toContain("router.post('/:id/owner', authenticateAdmin, assignTenantOwnerByAdmin)");
  });

  it('keeps public company registration on the DGFY-authenticated registration route', () => {
    expect(routeSource).toContain("router.post('/register', tenantRegistrationLimiter, authenticateDgfyAccount, registerCompanyRequest)");
  });
});

describe('POS setup cashier route', () => {
  // #1451: replaces posSetupCashierRoute.transport.test.js, which booted the full app via
  // supertest + src/server.js to prove only that these two routes are mounted (not 404). Same
  // fact, proved as a source-text assertion against the route table instead of a server boot.
  const routeSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/pos.js'), 'utf8');

  it('mounts the POS setup cashier routes', () => {
    expect(routeSource).toContain("router.get('/setup/cashiers', checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), posController.listSetupCashiers);");
    expect(routeSource).toContain("router.post('/setup/cashiers', checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateSetupCashier, posController.createSetupCashier);");
  });
});
