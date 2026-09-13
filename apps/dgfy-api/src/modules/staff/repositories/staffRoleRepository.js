import dbStore from '../../../utils/dbStore.js';

const options = (query = {}) => ({
  transaction: query.transaction,
  lock: query.lock && query.transaction ? query.transaction.LOCK.UPDATE : undefined
});
const plain = (row) => row?.get ? row.get({ plain: true }) : row;

export const staffRoleRepository = {
  list({ includeInactive = false } = {}, query = {}) {
    return dbStore.get('StaffRole').findAll({
      where: includeInactive ? {} : { is_active: true },
      order: [['is_active', 'DESC'], ['name', 'ASC']],
      ...options(query)
    });
  },
  findById(id, query = {}) { return dbStore.get('StaffRole').findByPk(id, options(query)); },
  findByName(name, query = {}) { return dbStore.get('StaffRole').findOne({ where: { name }, ...options(query) }); },
  create(values, query = {}) { return dbStore.get('StaffRole').create(values, { transaction: query.transaction }); },
  update(row, values, query = {}) { return row.update(values, { transaction: query.transaction }); },
  findUserById(userId, query = {}) { return dbStore.get('User').findByPk(userId, options(query)); },
  listAssignedRuns(userId, query = {}) {
    const DeliveryPersonnel = dbStore.get('DeliveryPersonnel');
    const DeliveryRunPersonnel = dbStore.get('DeliveryRunPersonnel');
    const DeliveryRun = dbStore.get('DeliveryRun');
    return DeliveryPersonnel.findOne({
      where: { user_id: userId, is_active: true },
      attributes: ['delivery_personnel_id'],
      include: [{
        model: DeliveryRunPersonnel,
        as: 'runMemberships',
        required: false,
        include: [{ model: DeliveryRun, as: 'run', required: true }]
      }],
      ...options(query)
    });
  },
  async findDeliveryPersonnelForUser(userId, query = {}) {
    return dbStore.get('DeliveryPersonnel').findOne({
      where: { user_id: userId, is_active: true },
      ...options(query)
    });
  },
  async findRunMembership(deliveryRunId, deliveryPersonnelId, query = {}) {
    return dbStore.get('DeliveryRunPersonnel').findOne({
      where: { delivery_run_id: deliveryRunId, delivery_personnel_id: deliveryPersonnelId },
      ...options(query)
    });
  },
  async findAssignedOrder(posTransactionId, deliveryPersonnelId, query = {}) {
    return dbStore.get('DeliveryJob').findOne({
      where: { pos_transaction_id: posTransactionId, delivery_personnel_id: deliveryPersonnelId },
      include: [{ model: dbStore.get('PosTransaction'), as: 'transaction', required: true, where: { packed_at: null } }],
      ...options(query)
    });
  },
  listAssignedOrders({ locationId } = {}, query = {}) {
    return dbStore.get('PosTransaction').findAll({
      where: { location_id: locationId, packed_at: null },
      order: [['created_at', 'ASC']],
      ...options(query)
    }).then((rows) => rows.map(plain));
  },
  listRunsFromPersonnel(personnel, query = {}) {
    if (!personnel) return Promise.resolve([]);
    return dbStore.get('DeliveryRunPersonnel').findAll({
      where: { delivery_personnel_id: personnel.delivery_personnel_id },
      include: [{ model: dbStore.get('DeliveryRun'), as: 'run', required: true }],
      order: [[{ model: dbStore.get('DeliveryRun'), as: 'run' }, 'scheduled_date', 'ASC']],
      ...options(query)
    }).then((rows) => rows.map(plain));
  },
  createAuditLog(values, query = {}) { return dbStore.get('AuditLog').create(values, { transaction: query.transaction }); }
};

export { plain };
