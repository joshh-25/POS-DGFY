import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

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
    expect(source).toContain("router.get('/option-groups', modePermission(PERMISSIONS.SERVICES.actions.VIEW_CATALOG");
    expect(source).toContain("router.post('/option-groups', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_CATALOG");
    expect(source).toContain("router.put('/catalog/:itemId/option-groups', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_CATALOG");
    expect(source).not.toContain('PERMISSIONS.SERVICES.actions.VIEW_SERVICES');
    expect(source).not.toContain('PERMISSIONS.SERVICES.actions.MANAGE_SERVICES');
  });

  it('keeps F&B capability denial before permission checks and uses switchable fallback', () => {
    const source = readRoute('src/routes/fnb.js');

    // The `/fnb` router used to blanket-gate all 26 endpoints with a single
    // `router.use(requireWorkflowCapability('fnbDining', ...))`, which is what
    // kept add-on management restaurant-only. Gating is now per-route so the
    // four modifier endpoints can sit behind `menuModifiers` instead. The
    // contract this test protects is unchanged: capability denial still runs
    // before any permission check, on every route.
    expect(source).toContain("const requireFnbDining = requireWorkflowCapability('fnbDining', 'Food & Beverage')");
    expect(source).toContain("const requireMenuModifiers = requireWorkflowCapability('menuModifiers', 'Menu Modifiers')");
    expect(source).not.toContain('router.use(requireWorkflowCapability(');
    expect(source).toContain('buildModePermissionRequirements(primary, fallback)');
    expect(source).toContain('checkAnyPermission');
    expect(source).not.toContain('checkPermission(');
    expect(source).toContain('PERMISSIONS.FNB.actions.MANAGE_CHECKS');
    expect(source).toContain('PERMISSIONS.POS.actions.TRANSACT_POS');

    const routeLines = source
      .split('\n')
      .filter((line) => /^router\.(get|post|put|patch|delete)\(/.test(line.trim()));

    // Every endpoint carries a capability guard, and it precedes modePermission.
    expect(routeLines).toHaveLength(27);
    routeLines.forEach((line) => {
      const guard = line.includes('requireMenuModifiers') ? 'requireMenuModifiers' : 'requireFnbDining';
      expect(line).toContain(guard);
      expect(line.indexOf(guard)).toBeLessThan(line.indexOf('modePermission('));
    });

    // Exactly the five modifier-management endpoints are de-gated from fnbDining.
    const modifierRoutes = routeLines.filter((line) => line.includes('requireMenuModifiers'));
    expect(modifierRoutes).toHaveLength(5);
    expect(modifierRoutes.every((line) => /'\/(item-)?modifier-groups/.test(line))).toBe(true);
  });
});
