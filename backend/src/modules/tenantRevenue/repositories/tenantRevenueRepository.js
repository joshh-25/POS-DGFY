import { Op } from 'sequelize';
import db from '../../../models/index.js';

const parseJsonObject = (value) => {
  let parsed = value;
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return value;
    }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : value;
};

const toPlain = (row) => {
  const plain = row?.get ? row.get({ plain: true }) : row;
  if (!plain || typeof plain !== 'object') return plain;
  const normalized = { ...plain };
  if (Object.hasOwn(normalized, 'financial_snapshot')) {
    normalized.financial_snapshot = parseJsonObject(normalized.financial_snapshot);
  }
  if (Object.hasOwn(normalized, 'fallback_fee_policy')) {
    normalized.fallback_fee_policy = parseJsonObject(normalized.fallback_fee_policy);
  }
  return normalized;
};
const toPlainRows = (rows = []) => rows.map(toPlain);

const buildTransactionWhere = ({
  tenantId,
  status,
  reconciliationStatus,
  settlementStatus,
  companyId,
  branchId,
  paymentMethod,
  providerPaymentId,
  periodStart,
  periodEnd
} = {}) => {
  const where = {};
  if (tenantId) where.tenant_id = tenantId;
  if (status) where.payment_status = Array.isArray(status) ? { [Op.in]: status } : status;
  if (reconciliationStatus) {
    where.reconciliation_status = Array.isArray(reconciliationStatus)
      ? { [Op.in]: reconciliationStatus }
      : reconciliationStatus;
  }
  if (settlementStatus) {
    where.settlement_status = Array.isArray(settlementStatus)
      ? { [Op.in]: settlementStatus }
      : settlementStatus;
  }
  if (companyId) where.company_id = companyId;
  if (branchId) where.branch_id = branchId;
  if (paymentMethod) where.payment_method = paymentMethod;
  if (providerPaymentId) where.provider_payment_id = { [Op.like]: `%${providerPaymentId}%` };
  if (periodStart || periodEnd) {
    where.paid_at = {};
    if (periodStart) where.paid_at[Op.gte] = periodStart;
    if (periodEnd) where.paid_at[Op.lte] = periodEnd;
  }
  return where;
};

const buildTransactionIncludes = ({ settlementReference } = {}) => [
  { model: db.Tenant, as: 'tenant', attributes: ['id', 'name'], required: false },
  {
    model: db.TenantSettlementBatchItem,
    as: 'settlementItem',
    required: Boolean(settlementReference),
    include: [{
      model: db.TenantSettlementBatch,
      as: 'batch',
      required: Boolean(settlementReference),
      where: settlementReference
        ? { batch_number: { [Op.like]: `%${settlementReference}%` } }
        : undefined,
      attributes: [
        'settlement_batch_id',
        'batch_number',
        'status',
        'scheduled_payout_at',
        'actual_payout_at'
      ]
    }]
  }
];

export const tenantRevenueRepository = {
  runInTransaction(callback) {
    return db.sequelize.transaction(callback);
  },

  findTenantById(tenantId, options = {}) {
    return db.Tenant.findByPk(tenantId, { transaction: options.transaction }).then(toPlain);
  },

  async findLatestFeePolicy(tenantId, options = {}) {
    return db.TenantRevenueFeePolicy.findOne({
      where: { tenant_id: tenantId },
      order: [['version', 'DESC']],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findEffectiveFeePolicy(tenantId, effectiveAt, options = {}) {
    return db.TenantRevenueFeePolicy.findOne({
      where: {
        tenant_id: tenantId,
        effective_at: { [Op.lte]: effectiveAt },
        [Op.or]: [
          { ends_at: null },
          { ends_at: { [Op.gte]: effectiveAt } }
        ]
      },
      order: [['effective_at', 'DESC'], ['version', 'DESC']],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  listFeePolicies(tenantId, options = {}) {
    return db.TenantRevenueFeePolicy.findAll({
      where: { tenant_id: tenantId },
      order: [['version', 'DESC']],
      transaction: options.transaction
    }).then(toPlainRows);
  },

  async createFeePolicy(payload, options = {}) {
    return db.TenantRevenueFeePolicy.create(payload, {
      transaction: options.transaction
    }).then(toPlain);
  },

  async updateFeePolicy(policyId, payload, options = {}) {
    const row = await db.TenantRevenueFeePolicy.findByPk(policyId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  findRevenueTransactionBySession(paymentSessionId, options = {}) {
    return db.TenantRevenueTransaction.findOne({
      where: { payment_session_id: paymentSessionId },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findRevenueTransactionByProviderPayment(providerPaymentId, options = {}) {
    return db.TenantRevenueTransaction.findOne({
      where: { provider_payment_id: providerPaymentId },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findRevenueTransactionById(revenueTransactionId, options = {}) {
    return db.TenantRevenueTransaction.findByPk(revenueTransactionId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  async createRevenueTransaction(payload, options = {}) {
    try {
      return await db.TenantRevenueTransaction.create(payload, {
        transaction: options.transaction
      }).then(toPlain);
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
      const existing = await this.findRevenueTransactionBySession(payload.payment_session_id, options);
      if (!existing) throw error;
      return { ...existing, __idempotent_replay: true };
    }
  },

  async updateRevenueTransaction(revenueTransactionId, payload, options = {}) {
    const row = await db.TenantRevenueTransaction.findByPk(revenueTransactionId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  listRevenueTransactions(filters = {}, options = {}) {
    return db.TenantRevenueTransaction.findAll({
      where: buildTransactionWhere(filters),
      include: buildTransactionIncludes(filters),
      order: [['paid_at', 'DESC'], ['revenue_transaction_id', 'DESC']],
      limit: options.limit || 100,
      offset: options.offset || 0,
      transaction: options.transaction
    }).then(toPlainRows);
  },

  countRevenueTransactions(filters = {}, options = {}) {
    return db.TenantRevenueTransaction.count({
      where: buildTransactionWhere(filters),
      include: buildTransactionIncludes(filters),
      distinct: true,
      col: 'revenue_transaction_id',
      transaction: options.transaction
    });
  },

  async findLedgerEntryByIdempotency(idempotencyKey, options = {}) {
    return db.TenantRevenueLedgerEntry.findOne({
      where: { idempotency_key: idempotencyKey },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  async createLedgerEntry(payload, options = {}) {
    const existing = await this.findLedgerEntryByIdempotency(payload.idempotency_key, options);
    if (existing) return { entry: existing, created: false };
    try {
      const row = await db.TenantRevenueLedgerEntry.create(payload, {
        transaction: options.transaction
      });
      return { entry: toPlain(row), created: true };
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
      const concurrent = await this.findLedgerEntryByIdempotency(payload.idempotency_key, options);
      if (!concurrent) throw error;
      return { entry: concurrent, created: false };
    }
  },

  listLedgerEntries(filters = {}, options = {}) {
    const where = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.revenueTransactionId) where.revenue_transaction_id = filters.revenueTransactionId;
    if (filters.settlementBatchId) where.settlement_batch_id = filters.settlementBatchId;
    return db.TenantRevenueLedgerEntry.findAll({
      where,
      order: [['created_at', 'ASC'], ['ledger_entry_id', 'ASC']],
      transaction: options.transaction
    }).then(toPlainRows);
  },

  async createReconciliationRecord(payload, options = {}) {
    return db.TenantRevenueReconciliationRecord.create(payload, {
      transaction: options.transaction
    }).then(toPlain);
  },

  listReconciliationRecords(filters = {}, options = {}) {
    const where = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.revenueTransactionId) where.revenue_transaction_id = filters.revenueTransactionId;
    return db.TenantRevenueReconciliationRecord.findAll({
      where,
      include: [
        { model: db.TenantRevenueTransaction, as: 'revenueTransaction', required: false },
        { model: db.Tenant, as: 'tenant', attributes: ['id', 'name'], required: false }
      ],
      order: [['detected_at', 'DESC']],
      limit: options.limit || 200,
      transaction: options.transaction
    }).then(toPlainRows);
  },

  async updateReconciliationRecord(reconciliationId, payload, options = {}) {
    const row = await db.TenantRevenueReconciliationRecord.findByPk(reconciliationId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async listEligibleUnbatchedTransactions({
    tenantId,
    periodStart,
    periodEnd,
    now = new Date()
  }, options = {}) {
    const batchedIds = await db.TenantSettlementBatchItem.findAll({
      attributes: ['revenue_transaction_id'],
      include: [{
        model: db.TenantSettlementBatch,
        as: 'batch',
        attributes: [],
        required: true,
        where: { status: { [Op.notIn]: ['cancelled', 'reversed'] } }
      }],
      transaction: options.transaction
    }).then((rows) => rows.map((row) => row.revenue_transaction_id));

    const where = {
      tenant_id: tenantId,
      payment_status: { [Op.in]: ['paid', 'partially_refunded'] },
      reconciliation_status: { [Op.in]: ['reconciled', 'approved_override'] },
      fulfillment_status: 'completed',
      settlement_status: { [Op.in]: ['pending', 'eligible'] },
      eligibility_at: { [Op.lte]: now },
      paid_at: { [Op.between]: [periodStart, periodEnd] }
    };
    if (batchedIds.length) where.revenue_transaction_id = { [Op.notIn]: batchedIds };

    return db.TenantRevenueTransaction.findAll({
      where,
      order: [['paid_at', 'ASC']],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlainRows);
  },

  findSettlementItemByRevenueTransaction(revenueTransactionId, options = {}) {
    return db.TenantSettlementBatchItem.findOne({
      where: { revenue_transaction_id: revenueTransactionId },
      include: [{
        model: db.TenantSettlementBatch,
        as: 'batch',
        required: true
      }],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  async listEligibleCarryforwardLedgerEntries({ tenantId }, options = {}) {
    const allocatedLedgerIds = await db.TenantSettlementBatchLedgerItem.findAll({
      attributes: ['ledger_entry_id'],
      transaction: options.transaction
    }).then((rows) => rows.map((row) => row.ledger_entry_id));
    const where = {
      tenant_id: tenantId,
      entry_type: { [Op.in]: ['refund', 'chargeback', 'adjustment'] }
    };
    if (allocatedLedgerIds.length) where.ledger_entry_id = { [Op.notIn]: allocatedLedgerIds };
    return db.TenantRevenueLedgerEntry.findAll({
      where,
      include: [{
        model: db.TenantRevenueTransaction,
        as: 'revenueTransaction',
        required: true,
        include: [{
          model: db.TenantSettlementBatchItem,
          as: 'settlementItem',
          required: true,
          include: [{
            model: db.TenantSettlementBatch,
            as: 'batch',
            required: true,
            where: { status: 'paid' }
          }]
        }]
      }],
      order: [['created_at', 'ASC'], ['ledger_entry_id', 'ASC']],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlainRows);
  },

  async createSettlementBatch(payload, options = {}) {
    return db.TenantSettlementBatch.create(payload, {
      transaction: options.transaction
    }).then(toPlain);
  },

  async createSettlementBatchItems(items, options = {}) {
    return db.TenantSettlementBatchItem.bulkCreate(items, {
      transaction: options.transaction
    }).then(toPlainRows);
  },

  async createSettlementBatchLedgerItems(items, options = {}) {
    if (!items.length) return [];
    return db.TenantSettlementBatchLedgerItem.bulkCreate(items, {
      transaction: options.transaction
    }).then(toPlainRows);
  },

  findSettlementBatchById(settlementBatchId, options = {}) {
    return db.TenantSettlementBatch.findByPk(settlementBatchId, {
      include: [{
        model: db.TenantSettlementBatchItem,
        as: 'items',
        include: [{
          model: db.TenantRevenueTransaction,
          as: 'revenueTransaction',
          required: true
      }, {
        model: db.TenantSettlementBatchLedgerItem,
        as: 'carryforwardItems',
        include: [{
          model: db.TenantRevenueLedgerEntry,
          as: 'ledgerEntry',
          required: true
        }]
      }]
      }],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  listSettlementBatches(filters = {}, options = {}) {
    const where = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.status) where.status = filters.status;
    return db.TenantSettlementBatch.findAll({
      where,
      include: [
        { model: db.Tenant, as: 'tenant', attributes: ['id', 'name'], required: false }
      ],
      order: [['created_at', 'DESC']],
      limit: options.limit || 100,
      transaction: options.transaction
    }).then(toPlainRows);
  },

  async updateSettlementBatch(settlementBatchId, payload, options = {}) {
    const row = await db.TenantSettlementBatch.findByPk(settlementBatchId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async deleteSettlementBatchItems(settlementBatchId, options = {}) {
    return db.TenantSettlementBatchItem.destroy({
      where: { settlement_batch_id: settlementBatchId },
      transaction: options.transaction
    });
  },

  async deleteSettlementBatchLedgerItems(settlementBatchId, options = {}) {
    return db.TenantSettlementBatchLedgerItem.destroy({
      where: { settlement_batch_id: settlementBatchId },
      transaction: options.transaction
    });
  },

  findPayoutByIdempotency(idempotencyKey, options = {}) {
    return db.TenantPayout.findOne({
      where: { idempotency_key: idempotencyKey },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  async createPayout(payload, options = {}) {
    return db.TenantPayout.create(payload, {
      transaction: options.transaction
    }).then(toPlain);
  },

  async updatePayout(payoutId, payload, options = {}) {
    const row = await db.TenantPayout.findByPk(payoutId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  findPayoutById(payoutId, options = {}) {
    return db.TenantPayout.findByPk(payoutId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  listPayouts(filters = {}, options = {}) {
    const where = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.status) where.status = filters.status;
    if (filters.settlementBatchId) where.settlement_batch_id = filters.settlementBatchId;
    return db.TenantPayout.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options.limit || 100,
      transaction: options.transaction
    }).then(toPlainRows);
  },

  findAdjustmentByIdempotency(idempotencyKey, options = {}) {
    return db.TenantRevenueAdjustment.findOne({
      where: { idempotency_key: idempotencyKey },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findAdjustmentById(adjustmentId, options = {}) {
    return db.TenantRevenueAdjustment.findByPk(adjustmentId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  async createAdjustment(payload, options = {}) {
    return db.TenantRevenueAdjustment.create(payload, {
      transaction: options.transaction
    }).then(toPlain);
  },

  async updateAdjustment(adjustmentId, payload, options = {}) {
    const row = await db.TenantRevenueAdjustment.findByPk(adjustmentId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  listAdjustments(filters = {}, options = {}) {
    const where = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.status) where.status = filters.status;
    return db.TenantRevenueAdjustment.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options.limit || 200,
      transaction: options.transaction
    }).then(toPlainRows);
  },

  async createAuditLog(payload = {}, options = {}) {
    if (!db.AuditLog) return null;
    return db.AuditLog.create({
      user_id: payload.user_id || null,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id || null,
      action: payload.action,
      changes: payload.changes || null,
      ip_address: payload.ip_address || null,
      user_agent: payload.user_agent || 'Tenant Revenue Admin',
      timestamp: new Date()
    }, { transaction: options.transaction }).then(toPlain);
  }
};
