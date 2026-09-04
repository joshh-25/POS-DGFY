import { Op, fn, col, where as sequelizeWhere } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const deliveryPersonnelInclude = () => [
  {
    model: dbStore.get('TenantLocation'),
    as: 'location',
    attributes: ['location_id', ['name', 'location_name']],
    required: false
  }
];

export const deliveryPersonnelRepository = {
  list({ includeInactive = true } = {}, options = {}) {
    return dbStore.get('DeliveryPersonnel').findAll({
      where: includeInactive ? {} : { is_active: true },
      include: deliveryPersonnelInclude(),
      order: [['is_active', 'DESC'], ['display_name', 'ASC']],
      transaction: options.transaction
    });
  },

  findById(deliveryPersonnelId, options = {}) {
    return dbStore.get('DeliveryPersonnel').findByPk(deliveryPersonnelId, {
      include: deliveryPersonnelInclude(),
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  findActiveByDisplayName(displayName, { locationId = null, excludeId = null, ...options } = {}) {
    const normalized = String(displayName || '').trim();
    return dbStore.get('DeliveryPersonnel').findOne({
      where: {
        is_active: true,
        location_id: locationId ?? null,
        ...(excludeId ? { delivery_personnel_id: { [Op.ne]: excludeId } } : {}),
        [Op.and]: [
          sequelizeWhere(fn('LOWER', col('display_name')), normalized.toLowerCase())
        ]
      },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  findActiveLocation(locationId, options = {}) {
    return dbStore.get('TenantLocation').findOne({
      where: { location_id: locationId, is_active: true },
      transaction: options.transaction
    });
  },

  create(values, options = {}) {
    return dbStore.get('DeliveryPersonnel').create(values, { transaction: options.transaction });
  },

  async update(deliveryPersonnel, values, options = {}) {
    await deliveryPersonnel.update(values, { transaction: options.transaction });
    return deliveryPersonnel;
  },

  createAuditLog(values, options = {}) {
    return dbStore.get('AuditLog').create(values, { transaction: options.transaction });
  }
};

export default deliveryPersonnelRepository;
