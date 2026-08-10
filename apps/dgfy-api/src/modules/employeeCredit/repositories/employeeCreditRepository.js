import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => value?.get ? value.get({ plain: true }) : value;

export const employeeCreditRepository = {
  async listCheckoutEmployees({ search = '', locationId = null, limit = 100 } = {}, options = {}) {
    const normalizedSearch = String(search || '').trim();
    const clauses = [{ is_active: true }];
    if (locationId) {
      clauses.push({
        [Op.or]: [
          { location_id: locationId },
          { location_id: null }
        ]
      });
    }
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      clauses.push({
        [Op.or]: [
          { employee_code: { [Op.like]: pattern } },
          { full_name: { [Op.like]: pattern } }
        ]
      });
    }
    return dbStore.get('Employee').findAll({
      where: { [Op.and]: clauses },
      attributes: ['employee_id', 'employee_code', 'full_name', 'location_id', 'is_active'],
      include: [
        {
          model: dbStore.get('TenantLocation'),
          as: 'location',
          attributes: ['location_id', 'name'],
          required: false
        },
        {
          model: dbStore.get('EmployeeCreditAccount'),
          as: 'employeeCreditAccount',
          required: false,
          attributes: {
            exclude: ['authorization_pin_hash']
          }
        }
      ],
      order: [['full_name', 'ASC'], ['employee_id', 'ASC']],
      limit,
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  async listLegacyCheckoutAccounts({ search = '', limit = 100 } = {}, options = {}) {
    const normalizedSearch = String(search || '').trim();
    const userWhere = { is_active: true, deleted_at: null };
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      userWhere[Op.or] = [
        { username: { [Op.like]: pattern } },
        { email: { [Op.like]: pattern } }
      ];
    }
    return dbStore.get('EmployeeCreditAccount').findAll({
      where: { employee_id: null },
      attributes: {
        exclude: ['authorization_pin_hash']
      },
      include: [{
        model: dbStore.get('User'),
        as: 'employee',
        required: true,
        where: userWhere,
        attributes: ['user_id', 'username', 'email', 'is_active']
      }],
      order: [['account_id', 'ASC']],
      limit,
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  async listAccounts(options = {}) {
    const User = dbStore.get('User');
    return User.findAll({
      where: { is_active: true, deleted_at: null },
      attributes: ['user_id', 'username', 'email', 'role', 'is_active'],
      include: [{
        model: dbStore.get('EmployeeCreditAccount'),
        as: 'employeeCreditAccount',
        required: false,
        attributes: {
          exclude: ['authorization_pin_hash']
        }
      }],
      order: [['username', 'ASC']],
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  async findActiveUserById(userId, options = {}) {
    return dbStore.get('User').findOne({
      where: { user_id: userId, is_active: true, deleted_at: null },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  async findActiveEmployeeById(employeeId, options = {}) {
    return dbStore.get('Employee').findOne({
      where: { employee_id: employeeId, is_active: true },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  async findAccountByUserId(userId, options = {}) {
    return dbStore.get('EmployeeCreditAccount').findOne({
      where: { user_id: userId },
      include: [
        { model: dbStore.get('User'), as: 'employee', required: false },
        { model: dbStore.get('Employee'), as: 'employeeProfile', required: false }
      ],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  async findAccountByEmployeeId(employeeId, options = {}) {
    return dbStore.get('EmployeeCreditAccount').findOne({
      where: { employee_id: employeeId },
      include: [
        { model: dbStore.get('User'), as: 'employee', required: false },
        { model: dbStore.get('Employee'), as: 'employeeProfile', required: false }
      ],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  async findAccountById(accountId, options = {}) {
    return dbStore.get('EmployeeCreditAccount').findOne({
      where: { account_id: accountId },
      include: [
        { model: dbStore.get('User'), as: 'employee', required: false },
        { model: dbStore.get('Employee'), as: 'employeeProfile', required: false }
      ],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  async findAccountByCode(accountCode, options = {}) {
    return dbStore.get('EmployeeCreditAccount').findOne({
      where: { account_code: accountCode },
      include: [
        { model: dbStore.get('User'), as: 'employee', required: false },
        { model: dbStore.get('Employee'), as: 'employeeProfile', required: false }
      ],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  async createAccount(values, options = {}) {
    return dbStore.get('EmployeeCreditAccount').create(values, { transaction: options.transaction });
  },

  async updateAccount(account, values, options = {}) {
    await account.update(values, { transaction: options.transaction });
    return account;
  },

  async createLedgerEntry(values, options = {}) {
    return dbStore.get('EmployeeCreditLedgerEntry').create(values, { transaction: options.transaction });
  },

  async findLedgerEntryByIdempotencyKey(idempotencyKey, options = {}) {
    return dbStore.get('EmployeeCreditLedgerEntry').findOne({
      where: { idempotency_key: idempotencyKey },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  async findDebitForTransaction(posTransactionId, options = {}) {
    return dbStore.get('EmployeeCreditLedgerEntry').findOne({
      where: { pos_transaction_id: posTransactionId, entry_type: 'debit' },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
  },

  async findFinancialEntryForTransaction(posTransactionId, options = {}) {
    return dbStore.get('EmployeeCreditLedgerEntry').findOne({
      where: {
        pos_transaction_id: posTransactionId,
        entry_type: { [Op.in]: ['charge', 'debit'] }
      },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined,
      order: [['ledger_entry_id', 'DESC']]
    });
  },

  async createAuditLog(values, options = {}) {
    return dbStore.get('AuditLog').create(values, { transaction: options.transaction });
  },

  async listLedgerEntries({ dateFrom, dateTo, accountId, entryType, limit = 500 } = {}, options = {}) {
    const where = {};
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) where.created_at[Op.gte] = dateFrom;
      if (dateTo) where.created_at[Op.lte] = dateTo;
    }
    if (accountId) where.account_id = accountId;
    if (entryType) where.entry_type = entryType;
    return dbStore.get('EmployeeCreditLedgerEntry').findAll({
      where,
      include: [
        {
          model: dbStore.get('EmployeeCreditAccount'),
          as: 'account',
          include: [
            { model: dbStore.get('User'), as: 'employee', attributes: ['user_id', 'username', 'email'], required: false },
            { model: dbStore.get('Employee'), as: 'employeeProfile', attributes: ['employee_id', 'employee_code', 'full_name'], required: false }
          ]
        },
        { model: dbStore.get('User'), as: 'actor', attributes: ['user_id', 'username'], required: false }
      ],
      order: [['created_at', 'DESC'], ['ledger_entry_id', 'DESC']],
      limit,
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  }
};

export default employeeCreditRepository;
