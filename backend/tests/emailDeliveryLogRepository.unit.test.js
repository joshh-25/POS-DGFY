import { jest } from '@jest/globals';

const mockEmailDeliveryLog = {
  create: jest.fn(),
  findByPk: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  findAll: jest.fn(),
  destroy: jest.fn(),
  findAndCountAll: jest.fn(),
  sequelize: {
    fn: jest.fn((name, col) => ({ fn: name, col })),
    col: jest.fn((name) => ({ col: name }))
  }
};

// Also provide a `default` export matching the real module's shape
// (models/index.js exports `db` as default): under --runInBand, Jest's
// experimental VM-modules ESM support can leak this mock's registry entry
// for '../src/models/index.js' into the next alphabetically-ordered test
// file that imports the real module by default (e.g. via
// tenantModelFactory.js's `import defaultDb from '../models/index.js'`) --
// omitting `default` here previously broke emailOtpService.test.js with
// "does not provide an export named 'default'" when run in the same
// process after this file.
jest.unstable_mockModule('../src/models/index.js', () => ({
  default: { EmailDeliveryLog: mockEmailDeliveryLog },
  EmailDeliveryLog: mockEmailDeliveryLog
}));

const {
  emailDeliveryLogRepository,
  hashRecipientEmail,
  extractRecipientDomain,
  splitRecipients
} = await import('../src/modules/emailDelivery/repositories/emailDeliveryLogRepository.js');

describe('emailDeliveryLogRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashRecipientEmail', () => {
    it('is stable and case/whitespace-insensitive', () => {
      const a = hashRecipientEmail('  User@Example.com ');
      const b = hashRecipientEmail('user@example.com');
      expect(a).toBe(b);
      expect(a).toHaveLength(64);
    });
  });

  describe('extractRecipientDomain', () => {
    it('extracts the domain in lowercase', () => {
      expect(extractRecipientDomain('User@Yahoo.COM')).toBe('yahoo.com');
    });

    it('falls back to unknown for a malformed address', () => {
      expect(extractRecipientDomain('not-an-email')).toBe('unknown');
    });
  });

  describe('splitRecipients', () => {
    it('handles a single string, a comma-separated string, and an array', () => {
      expect(splitRecipients('a@example.com')).toEqual(['a@example.com']);
      expect(splitRecipients('a@example.com, b@example.com')).toEqual(['a@example.com', 'b@example.com']);
      expect(splitRecipients(['a@example.com', ' b@example.com '])).toEqual(['a@example.com', 'b@example.com']);
    });
  });

  describe('create', () => {
    it('creates a row and returns a plain object', async () => {
      const created = { get: () => ({ id: 'log-1', status: 'sent' }) };
      mockEmailDeliveryLog.create.mockResolvedValue(created);

      const result = await emailDeliveryLogRepository.create({ status: 'sent' });

      expect(mockEmailDeliveryLog.create).toHaveBeenCalledWith({ status: 'sent' });
      expect(result).toEqual({ id: 'log-1', status: 'sent' });
    });
  });

  describe('recordBounceResult', () => {
    it('returns true when the idempotency-guarded update affects a row', async () => {
      mockEmailDeliveryLog.update.mockResolvedValue([1]);

      const result = await emailDeliveryLogRepository.recordBounceResult('log-1', {
        status: 'bounced',
        bounceType: 'hard',
        bounceStatusCode: '5.7.9'
      });

      expect(result).toBe(true);
      expect(mockEmailDeliveryLog.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'bounced', bounce_type: 'hard', bounce_status_code: '5.7.9' }),
        expect.objectContaining({ where: { id: 'log-1', bounce_reported_at: null } })
      );
    });

    it('returns false (safe no-op) when the row already has a bounce recorded', async () => {
      mockEmailDeliveryLog.update.mockResolvedValue([0]);

      const result = await emailDeliveryLogRepository.recordBounceResult('log-1', { status: 'bounced', bounceType: 'hard' });

      expect(result).toBe(false);
    });
  });

  describe('redactPiiOlderThan', () => {
    it('returns 0 without issuing an update when there are no candidates', async () => {
      mockEmailDeliveryLog.findAll.mockResolvedValue([]);

      const result = await emailDeliveryLogRepository.redactPiiOlderThan(new Date());

      expect(result).toBe(0);
      expect(mockEmailDeliveryLog.update).not.toHaveBeenCalled();
    });

    it('nulls recipient_email/from_email/subject and stamps pii_redacted_at for matched rows', async () => {
      mockEmailDeliveryLog.findAll.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      mockEmailDeliveryLog.update.mockResolvedValue([2]);

      const result = await emailDeliveryLogRepository.redactPiiOlderThan(new Date(), { limit: 500 });

      expect(result).toBe(2);
      const [updatePayload] = mockEmailDeliveryLog.update.mock.calls[0];
      expect(updatePayload).toEqual(expect.objectContaining({
        recipient_email: null,
        from_email: null,
        subject: null
      }));
      expect(updatePayload.pii_redacted_at).toBeInstanceOf(Date);
    });
  });

  describe('destroyOlderThan', () => {
    it('returns 0 without issuing a destroy when there are no candidates', async () => {
      mockEmailDeliveryLog.findAll.mockResolvedValue([]);

      const result = await emailDeliveryLogRepository.destroyOlderThan(new Date());

      expect(result).toBe(0);
      expect(mockEmailDeliveryLog.destroy).not.toHaveBeenCalled();
    });

    it('destroys matched rows and returns the count', async () => {
      mockEmailDeliveryLog.findAll.mockResolvedValue([{ id: 'a' }]);
      mockEmailDeliveryLog.destroy.mockResolvedValue(1);

      const result = await emailDeliveryLogRepository.destroyOlderThan(new Date());

      expect(result).toBe(1);
    });
  });

  describe('list', () => {
    it('filters by recipient using the hashed column, never the raw address', async () => {
      mockEmailDeliveryLog.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await emailDeliveryLogRepository.list({ recipient: 'user@example.com' });

      const [{ where }] = mockEmailDeliveryLog.findAndCountAll.mock.calls[0];
      expect(where).toHaveProperty('recipient_email_hash', hashRecipientEmail('user@example.com'));
      expect(where).not.toHaveProperty('recipient_email');
    });

    it('caps limit at 100 and floors page at 1', async () => {
      mockEmailDeliveryLog.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      const result = await emailDeliveryLogRepository.list({ limit: 5000, page: -3 });

      expect(result.limit).toBe(100);
      expect(result.page).toBe(1);
    });
  });

  describe('summary', () => {
    it('returns grouped counts by status and by domain+status', async () => {
      mockEmailDeliveryLog.findAll
        .mockResolvedValueOnce([{ status: 'sent', count: '10' }])
        .mockResolvedValueOnce([{ recipient_domain: 'yahoo.com', status: 'failed', count: '3' }]);

      const result = await emailDeliveryLogRepository.summary({});

      expect(result.by_status).toEqual([{ status: 'sent', count: '10' }]);
      expect(result.by_domain_status).toEqual([{ recipient_domain: 'yahoo.com', status: 'failed', count: '3' }]);
    });
  });
});
