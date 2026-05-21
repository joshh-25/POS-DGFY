import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const readRoute = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('mode RBAC route contracts', () => {
  it('keeps Services capability denial before permission checks and uses switchable fallback', () => {
    const source = readRoute('src/routes/services.js');

    expect(source).toContain("router.use(requireWorkflowCapability('services', 'Services'))");
    expect(source).toContain('buildModePermissionRequirements(primary, fallback)');
    expect(source).toContain('checkAnyPermission');
    expect(source).not.toContain('checkPermission(');
    expect(source.indexOf("router.use(requireWorkflowCapability('services', 'Services'))"))
      .toBeLessThan(source.indexOf("router.get('/dashboard'"));
    expect(source).toContain('PERMISSIONS.SERVICES.actions.VIEW_BOOKINGS');
    expect(source).toContain('PERMISSIONS.POS.actions.VIEW_POS');
  });

  it('keeps F&B capability denial before permission checks and uses switchable fallback', () => {
    const source = readRoute('src/routes/fnb.js');

    expect(source).toContain("router.use(requireWorkflowCapability('fnbDining', 'Food & Beverage'))");
    expect(source).toContain('buildModePermissionRequirements(primary, fallback)');
    expect(source).toContain('checkAnyPermission');
    expect(source).not.toContain('checkPermission(');
    expect(source.indexOf("router.use(requireWorkflowCapability('fnbDining', 'Food & Beverage'))"))
      .toBeLessThan(source.indexOf("router.get('/dashboard'"));
    expect(source).toContain('PERMISSIONS.FNB.actions.MANAGE_CHECKS');
    expect(source).toContain('PERMISSIONS.POS.actions.TRANSACT_POS');
  });
});
