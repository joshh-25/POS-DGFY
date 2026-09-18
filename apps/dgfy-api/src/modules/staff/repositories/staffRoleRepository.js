import dbStore from '../../../utils/dbStore.js';
import { Op } from 'sequelize';

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
  async listAssignedDeliveryJobs({ deliveryPersonnelId, locationId } = {}, query = {}) {
    if (!deliveryPersonnelId || !locationId) return [];
    const DeliveryJob = dbStore.get('DeliveryJob');
    const DeliveryRun = dbStore.get('DeliveryRun');
    const DeliveryRunPersonnel = dbStore.get('DeliveryRunPersonnel');
    const PosTransaction = dbStore.get('PosTransaction');
    const base = {
      provider: 'manual',
      location_id: locationId,
      status: { [Op.in]: ['assigned', 'picked_up', 'delivered'] }
    };
    const attributes = ['delivery_job_id', 'pos_transaction_id', 'delivery_run_id', 'provider', 'status', 'delivery_personnel_id', 'delivery_personnel_name', 'assigned_at', 'picked_up_at', 'delivered_at', 'tracking_url'];
    const transactionInclude = {
      model: PosTransaction,
      as: 'transaction',
      required: true,
      where: { location_id: locationId, fulfillment_status: 'out_for_delivery', order_source: 'online_store', order_method: 'delivery' },
      attributes: ['pos_transaction_id', 'invoice_number', 'location_id', 'customer_name', 'customer_phone', 'delivery_address', 'delivery_latitude', 'delivery_longitude', 'scheduled_for', 'special_instructions', 'delivery_fee', 'total_amount', 'fulfillment_status', 'order_method', 'order_source']
    };
    const runInclude = {
      model: DeliveryRun,
      as: 'deliveryRun',
      required: false,
      attributes: ['delivery_run_id', 'label', 'status', 'scheduled_date', 'scheduled_date_end']
    };
    const direct = await DeliveryJob.findAll({
      where: { ...base, delivery_personnel_id: deliveryPersonnelId },
      attributes,
      include: [transactionInclude, runInclude],
      order: [['assigned_at', 'ASC']],
      ...options(query)
    });
    const runMembers = await DeliveryJob.findAll({
      where: { ...base, delivery_personnel_id: { [Op.ne]: deliveryPersonnelId } },
      attributes,
      include: [
        transactionInclude,
        {
          ...runInclude,
          required: true,
          include: [{ model: DeliveryRunPersonnel, as: 'personnel', required: true, where: { delivery_personnel_id: deliveryPersonnelId }, attributes: [] }],
          attributes: ['delivery_run_id', 'label', 'status', 'scheduled_date', 'scheduled_date_end']
        }
      ],
      order: [['assigned_at', 'ASC']],
      ...options(query)
    });
    return [...direct, ...runMembers].map(plain);
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
