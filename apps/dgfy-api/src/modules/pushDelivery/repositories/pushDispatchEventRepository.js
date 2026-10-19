import { Op } from 'sequelize';
import { PushDispatchEvent } from '../../../models/index.js';

const toPlain = (row) => (row?.get ? row.get({ plain: true }) : row);

export const pushDispatchEventRepository = {
    async create(payload = {}) {
        return toPlain(await PushDispatchEvent.create(payload));
    },

    async purgeBefore(cutoff, { limit = 1000 } = {}) {
        const rows = await PushDispatchEvent.findAll({
            where: { created_at: { [Op.lt]: cutoff } },
            attributes: ['id'], limit, order: [['created_at', 'ASC']]
        });
        if (!rows.length) return 0;
        return PushDispatchEvent.destroy({ where: { id: { [Op.in]: rows.map((row) => row.id) } } });
    }
};

export default pushDispatchEventRepository;
