import {
  buildGeneralAuditLogPayload,
  calculateFolioTotals,
  mapHospitalityAuditAction
} from '../src/modules/hospitality/repositories/hospitalityRepository.js';

describe('Hospitality folio totals', () => {
  it('treats refunds as payment reversals instead of extra payments', () => {
    const totals = calculateFolioTotals([
      { line_type: 'room_charge', total_amount: 5000 },
      { line_type: 'payment', total_amount: 3000 },
      { line_type: 'deposit', total_amount: 1000 },
      { line_type: 'refund', total_amount: 500 }
    ]);

    expect(totals).toEqual({
      charges: 5000,
      payments: 3500,
      balance: 1500
    });
  });
});

describe('Hospitality audit bridge', () => {
  it('maps domain audit actions into existing audit_logs enum values', () => {
    expect(mapHospitalityAuditAction('create')).toBe('CREATE');
    expect(mapHospitalityAuditAction('status:confirmed->checked_in')).toBe('UPDATE');
    expect(mapHospitalityAuditAction('line:refund')).toBe('UPDATE');
    expect(mapHospitalityAuditAction('void')).toBe('DELETE');
  });

  it('keeps Hospitality domain details visible in the existing audit log shape', () => {
    const payload = buildGeneralAuditLogPayload({
      entity_type: 'reservation',
      entity_id: 101,
      action: 'status:confirmed->checked_in',
      actor_user_id: 7,
      before_snapshot: { status: 'confirmed' },
      after_snapshot: { status: 'checked_in' },
      metadata: {
        request_id: 'req-1',
        ip_address: '127.0.0.1',
        user_agent: 'vitest'
      }
    });

    expect(payload).toMatchObject({
      user_id: 7,
      entity_type: 'hospitality:reservation',
      entity_id: 101,
      action: 'UPDATE',
      ip_address: '127.0.0.1',
      user_agent: 'vitest',
      changes: {
        hospitality_action: 'status:confirmed->checked_in',
        before: { status: 'confirmed' },
        after: { status: 'checked_in' },
        metadata: expect.objectContaining({ request_id: 'req-1' })
      }
    });
  });
});
