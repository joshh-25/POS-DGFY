import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const useCaseSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/pos/usecases/mobilePosUseCases.js'),
  'utf8'
);
const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../src/routes/mobilePos.js'),
  'utf8'
);

describe('mobile POS settings bootstrap contract', () => {
  it('exposes only the operational settings needed by a POS terminal', () => {
    expect(useCaseSource).toContain("'store_tenant_slug'");
    expect(useCaseSource).toContain("'pos_petty_cash_symbol'");
    expect(useCaseSource).toContain("'pos_petty_cash_amount'");
    expect(useCaseSource).toContain("'pos_hardware_profile'");
    expect(useCaseSource).toContain('settings: pickSettings(settings)');
    expect(useCaseSource).not.toContain("'smtp_password'");
    expect(useCaseSource).not.toContain("'paymongo_secret_key'");
  });

  it('requires POS visibility rather than settings administration', () => {
    expect(routeSource).toContain("router.get('/bootstrap/settings'");
    expect(routeSource).toContain('checkPermission(PERMISSIONS.POS.actions.VIEW_POS)');
  });
});
