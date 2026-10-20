import { jest } from '@jest/globals';
import { buildSubmitFeedbackUseCase } from '../src/modules/feedback/usecases/submitFeedbackUseCase.js';
import { buildReadFeedbackUseCases } from '../src/modules/feedback/usecases/readFeedbackUseCases.js';
import { normalizeContext, parseLegacyFeedbackLine, toAdminFeedback } from '../src/modules/feedback/usecases/feedbackSubmissionMapper.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const build = (create = jest.fn().mockResolvedValue({ id: 'stable-id', surface: 'storefront', client_platform: 'ios' })) => ({
  create,
  useCase: buildSubmitFeedbackUseCase({ feedbackRepository: { create } })
});

describe('feedback submission contract', () => {
  it.each([
    { type: '', description: '' },
    { type: 'suggestion', description: 'hello' },
    { type: 'bug', description: ' ' },
    { type: 'bug', description: 'x'.repeat(5001) }
  ])('rejects invalid input: %j', async (input) => {
    const { create, useCase } = build();
    const result = await useCase(input);
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('persists session identity, tenant, origin and request correlation', async () => {
    const { create, useCase } = build();
    const result = await useCase({
      type: 'bug', description: ' Broken cart ', url: '/cart',
      context: { userAgent: 'test' }, origin: { surface: 'storefront', platform: 'ios', app_version: '1.2.3' },
      contact: { name: 'Impersonator', email: 'not-session@example.com' },
      tenant: { id: 'tenant-uuid', name: 'Shop' },
      user: { id: 7, username: 'Alice', email: 'alice@example.com' },
      correlationId: 'request-123'
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Broken cart', tenant_id: 'tenant-uuid', tenant_user_id: 7,
      submitter_type: 'tenant_user', submitter_name: 'Alice', submitter_email: 'alice@example.com',
      contact_verified: true, surface: 'storefront', client_platform: 'ios', app_version: '1.2.3',
      correlation_id: 'request-123'
    }));
    expect(result.data).toEqual({ message: 'Feedback submitted successfully', id: 'stable-id', surface: 'storefront', client_platform: 'ios' });
  });

  it('stores unverified guest contact and unknown origin without a default tenant UUID', async () => {
    const { create, useCase } = build();
    await useCase({ type: 'idea', description: 'new feature', tenant: { id: 'default' },
      contact: { name: ' Guest ', email: 'guest@example.com' },
      origin: { surface: 'mobile-storefront', platform: 'tablet' } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: null, tenant_user_id: null, submitter_type: 'guest', contact_verified: false,
      submitter_name: 'Guest', surface: 'unknown', client_platform: 'unknown',
      context_json: { origin_raw: { surface: 'mobile-storefront', platform: 'tablet' } }
    }));
  });

  it('bounds context and maps repository failure to an internal result', async () => {
    expect(normalizeContext({ blob: 'x'.repeat(9000) })).toEqual({ truncated: true });
    const { useCase } = build(jest.fn().mockRejectedValue(new Error('db unavailable')));
    const result = await useCase({ type: 'bug', description: 'retry me' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.INTERNAL_ERROR);
  });
});

describe('feedback read and legacy mapping', () => {
  it('keeps the admin row and stats shape', async () => {
    const row = { id: 'stable-id', submitted_at: new Date('2026-10-20T00:00:00Z'), type: 'bug',
      description: 'Broken cart', page_url: null, context_json: { userAgent: 'test' },
      tenant_id: 'tenant-uuid', tenant_name: 'Shop', tenant_user_id: 7,
      submitter_name: 'Alice', submitter_email: 'alice@example.com', status: 'new',
      surface: 'ims', client_platform: 'web', submitter_type: 'tenant_user', contact_verified: true };
    expect(toAdminFeedback(row)).toEqual(expect.objectContaining({
      id: 'stable-id', timestamp: row.submitted_at, url: 'N/A',
      user: { id: 7, username: 'Alice', email: 'alice@example.com' },
      context: { userAgent: 'test' }
    }));
    const repo = { list: jest.fn().mockResolvedValue([row]), stats: jest.fn().mockResolvedValue({ total: 1, bugs: 1, ideas: 0, latest: row }) };
    const read = buildReadFeedbackUseCases({ feedbackRepository: repo });
    expect((await read.getFilteredFeedback({ type: 'bug' }))[0].id).toBe('stable-id');
    expect(await read.getFeedbackStats()).toEqual(expect.objectContaining({ total: 1, bugs: 1, ideas: 0, latest: expect.objectContaining({ id: 'stable-id' }) }));
  });

  it('hashes identical legacy lines identically and preserves unrecognized old types', () => {
    const line = JSON.stringify({ timestamp: '2026-10-01T00:00:00Z', type: 'suggestion', description: 'Old feedback', user: { id: 2, username: 'Bob' } });
    const first = parseLegacyFeedbackLine(line);
    expect(first.legacy_source_hash).toBe(parseLegacyFeedbackLine(line).legacy_source_hash);
    expect(first.type).toBe('other');
    expect(first.context_json.legacy_type).toBe('suggestion');
    expect(first.submitter_type).toBe('legacy');
    expect(first.contact_verified).toBe(false);
    expect(first.submitted_at.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(() => parseLegacyFeedbackLine('{bad')).toThrow();
  });
});
