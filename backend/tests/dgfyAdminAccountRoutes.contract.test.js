import fs from 'fs';
import path from 'path';

const routeSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/routes/dgfy.js'),
  'utf8'
);

describe('DGFY admin account route contracts', () => {
  it('registers all platform-admin account routes behind authenticateAdmin', () => {
    expect(routeSource).toContain("router.get('/admin/accounts', authenticateAdmin, listAdminDgfyAccounts)");
    expect(routeSource).toContain("router.get('/admin/accounts/:account_id', authenticateAdmin, getAdminDgfyAccount)");
    expect(routeSource).toContain("router.patch('/admin/accounts/:account_id/profile', authenticateAdmin, updateAdminDgfyAccountProfile)");
    expect(routeSource).toContain("router.post('/admin/accounts/:account_id/suspend', authenticateAdmin, suspendAdminDgfyAccount)");
    expect(routeSource).toContain("router.post('/admin/accounts/:account_id/reactivate', authenticateAdmin, reactivateAdminDgfyAccount)");
  });
});
