import db from '../../../models/index.js';
import { Op } from 'sequelize';

const toPlain = (row) => (row?.get ? row.get({ plain: true }) : row);

export const commercePaymentRepository = {
  findTenantPaymentAccount({ tenantId, provider = 'paymongo' } = {}, options = {}) {
    return db.TenantPaymentAccount.findOne({
      where: { tenant_id: tenantId, provider },
      transaction: options.transaction
    }).then(toPlain);
  },

  findTenantPaymentAccountByProviderMerchantId(providerMerchantId, options = {}) {
    return db.TenantPaymentAccount.findOne({
      where: {
        provider: 'paymongo',
        provider_merchant_id: providerMerchantId
      },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  async upsertTenantPaymentAccount(payload = {}, options = {}) {
    const where = {
      tenant_id: payload.tenant_id,
      provider: payload.provider || 'paymongo'
    };
    const existing = await db.TenantPaymentAccount.findOne({
      where,
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (existing) {
      await existing.update(payload, { transaction: options.transaction });
      return toPlain(existing);
    }
    const row = await db.TenantPaymentAccount.create(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  listTenantPaymentAccounts({ tenantId = null, provider = 'paymongo' } = {}, options = {}) {
    const where = { provider };
    if (tenantId) where.tenant_id = tenantId;
    return db.TenantPaymentAccount.findAll({
      where,
      order: [['updated_at', 'DESC']],
      limit: options.limit || 100,
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  findSessionByIdempotency({ tenantId, targetType = 'store_checkout', idempotencyKey } = {}, options = {}) {
    return db.CommercePaymentSession.findOne({
      where: {
        tenant_id: tenantId,
        target_type: targetType,
        idempotency_key: idempotencyKey
      },
      transaction: options.transaction
    }).then(toPlain);
  },

  findSessionByPublicReference(publicReference, options = {}) {
    return db.CommercePaymentSession.findOne({
      where: { public_reference: publicReference },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findSessionBySessionId(sessionId, options = {}) {
    return db.CommercePaymentSession.findByPk(sessionId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  listSessions(filters = {}, options = {}) {
    const where = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.status) {
      where.status = Array.isArray(filters.status) ? { [Op.in]: filters.status } : filters.status;
    }
    if (filters.targetType) where.target_type = filters.targetType;
    if (filters.provider) where.provider = filters.provider;
    return db.CommercePaymentSession.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options.limit || 100,
      offset: options.offset || 0,
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  async countSessions(filters = {}, options = {}) {
    const where = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.status) {
      where.status = Array.isArray(filters.status) ? { [Op.in]: filters.status } : filters.status;
    }
    if (filters.targetType) where.target_type = filters.targetType;
    if (filters.provider) where.provider = filters.provider;
    return db.CommercePaymentSession.count({
      where,
      transaction: options.transaction
    });
  },

  findSessionByProviderPaymentIntent(providerPaymentIntentId, options = {}) {
    return db.CommercePaymentSession.findOne({
      where: { provider_payment_intent_id: providerPaymentIntentId },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findSessionByProviderPayment(providerPaymentId, options = {}) {
    return db.CommercePaymentSession.findOne({
      where: { provider_payment_id: providerPaymentId },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findSessionByProviderEventId(providerEventId, options = {}) {
    return db.CommercePaymentSession.findOne({
      where: { provider_event_id: providerEventId },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findSessionByTenantAndPosTransaction({ tenantId, posTransactionId } = {}, options = {}) {
    return db.CommercePaymentSession.findOne({
      where: {
        tenant_id: tenantId,
        pos_transaction_id: posTransactionId
      },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  async createSession(payload = {}, options = {}) {
    const row = await db.CommercePaymentSession.create(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async updateSessionById(sessionId, payload = {}, options = {}) {
    const row = await db.CommercePaymentSession.findByPk(sessionId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async createRefund(payload = {}, options = {}) {
    const row = await db.CommercePaymentRefund.create(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async updateRefundById(refundId, payload = {}, options = {}) {
    const row = await db.CommercePaymentRefund.findByPk(refundId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  listRefundsBySession(paymentSessionId, options = {}) {
    return db.CommercePaymentRefund.findAll({
      where: { payment_session_id: paymentSessionId },
      order: [['created_at', 'DESC']],
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  findRefundByProviderId(providerRefundId, options = {}) {
    return db.CommercePaymentRefund.findOne({
      where: { provider_refund_id: providerRefundId },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  listRefunds(filters = {}, options = {}) {
    const where = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.status) {
      where.status = Array.isArray(filters.status) ? { [Op.in]: filters.status } : filters.status;
    }
    if (filters.provider) where.provider = filters.provider;
    return db.CommercePaymentRefund.findAll({
      where,
      order: [['created_at', 'DESC']],
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  async sumRefundedCentavos(paymentSessionId, options = {}) {
    return this.sumRefundCentavosByStatuses(paymentSessionId, ['pending', 'succeeded'], options);
  },

  async sumRefundCentavosByStatuses(paymentSessionId, statuses = ['pending', 'succeeded'], options = {}) {
    const total = await db.CommercePaymentRefund.sum('amount_centavos', {
      where: {
        payment_session_id: paymentSessionId,
        status: { [Op.in]: statuses }
      },
      transaction: options.transaction
    });
    return Number(total || 0);
  },

  async createAuditLog(payload = {}, options = {}) {
    if (!db.AuditLog) return null;
    const row = await db.AuditLog.create({
      user_id: payload.user_id || null,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id || null,
      action: payload.action,
      changes: payload.changes || null,
      ip_address: payload.ip_address || null,
      user_agent: payload.user_agent || 'PayMongo Commerce Admin',
      timestamp: new Date()
    }, { transaction: options.transaction });
    return toPlain(row);
  },

  runInTransaction(callback) {
    return db.sequelize.transaction(callback);
  },

  findTenantById(tenantId, options = {}) {
    return db.Tenant.findByPk(tenantId, { transaction: options.transaction }).then(toPlain);
  }
};
