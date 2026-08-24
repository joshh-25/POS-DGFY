import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { filterPosTerminalRegistryByLocationIds } from '../src/modules/pos/usecases/mobilePosUseCases.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const useCaseSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/pos/usecases/mobilePosUseCases.js'),
  'utf8'
);
const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../src/routes/mobilePos.js'),
  'utf8'
);
const handlerSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/pos/controllers/mobilePosHandlers.js'),
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

  it('passes the authenticated POS user into the settings bootstrap for terminal scoping', () => {
    expect(useCaseSource).toContain('getGrantedLocationIdsForUser(user)');
    expect(handlerSource).toContain('getMobilePosSettingsBootstrapUseCase({ user: req.user })');
  });

  it('keeps only terminals assigned to the cashier allowed locations', () => {
    const settings = {
      pos_terminal_registry: {
        value: [
          { terminal_id: 'COUNTER-01', location_id: 1, is_active: true },
          { terminal_id: 'COUNTER-02', location_id: 2, is_active: true },
          { terminal_id: 'KIOSK-01', location_id: null, is_active: true }
        ]
      }
    };

    const scoped = filterPosTerminalRegistryByLocationIds(settings, [2]);

    expect(scoped.pos_terminal_registry.value).toEqual([
      { terminal_id: 'COUNTER-02', location_id: 2, is_active: true }
    ]);
  });

  it('does not mutate the original settings payload while scoping terminals', () => {
    const settings = {
      pos_terminal_registry: {
        value: [{ terminal_id: 'COUNTER-01', location_id: 1 }]
      }
    };

    filterPosTerminalRegistryByLocationIds(settings, []);

    expect(settings.pos_terminal_registry.value).toHaveLength(1);
  });
});
