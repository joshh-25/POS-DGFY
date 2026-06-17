import { describe, expect, it } from 'vitest';
import {
  buildCurrentCompanyFromUser,
  mergeCurrentCompanyWithMemberships
} from '../companySwitcherRows.js';

const user = {
  user_id: 7,
  role: 'admin',
  company: {
    id: 'tenant-current',
    name: 'Current Tenant',
    plan: 'premium'
  }
};

describe('companySwitcherRows', () => {
  it('builds a current company row from the authenticated IMS user', () => {
    expect(buildCurrentCompanyFromUser(user)).toEqual(expect.objectContaining({
      membership_id: 'current-ims-session',
      tenant_id: 'tenant-current',
      tenant_user_id: 7,
      company_name: 'Current Tenant',
      role: 'admin',
      source: 'ims_session',
      is_current: true,
      can_switch: false
    }));
  });

  it('keeps the current company visible when no DGFY memberships are available', () => {
    const rows = mergeCurrentCompanyWithMemberships(user, []);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      company_name: 'Current Tenant',
      is_current: true,
      can_switch: false
    }));
  });

  it('prepends the current company when DGFY memberships only contain other companies', () => {
    const rows = mergeCurrentCompanyWithMemberships(user, [{
      membership_id: 10,
      tenant_id: 'tenant-other',
      company_name: 'Other Tenant',
      role: 'staff',
      can_switch: true
    }]);

    expect(rows.map((row) => row.company_name)).toEqual(['Current Tenant', 'Other Tenant']);
    expect(rows[0].is_current).toBe(true);
    expect(rows[1].can_switch).toBe(true);
  });

  it('normalizes an existing current membership row instead of duplicating it', () => {
    const rows = mergeCurrentCompanyWithMemberships(user, [{
      membership_id: 12,
      tenant_id: 'tenant-current',
      company_name: '',
      role: '',
      plan: '',
      can_switch: true
    }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      tenant_id: 'tenant-current',
      company_name: 'Current Tenant',
      role: 'admin',
      plan: 'premium',
      is_current: true,
      can_switch: false
    }));
  });
});
