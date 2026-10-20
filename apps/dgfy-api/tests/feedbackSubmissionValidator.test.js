import { jest } from '@jest/globals';
import { feedbackSubmissionValidator } from '../src/modules/feedback/middleware/feedbackSubmissionValidator.js';

const validate = (body, feedbackIdentity = null) => {
  const req = { body, feedbackIdentity };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  feedbackSubmissionValidator(req, res, next);
  return { req, res, next };
};

describe('feedback submission validator', () => {
  const contact = { name: ' Guest ', email: 'guest@example.com' };

  it.each([
    [{ type: 'invalid', description: 'ok', contact }, 'type'],
    [{ type: 'bug', description: '', contact }, 'description'],
    [{ type: 'bug', description: 'x'.repeat(5001), contact }, 'description'],
    [{ type: 'bug', description: 'ok', url: 'x'.repeat(2049), contact }, 'url'],
    [{ type: 'bug', description: 'ok' }, 'contact'],
    [{ type: 'bug', description: 'ok', contact: { ...contact, email: 'bad' } }, 'contact.email'],
    [{ type: 'bug', description: 'ok', contact: { ...contact, name: 'x'.repeat(256) } }, 'contact.name']
  ])('rejects invalid guest input at %s', (body, field) => {
    const { res, next } = validate(body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    expect(next).not.toHaveBeenCalled();
  });

  it('trims and strips unknown fields while accepting unknown origin values', () => {
    const { req, next } = validate({ type: 'bug', description: ' x ', contact,
      origin: { surface: 'future', platform: 'tablet', extra: 'drop' }, extra: 'drop' });
    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ type: 'bug', description: 'x', contact: { name: 'Guest', email: 'guest@example.com' },
      origin: { surface: 'future', platform: 'tablet' } });
  });

  it('accepts the documented description, URL, and email length boundaries', () => {
    const { next } = validate({ type: 'other', description: 'x'.repeat(5000), url: 'x'.repeat(2048),
      contact: { name: 'Guest', email: `${'a'.repeat(61)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(60)}.com` } });
    expect(next).toHaveBeenCalled();
  });

  it('ignores spoofed contact for authenticated callers', () => {
    const { req, next } = validate({ type: 'idea', description: 'ok', contact: { name: 'Spoof', email: 'invalid' } }, { kind: 'tenant_user' });
    expect(next).toHaveBeenCalled();
    expect(req.body.contact).toBeUndefined();
  });
});
