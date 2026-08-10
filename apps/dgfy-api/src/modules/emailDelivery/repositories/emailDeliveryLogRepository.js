import { Op } from 'sequelize';
import { EmailDeliveryLog } from '../../../models/index.js';
import { hashRecipientEmail, extractRecipientDomain, splitRecipients } from '../utils/emailAddress.js';

const toPlain = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);

// Re-exported for backward compatibility with existing importers of this
// file; the canonical definitions live in ../utils/emailAddress.js so
// emailService.js can use them without statically importing the model layer.
export { hashRecipientEmail, extractRecipientDomain, splitRecipients };

export const emailDeliveryLogRepository = {
  /**
   * @param {Object} payload - Snake_case fields matching EmailDeliveryLog's
   *   attributes directly (the model is underscored:true with snake_case
   *   JS-side attribute names, e.g. `sent_at`, `recipient_email_hash`).
   * @returns {Promise<Object|null>} Plain object, or null if the write failed
   *   (never throws -- a logging failure must never break the send it's
   *   recording).
   */
  async create(payload) {
    const row = await EmailDeliveryLog.create(payload);
    return toPlain(row);
  },

  async findById(id) {
    if (!id) return null;
    const row = await EmailDeliveryLog.findByPk(id);
    return toPlain(row);
  },

  async findByMessageId(messageId) {
    if (!messageId) return null;
    const row = await EmailDeliveryLog.findOne({ where: { message_id: messageId } });
    return toPlain(row);
  },

  /**
   * Flips a log row to a bounce/deferral outcome. Idempotent at the
   * database layer: the WHERE clause only matches rows that haven't
   * already recorded a bounce, so a reprocessed or out-of-order DSN is a
   * safe no-op regardless of what the IMAP mailbox side has or hasn't
   * marked read.
   * @returns {Promise<boolean>} Whether this call was the one that recorded it.
   */
  async recordBounceResult(id, {
    status,
    bounceType,
    bounceStatusCode = null,
    bounceDiagnostic = null,
    bounceSourceRef = null,
    bounceReportedAt = new Date()
  }) {
    const [affected] = await EmailDeliveryLog.update({
      status,
      bounce_type: bounceType,
      bounce_status_code: bounceStatusCode,
      bounce_diagnostic: bounceDiagnostic,
      bounce_source_ref: bounceSourceRef,
      bounce_reported_at: bounceReportedAt
    }, {
      where: {
        id,
        bounce_reported_at: null
      }
    });
    return affected > 0;
  },

  /**
   * PII redaction stage of the retention prune (issue #279): nulls the raw
   * address/subject but keeps recipient_email_hash/recipient_domain so
   * per-address and per-domain deliverability analysis still works.
   * @returns {Promise<number>} Rows redacted.
   */
  async redactPiiOlderThan(cutoffDate, { limit = 1000 } = {}) {
    const candidates = await EmailDeliveryLog.findAll({
      where: {
        sent_at: { [Op.lt]: cutoffDate },
        pii_redacted_at: null
      },
      attributes: ['id'],
      limit,
      order: [['sent_at', 'ASC']]
    });
    if (!candidates.length) return 0;

    const [affected] = await EmailDeliveryLog.update({
      recipient_email: null,
      from_email: null,
      subject: null,
      pii_redacted_at: new Date()
    }, {
      where: { id: { [Op.in]: candidates.map((row) => row.id) } }
    });
    return affected;
  },

  /**
   * Hard-delete stage of the retention prune. Runs well after PII
   * redaction (a separate, longer window) so deliverability trend data
   * outlives the raw addresses it was derived from.
   * @returns {Promise<number>} Rows deleted.
   */
  async destroyOlderThan(cutoffDate, { limit = 1000 } = {}) {
    const candidates = await EmailDeliveryLog.findAll({
      where: { sent_at: { [Op.lt]: cutoffDate } },
      attributes: ['id'],
      limit,
      order: [['sent_at', 'ASC']]
    });
    if (!candidates.length) return 0;

    return EmailDeliveryLog.destroy({
      where: { id: { [Op.in]: candidates.map((row) => row.id) } }
    });
  },

  /**
   * Paginated, filterable list for the admin delivery-monitor view.
   * `recipient` filters by the hash column, never a LIKE against
   * recipient_email -- redacted rows must still be excludable/includable
   * consistently once the raw address is gone.
   */
  async list({
    status,
    purpose,
    recipientDomain,
    recipient,
    subjectContains,
    sentFrom,
    sentTo,
    page = 1,
    limit = 25
  } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const where = {};

    if (status) where.status = status;
    if (purpose) where.purpose = purpose;
    if (recipientDomain) where.recipient_domain = String(recipientDomain).trim().toLowerCase();
    if (recipient) where.recipient_email_hash = hashRecipientEmail(recipient);
    if (subjectContains) where.subject = { [Op.substring]: subjectContains };
    if (sentFrom || sentTo) {
      where.sent_at = {};
      if (sentFrom) where.sent_at[Op.gte] = new Date(sentFrom);
      if (sentTo) where.sent_at[Op.lte] = new Date(sentTo);
    }

    const { rows, count } = await EmailDeliveryLog.findAndCountAll({
      where,
      order: [['sent_at', 'DESC']],
      limit: safeLimit,
      offset: (safePage - 1) * safeLimit
    });

    return {
      items: rows.map(toPlain),
      total: count,
      page: safePage,
      limit: safeLimit
    };
  },

  /**
   * Grouped counts by status and by recipient domain over a window -- the
   * one-query answer to "yahoo.com: 0 sent / 41 failed" that would have
   * surfaced #135 immediately.
   */
  async summary({ sentFrom, sentTo } = {}) {
    const where = {};
    if (sentFrom || sentTo) {
      where.sent_at = {};
      if (sentFrom) where.sent_at[Op.gte] = new Date(sentFrom);
      if (sentTo) where.sent_at[Op.lte] = new Date(sentTo);
    }

    const [byStatus, byDomain] = await Promise.all([
      EmailDeliveryLog.findAll({
        where,
        attributes: ['status', [EmailDeliveryLog.sequelize.fn('COUNT', EmailDeliveryLog.sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true
      }),
      EmailDeliveryLog.findAll({
        where,
        attributes: [
          'recipient_domain',
          'status',
          [EmailDeliveryLog.sequelize.fn('COUNT', EmailDeliveryLog.sequelize.col('id')), 'count']
        ],
        group: ['recipient_domain', 'status'],
        raw: true
      })
    ]);

    return { by_status: byStatus, by_domain_status: byDomain };
  }
};

export default emailDeliveryLogRepository;
