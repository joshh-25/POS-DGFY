import crypto from 'node:crypto';
import { QueryTypes } from 'sequelize';
import sequelize from '../../../config/database.js';

const parse = (value) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
};
const map = (row) => row ? { ...row, payload: parse(row.payload), response: row.response ? parse(row.response) : null } : null;
const duplicate = (error) => ['ER_DUP_ENTRY', '23505'].includes(error?.original?.code || error?.parent?.code || error?.code);

export const dgfyLaundryOutboxRepository = {
  async enqueue({ companyId, locationId, operation, idempotencyKey, requestHash, payload, eventId = null, callerIdempotencyKey = null, orderReference = null, groupReference = null, sequenceNumber = null, maxAttempts = 8, operationDeadline = null, completion = null }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = crypto.randomUUID();
      try {
        await sequelize.transaction(async (transaction) => {
          let sequence = sequenceNumber;
          if (sequence === null && orderReference) {
            const [rows] = await sequelize.query(`SELECT COALESCE(MAX(sequence_number), -1) + 1 AS next_sequence
              FROM dgfy_dglaundry_outbox WHERE company_id = ? AND location_id = ? AND order_reference = ? FOR UPDATE`, {
              replacements: [companyId, locationId, orderReference], transaction
            });
            sequence = Number(rows?.[0]?.next_sequence || 0);
          }
          await sequelize.query(`INSERT INTO dgfy_dglaundry_outbox
            (id, company_id, location_id, operation, idempotency_key, request_hash, payload, event_id,
             order_reference, group_reference, sequence_number, status, attempts, max_attempts,
             caller_idempotency_key,
             next_attempt_at, operation_deadline, completion_type, completion_reference,
             completion_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, NOW(), ?, ?, ?, ?, NOW(), NOW())`, {
            replacements: [id, companyId, locationId, operation, idempotencyKey, requestHash, JSON.stringify(payload), eventId, orderReference, groupReference, sequence ?? 0, maxAttempts, callerIdempotencyKey, operationDeadline, completion?.type || null, completion?.reference || null, completion ? 'pending' : 'none'],
            transaction
          });
        });
        return { row: await this.findById(id), created: true };
      } catch (error) {
        if (!duplicate(error)) throw error;
        const row = await this.findByIdentity({ operation, idempotencyKey });
        if (row) return { row, created: false };
        if (attempt === 2) throw error;
      }
    }
    throw new Error('DGLAUNDRY_OUTBOX_SEQUENCE_ALLOCATION_FAILED');
  },

  async findById(id) {
    const rows = await sequelize.query('SELECT * FROM dgfy_dglaundry_outbox WHERE id = ? LIMIT 1', { replacements: [id], type: QueryTypes.SELECT });
    return map(rows[0]);
  },

  async findByIdentity({ operation, idempotencyKey }) {
    const rows = await sequelize.query('SELECT * FROM dgfy_dglaundry_outbox WHERE operation = ? AND idempotency_key = ? LIMIT 1', { replacements: [operation, idempotencyKey], type: QueryTypes.SELECT });
    return map(rows[0]);
  },

  async hasCancellationIntent(orderReference, companyId, locationId) {
    if (!orderReference) return false;
    const rows = await sequelize.query(`SELECT id FROM dgfy_dglaundry_outbox
      WHERE company_id = ? AND location_id = ? AND order_reference = ?
        AND operation = 'cancelOrder' AND status <> 'cancelled' LIMIT 1`, {
      replacements: [companyId, locationId, orderReference], type: QueryTypes.SELECT
    });
    return rows.length > 0;
  },

  async claim(id, leaseSeconds = 30) {
    const token = crypto.randomUUID();
    const [result, metadata] = await sequelize.query(`UPDATE dgfy_dglaundry_outbox
      SET status = 'leased', lease_token = ?, lease_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
          attempts = attempts + 1, updated_at = NOW()
      WHERE id = ? AND attempts < max_attempts
        AND (status IN ('pending', 'retry_wait') AND next_attempt_at <= NOW()
             OR status = 'leased' AND lease_expires_at < NOW())
        AND (order_reference IS NULL OR NOT EXISTS (
          SELECT 1 FROM (SELECT id, company_id, location_id, order_reference, sequence_number, status FROM dgfy_dglaundry_outbox) prior
          WHERE prior.company_id = dgfy_dglaundry_outbox.company_id
            AND prior.location_id = dgfy_dglaundry_outbox.location_id
            AND prior.order_reference = dgfy_dglaundry_outbox.order_reference
            AND prior.sequence_number < dgfy_dglaundry_outbox.sequence_number
            AND prior.status NOT IN ('delivered', 'cancelled')
        ))`, { replacements: [token, leaseSeconds, id] });
    if (!(metadata?.affectedRows || result?.affectedRows)) return null;
    return { row: await this.findById(id), token };
  },

  async claimDue(limit = 10, leaseSeconds = 30) {
    const candidates = await sequelize.query(`SELECT id FROM dgfy_dglaundry_outbox o
      WHERE o.attempts < o.max_attempts
        AND ((o.status IN ('pending', 'retry_wait') AND o.next_attempt_at <= NOW())
          OR (o.status = 'leased' AND o.lease_expires_at < NOW()))
        AND (o.order_reference IS NULL OR NOT EXISTS (
          SELECT 1 FROM dgfy_dglaundry_outbox prior
          WHERE prior.company_id = o.company_id AND prior.location_id = o.location_id
            AND prior.order_reference = o.order_reference AND prior.sequence_number < o.sequence_number
            AND prior.status NOT IN ('delivered', 'cancelled')
        )) ORDER BY o.next_attempt_at, o.created_at LIMIT ${Math.max(1, Math.min(25, Number(limit) || 10))}`, { type: QueryTypes.SELECT });
    const claims = [];
    for (const candidate of candidates) {
      const claim = await this.claim(candidate.id, leaseSeconds);
      if (claim) claims.push(claim);
    }
    return claims;
  },

  async acknowledge({ id, token, status, response = null, failureCode = null, failureReason = null, nextAttemptAt = null }) {
    await sequelize.query(`UPDATE dgfy_dglaundry_outbox SET status = ?, response = ?, failure_code = ?,
      failure_reason = ?, next_attempt_at = COALESCE(?, next_attempt_at), lease_token = NULL,
      lease_expires_at = NULL, delivered_at = IF(? = 'delivered', NOW(), delivered_at), updated_at = NOW()
      WHERE id = ? AND status = 'leased' AND lease_token = ?`, {
      replacements: [status, response ? JSON.stringify(response) : null, failureCode, failureReason, nextAttemptAt, status, id, token]
    });
    return this.findById(id);
  },

  async markExhausted() {
    await sequelize.query(`UPDATE dgfy_dglaundry_outbox SET status = 'dead_letter',
      failure_code = COALESCE(failure_code, 'DGLAUNDRY_RETRY_EXHAUSTED'),
      failure_reason = COALESCE(failure_reason, 'The bounded delivery attempt budget was exhausted.'), updated_at = NOW()
      WHERE status IN ('pending', 'retry_wait', 'leased') AND attempts >= max_attempts AND (lease_expires_at IS NULL OR lease_expires_at < NOW())`);
    await sequelize.query(`UPDATE dgfy_dglaundry_outbox SET completion_status = 'failed',
      completion_failure = COALESCE(completion_failure, 'The bounded completion attempt budget was exhausted.'),
      completion_lease_token = NULL, completion_lease_expires_at = NULL, updated_at = NOW()
      WHERE completion_status = 'processing' AND completion_attempts >= 8 AND completion_lease_expires_at < NOW()`);
  },

  async claimPendingCompletions(limit = 10, leaseSeconds = 30) {
    const candidates = await sequelize.query(`SELECT id FROM dgfy_dglaundry_outbox
      WHERE status = 'delivered' AND completion_type IS NOT NULL
        AND completion_attempts < 8 AND completion_next_attempt_at <= NOW()
        AND (completion_status = 'pending' OR (completion_status = 'processing' AND completion_lease_expires_at < NOW()))
      ORDER BY completion_next_attempt_at LIMIT ${Math.max(1, Math.min(25, Number(limit) || 10))}`, { type: QueryTypes.SELECT });
    const claims = [];
    for (const candidate of candidates) {
      const token = crypto.randomUUID();
      const [result, metadata] = await sequelize.query(`UPDATE dgfy_dglaundry_outbox
        SET completion_status = 'processing', completion_attempts = completion_attempts + 1,
            completion_lease_token = ?, completion_lease_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND), updated_at = NOW()
        WHERE id = ? AND status = 'delivered'
          AND completion_attempts < 8 AND completion_next_attempt_at <= NOW()
          AND (completion_status = 'pending' OR (completion_status = 'processing' AND completion_lease_expires_at < NOW()))`, {
        replacements: [token, leaseSeconds, candidate.id]
      });
      if (!(metadata?.affectedRows || result?.affectedRows)) continue;
      claims.push({ row: await this.findById(candidate.id), token });
    }
    return claims;
  },

  async acknowledgeCompletion({ id, token, completed, failure = null, retryDelayMs = 5000 }) {
    await sequelize.query(`UPDATE dgfy_dglaundry_outbox SET completion_status =
        IF(? = 1, 'completed', IF(completion_attempts >= 8, 'failed', 'pending')),
      completion_failure = ?,
      completion_next_attempt_at = IF(? = 1, NOW(), DATE_ADD(NOW(), INTERVAL ? MICROSECOND)),
      completion_lease_token = NULL, completion_lease_expires_at = NULL, updated_at = NOW()
      WHERE id = ? AND completion_status = 'processing' AND completion_lease_token = ?`, {
      replacements: [completed ? 1 : 0, failure ? String(failure).slice(0, 1000) : null, completed ? 1 : 0, Math.max(1000, retryDelayMs) * 1000, id, token]
    });
    return this.findById(id);
  },

  async completeCallerReconciliation(eventId) {
    await sequelize.query(`UPDATE dgfy_dglaundry_outbox SET completion_status = 'completed', completion_lease_token = NULL,
      completion_lease_expires_at = NULL, completion_failure = NULL, updated_at = NOW()
      WHERE event_id = ? AND completion_type IS NOT NULL`, { replacements: [eventId] });
  }
};
