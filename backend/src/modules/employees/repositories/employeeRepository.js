import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const employeeInclude = () => [
  {
    model: dbStore.get('TenantLocation'),
    as: 'location',
    attributes: ['location_id', ['name', 'location_name']],
    required: false
  },
  {
    model: dbStore.get('EmployeeCreditAccount'),
    as: 'employeeCreditAccount',
    attributes: { exclude: ['authorization_pin_hash'] },
    required: false
  }
];

export const employeeRepository = {
  list({ includeInactive = false } = {}, options = {}) {
    return dbStore.get('Employee').findAll({
      where: includeInactive ? {} : { is_active: true },
      include: employeeInclude(),
      order: [['is_active', 'DESC'], ['full_name', 'ASC']],
      transaction: options.transaction
    });
  },

  findById(employeeId, options = {}) {
    return dbStore.get('Employee').findByPk(employeeId, {
      include: employeeInclude(),
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  findByCode(employeeCode, options = {}) {
    return dbStore.get('Employee').findOne({
      where: { employee_code: { [Op.eq]: employeeCode } },
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
    return dbStore.get('Employee').create(values, { transaction: options.transaction });
  },

  async update(employee, values, options = {}) {
    await employee.update(values, { transaction: options.transaction });
    return employee;
  },

  createAuditLog(values, options = {}) {
    return dbStore.get('AuditLog').create(values, { transaction: options.transaction });
  }
};

export default employeeRepository;
