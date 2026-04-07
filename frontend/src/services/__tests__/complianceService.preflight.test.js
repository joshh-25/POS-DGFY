import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPost = vi.fn();

vi.mock('../api.js', () => ({
  default: {
    get: vi.fn(),
    post: mockPost
  }
}));

describe('complianceService preflight contract', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('posts preflight payload and returns unwrapped data', async () => {
    const payload = {
      request_name: 'POS hardening task',
      surfaces: ['compliance'],
      impact_declaration: {
        declaration_id: '2026-04-07-preflight-contract',
        classification: 'major',
        summary: 'Validate preflight result handling',
        affected_surfaces: ['compliance'],
        reason_codes_impacted: ['IMPACT_DECLARATION_REQUIRED'],
        policy_version: '2026.04.07',
        verification_evidence: ['npm run check:compliance'],
        rollback_note: 'Revert flow if result parsing regresses.'
      }
    };

    const expectedData = {
      result: 'review_required',
      can_proceed: false,
      reason_code: 'COMPLIANCE_PROFILE_INCOMPLETE',
      required_actions: ['Complete required controls.']
    };

    mockPost.mockResolvedValueOnce({ data: { data: expectedData } });

    const { runCompliancePreflight } = await import('../complianceService.js');
    const result = await runCompliancePreflight(payload);

    expect(mockPost).toHaveBeenCalledWith('/compliance/preflight', payload);
    expect(result).toEqual(expectedData);
  });
});
