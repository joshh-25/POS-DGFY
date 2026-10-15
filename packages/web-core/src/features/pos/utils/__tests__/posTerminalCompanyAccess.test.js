import { describe, expect, it } from 'vitest';
import { normalizeAccessibleCompanies } from '../posTerminalCompanyAccess.js';

describe('POS terminal company access', () => {
  it('keeps only active switchable companies in the unlock selector', () => {
    expect(normalizeAccessibleCompanies({
      companies: [
        { tenant_id: 'masu', company_name: 'Masu Cafe', can_switch: true },
        { tenant_id: 'pending', company_name: 'Pending Company', can_switch: false },
        { tenant_id: 'removed', company_name: 'Removed Company', can_switch: false }
      ]
    })).toEqual([
      { tenant_id: 'masu', company_name: 'Masu Cafe', can_switch: true }
    ]);
  });
});
