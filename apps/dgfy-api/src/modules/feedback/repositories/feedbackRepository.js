import { Op } from 'sequelize';
import { FeedbackSubmission } from '../../../models/index.js';

const plain = (row) => row?.get ? row.get({ plain: true }) : row;

export const feedbackRepository = {
  async create(entry) {
    return plain(await FeedbackSubmission.create(entry));
  },

  async list(filters = {}, { limit = 1000 } = {}) {
    const where = {};
    if (filters.type && filters.type !== 'all') where.type = filters.type;
    if (filters.search) {
      const search = `%${String(filters.search).replace(/[\\%_]/g, '\\$&')}%`;
      where[Op.or] = [
        { description: { [Op.like]: search } },
        { page_url: { [Op.like]: search } }
      ];
    }
    if (filters.startDate || filters.endDate) {
      where.submitted_at = {};
      if (filters.startDate) where.submitted_at[Op.gte] = new Date(filters.startDate);
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.submitted_at[Op.lte] = end;
      }
    }
    const rows = await FeedbackSubmission.findAll({ where, order: [['submitted_at', 'DESC']], limit });
    return rows.map(plain);
  },

  async stats() {
    const [total, bugs, ideas, latest] = await Promise.all([
      FeedbackSubmission.count(),
      FeedbackSubmission.count({ where: { type: 'bug' } }),
      FeedbackSubmission.count({ where: { type: 'idea' } }),
      FeedbackSubmission.findOne({ order: [['submitted_at', 'DESC']] })
    ]);
    return { total, bugs, ideas, latest: latest ? plain(latest) : null };
  },

  async existingLegacyHashes(hashes) {
    if (!hashes.length) return new Set();
    const rows = await FeedbackSubmission.findAll({
      attributes: ['legacy_source_hash'],
      where: { legacy_source_hash: { [Op.in]: hashes } },
      raw: true
    });
    return new Set(rows.map((row) => row.legacy_source_hash));
  },

  async importLegacy(rows) {
    if (!rows.length) return 0;
    const hashes = rows.map((row) => row.legacy_source_hash);
    const before = await this.existingLegacyHashes(hashes);
    await FeedbackSubmission.bulkCreate(rows, { ignoreDuplicates: true, validate: true });
    const after = await this.existingLegacyHashes(hashes);
    return after.size - before.size;
  }
};
