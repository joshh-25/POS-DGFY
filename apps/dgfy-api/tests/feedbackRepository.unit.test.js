import { jest } from '@jest/globals';
import { Op } from 'sequelize';

const model = {
  create: jest.fn(), findAll: jest.fn(), findOne: jest.fn(), count: jest.fn(), bulkCreate: jest.fn()
};
jest.unstable_mockModule('../src/models/index.js', () => ({ FeedbackSubmission: model }));
const { feedbackRepository } = await import('../src/modules/feedback/repositories/feedbackRepository.js');

beforeEach(() => jest.clearAllMocks());

it('returns the created database ID and lists newest matching rows with a cap', async () => {
  model.create.mockResolvedValue({ get: () => ({ id: 'db-id' }) });
  expect(await feedbackRepository.create({ type: 'bug' })).toEqual({ id: 'db-id' });
  model.findAll.mockResolvedValue([{ get: () => ({ id: 'db-id' }) }]);
  expect(await feedbackRepository.list({ type: 'bug', search: 'cart', startDate: '2026-10-01', endDate: '2026-10-20' })).toEqual([{ id: 'db-id' }]);
  const query = model.findAll.mock.calls[0][0];
  expect(query.limit).toBe(1000);
  expect(query.order).toEqual([['submitted_at', 'DESC']]);
  expect(query.where.type).toBe('bug');
  expect(query.where[Op.or]).toHaveLength(2);
  expect(query.where.submitted_at[Op.lte].getHours()).toBe(23);
});

it('counts all rows, returns the latest and ignores duplicate import hashes', async () => {
  model.count.mockResolvedValueOnce(10).mockResolvedValueOnce(4).mockResolvedValueOnce(2);
  model.findOne.mockResolvedValue({ get: () => ({ id: 'latest' }) });
  expect(await feedbackRepository.stats()).toEqual({ total: 10, bugs: 4, ideas: 2, latest: { id: 'latest' } });
  model.findAll.mockResolvedValueOnce([{ legacy_source_hash: 'old' }])
    .mockResolvedValueOnce([{ legacy_source_hash: 'old' }, { legacy_source_hash: 'new' }]);
  expect(await feedbackRepository.importLegacy([{ legacy_source_hash: 'old' }, { legacy_source_hash: 'new' }])).toBe(1);
  expect(model.bulkCreate).toHaveBeenCalledWith(expect.any(Array), { ignoreDuplicates: true, validate: true });
});
