import {
  buildLegacyRoleRemapPlan,
  DEFAULT_ROLE_PRESET_MAPPING
} from '../scripts/audit-mode-rbac-users.js';

describe('mode RBAC legacy user remediation plan', () => {
  it('maps safe legacy roles to the active F&B role presets', () => {
    const plan = buildLegacyRoleRemapPlan({
      workflowMode: 'fnb',
      users: [
        { user_id: 1, username: 'admin', role: 'admin', permissions: [] },
        { user_id: 2, username: 'manager', role: 'manager', permissions: [] },
        { user_id: 3, username: 'cashier', role: 'cashier', permissions: [] }
      ]
    });

    expect(plan.map((entry) => entry.status)).toEqual(['ready', 'ready', 'ready']);
    expect(plan.map((entry) => entry.to.role_preset_key)).toEqual([
      'fnb_admin',
      'fnb_restaurant_manager',
      'fnb_cashier'
    ]);
  });

  it('does not guess ambiguous roles or remap master admins', () => {
    const plan = buildLegacyRoleRemapPlan({
      workflowMode: 'hospitality',
      users: [
        { user_id: 4, username: 'staff', role: 'staff', permissions: [] },
        { user_id: 5, username: 'owner', role: 'admin', is_master_admin: true, permissions: [] }
      ]
    });

    expect(plan.map((entry) => entry.status)).toEqual([
      'needs_manual_mapping',
      'skipped_master_admin'
    ]);
  });

  it('reports a supplied mapping that is not valid for the mode', () => {
    const plan = buildLegacyRoleRemapPlan({
      workflowMode: 'fnb',
      mapping: { fnb: { cashier: 'not_a_real_preset' } },
      users: [{ user_id: 6, username: 'cashier', role: 'cashier', permissions: [] }]
    });

    expect(plan).toEqual([expect.objectContaining({
      status: 'invalid_mapping',
      preset_key: 'not_a_real_preset'
    })]);
  });

  it('keeps the built-in mapping immutable', () => {
    expect(DEFAULT_ROLE_PRESET_MAPPING.fnb.cashier).toBe('fnb_cashier');
  });
});
