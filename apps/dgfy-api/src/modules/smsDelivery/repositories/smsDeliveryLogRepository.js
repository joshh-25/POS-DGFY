import { Op } from 'sequelize';
import { SmsDeliveryLog } from '../../../models/index.js';

const toPlain = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);

export const smsDeliveryLogRepository = {
  async create(payload) {
    return toPlain(await SmsDeliveryLog.create(payload));
  },

  async findById(id) {
    if (!id) return null;
    return toPlain(await SmsDeliveryLog.findByPk(id));
  },

  async findByDedupeKey(dedupeKey) {
    if (!dedupeKey) return null;
    return toPlain(await SmsDeliveryLog.findOne({ where: { dedupe_key: dedupeKey } }));
  },

  async redactPiiOlderThan(cutoff, { limit = 1000 } = {}) {
    const candidates = await SmsDeliveryLog.findAll({
      where: { sent_at: { [Op.lt]: cutoff }, pii_redacted_at: null, recipient_phone: { [Op.ne]: null } },
      attributes: ['id'],
      limit,
      order: [['sent_at', 'ASC']]
    });
    if (!candidates.length) return 0;
    const [affected] = await SmsDeliveryLog.update({ recipient_phone: null, pii_redacted_at: new Date() }, {
      where: { id: { [Op.in]: candidates.map((row) => row.id) } }
    });
    return affected;
  },

  async destroyOlderThan(cutoff, { limit = 1000 } = {}) {
    const candidates = await SmsDeliveryLog.findAll({
      where: { sent_at: { [Op.lt]: cutoff } },
      attributes: ['id'],
      limit,
      order: [['sent_at', 'ASC']]
    });
    if (!candidates.length) return 0;
    return SmsDeliveryLog.destroy({ where: { id: { [Op.in]: candidates.map((row) => row.id) } } });
  }
};

export default smsDeliveryLogRepository;
