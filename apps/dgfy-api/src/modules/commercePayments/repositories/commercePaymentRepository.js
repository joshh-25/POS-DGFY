import db from '../../../models/index.js';
import { Op } from 'sequelize';

const toPlain = (row) => (row?.get ? row.get({ plain: true }) : row);

const applyCreatedAtWindow = (where, filters = {}) => {
  const from = filters.eventAtFrom || filters.createdAtFrom;
  const to = filters.eventAtTo || filters.createdAtTo;
  if (!from && !to) return where;
  where.created_at = {};
  if (from) where.created_at[Op.gte] = from;
  if (to) where.created_at[Op.lt] = to;
  return where;
};

const buildSessionWhere = (filters = {}) => {
  const where = {};
  if (filters.tenantId) where.tenant_id = filters.tenantId;
  if (Array.isArray(filters.sessionIds)) where.session_id = { [Op.in]: filters.sessionIds };
  if (filters.status) {
    where.status = Array.isArray(filters.status) ? { [Op.in]: filters.status } : filters.status;
  }
  if (filters.targetType) where.target_type = filters.targetType;
  if (filters.provider) where.provider = filters.provider;
  return applyCreatedAtWindow(where, filters);
};

const buildRefundWhere = (filters = {}) => {
  const where = {};
  if (filters.tenantId) where.tenant_id = filters.tenantId;
  if (filters.status) {
    where.status = Array.isArray(filters.status) ? { [Op.in]: filters.status } : filters.status;
  }
  if (filters.provider) where.provider = filters.provider;
  return applyCreatedAtWindow(where, filters);
};

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
    const where = buildSessionWhere(filters);
    return db.CommercePaymentSession.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options.limit || 100,
      offset: options.offset || 0,
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  async countSessions(filters = {}, options = {}) {
    const where = buildSessionWhere(filters);
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

  async listSessionSummary(filters = {}, options = {}) {
    const sequelize = db.sequelize;
    return db.CommercePaymentSession.findAll({
      where: buildSessionWhere(filters),
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('session_id')), 'session_count'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount_centavos')), 0), 'total_amount_centavos'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('platform_fee_centavos')), 0), 'platform_fee_centavos']
      ],
      group: ['status'],
      raw: true,
      transaction: options.transaction
    });
  },

  async listRefundSummary(filters = {}, options = {}) {
    const sequelize = db.sequelize;
    return db.CommercePaymentRefund.findAll({
      where: buildRefundWhere(filters),
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('refund_id')), 'refund_count'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount_centavos')), 0), 'amount_centavos']
      ],
      group: ['status'],
      raw: true,
      transaction: options.transaction
    });
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

  findRefundById(refundId, options = {}) {
    return db.CommercePaymentRefund.findByPk(refundId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findRefundByPublicReference(publicReference, options = {}) {
    return db.CommercePaymentRefund.findOne({
      where: { public_reference: publicReference },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  async claimDueCommercePaymentRefundRetry({
    now = new Date(),
    leaseUntil = new Date(new Date(now).getTime() + 10 * 60 * 1000),
    maxAttempts = 5
  } = {}) {
    const transaction = await db.sequelize.transaction();
    try {
      const row = await db.CommercePaymentRefund.findOne({
        where: {
          status: 'pending',
          failure_code: 'PROVIDER_REFUND_RETRY_SCHEDULED',
          provider_refund_id: null,
          retry_count: { [Op.lte]: maxAttempts },
          next_retry_at: { [Op.lte]: now }
        },
        order: [['next_retry_at', 'ASC'], ['refund_id', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
        skipLocked: true
      });
      if (!row) {
        await transaction.commit();
        return null;
      }

      await row.update({
        last_attempt_at: now,
        next_retry_at: leaseUntil
      }, { transaction });
      await transaction.commit();
      return toPlain(row);
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      throw error;
    }
  },

  listRefundsBySession(paymentSessionId, options = {}) {
    return db.CommercePaymentRefund.findAll({
      where: { payment_session_id: paymentSessionId },
      include: [{
        model: db.CommercePaymentRefund,
        as: 'retryOf',
        attributes: ['refund_id', 'public_reference'],
        required: false
      }],
      order: [['created_at', 'DESC']],
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  async listRefundsForAdmin({ status = [], tenant_id: tenantId = null, limit = 100, offset = 0 } = {}, options = {}) {
    const where = {};
    if (tenantId) where.tenant_id = tenantId;
    if (Array.isArray(status) && status.length > 0) where.status = { [Op.in]: status };
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
    const boundedOffset = Math.max(0, Number(offset) || 0);
    const [rows, total] = await Promise.all([
      db.CommercePaymentRefund.findAll({
        where,
        attributes: [
          'refund_id',
          'public_reference',
          'payment_session_id',
          'retry_of_refund_id',
          'provider_refund_id',
          'provider_payment_id',
          'amount_centavos',
          'currency',
          'reason',
          'notes',
          'refund_strategy',
          'split_refund_payload',
          'status',
          'failure_code',
          'failure_reason',
          'requested_by',
          'created_at',
          'updated_at'
        ],
        include: [
          {
            model: db.CommercePaymentSession,
            as: 'paymentSession',
            attributes: ['public_reference', 'tenant_id', 'store_slug', 'pos_transaction_id', 'status'],
            required: true
          },
          {
            model: db.CommercePaymentRefund,
            as: 'retryOf',
            attributes: ['refund_id', 'public_reference'],
            required: false
          }
        ],
        order: [['created_at', 'DESC'], ['refund_id', 'DESC']],
        limit: boundedLimit,
        offset: boundedOffset,
        transaction: options.transaction
      }),
      db.CommercePaymentRefund.count({ where, transaction: options.transaction })
    ]);

    const refundIds = rows.map((row) => Number(row.refund_id)).filter(Number.isInteger);
    const sessionIds = [...new Set(rows.map((row) => Number(row.payment_session_id)).filter(Number.isInteger))];
    const [children, activeRefundSessions] = refundIds.length > 0
      ? await Promise.all([
        db.CommercePaymentRefund.findAll({
          attributes: ['retry_of_refund_id', 'public_reference'],
          where: { retry_of_refund_id: { [Op.in]: refundIds } },
          raw: true,
          transaction: options.transaction
        }),
        db.CommercePaymentRefund.findAll({
          attributes: ['payment_session_id'],
          where: {
            payment_session_id: { [Op.in]: sessionIds },
            status: { [Op.in]: ['created', 'pending', 'succeeded'] }
          },
          group: ['payment_session_id'],
          raw: true,
          transaction: options.transaction
        })
      ])
      : [[], []];

    const childrenByParent = new Map();
    for (const child of children) {
      const parentId = String(child.retry_of_refund_id);
      const existing = childrenByParent.get(parentId) || [];
      existing.push(child.public_reference);
      childrenByParent.set(parentId, existing);
    }
    const activeSessionIds = new Set(activeRefundSessions.map((row) => String(row.payment_session_id)));

    return {
      refunds: rows.map((row) => {
        const plain = toPlain(row);
        const retryChildren = childrenByParent.get(String(plain.refund_id)) || [];
        const session = plain.paymentSession || null;
        return {
          ...plain,
          retry_of: plain.retryOf?.public_reference || null,
          has_retry: retryChildren.length > 0,
          retry_child_references: retryChildren,
          _has_active_refund: activeSessionIds.has(String(plain.payment_session_id)),
          payment_session: session ? {
            public_reference: session.public_reference,
            tenant_id: session.tenant_id,
            store_slug: session.store_slug,
            pos_transaction_id: session.pos_transaction_id,
            status: session.status
          } : null
        };
      }),
      total: Number(total || 0)
    };
  },

  findRetryChildOf(refundId, options = {}) {
    return db.CommercePaymentRefund.findOne({
      attributes: ['refund_id', 'public_reference', 'status'],
      where: { retry_of_refund_id: refundId },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  findRefundByProviderId(providerRefundId, options = {}) {
    return db.CommercePaymentRefund.findOne({
      where: { provider_refund_id: providerRefundId },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }).then(toPlain);
  },

  listRefunds(filters = {}, options = {}) {
    const where = buildRefundWhere(filters);
    return db.CommercePaymentRefund.findAll({
      where,
      order: [['created_at', 'DESC']],
      transaction: options.transaction
    }).then((rows) => rows.map(toPlain));
  },

  listSessionIdsByRefundStatuses(statuses = [], options = {}) {
    if (!Array.isArray(statuses) || statuses.length === 0) return Promise.resolve([]);
    return db.CommercePaymentRefund.findAll({
      attributes: ['payment_session_id'],
      where: { status: { [Op.in]: statuses } },
      group: ['payment_session_id'],
      raw: true,
      transaction: options.transaction
    }).then((rows) => rows.map((row) => row.payment_session_id));
  },

  listRefundsForReconciliation({ pendingCreatedBefore, limit = 50 } = {}, options = {}) {
    return db.CommercePaymentRefund.findAll({
      where: {
        provider: 'paymongo',
        [Op.or]: [
          { status: 'pending' },
          {
            status: 'created',
            created_at: { [Op.lte]: pendingCreatedBefore }
          }
        ]
      },
      order: [['created_at', 'ASC']],
      limit: Math.max(1, Math.min(Number(limit) || 50, 250)),
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
    const auditPayload = {
      user_id: payload.user_id || null,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id ?? null,
      action: payload.action,
      changes: payload.changes || null,
      ip_address: payload.ip_address || null,
      user_agent: payload.user_agent || 'PayMongo Commerce Admin',
      timestamp: new Date()
    };
    for (const field of ['event_type', 'actor_username', 'reason', 'request_id']) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) auditPayload[field] = payload[field];
    }
    const row = await db.AuditLog.create(auditPayload, { transaction: options.transaction });
    return toPlain(row);
  },

  runInTransaction(callback) {
    return db.sequelize.transaction(callback);
  },

  findTenantById(tenantId, options = {}) {
    return db.Tenant.findByPk(tenantId, { transaction: options.transaction }).then(toPlain);
  }
};
