import crypto from 'node:crypto';
import { QueryTypes } from 'sequelize';
import sequelize from '../../../config/database.js';

const parseJson = (value) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
};

const rowPayload = (row) => row ? { ...row, payload: parseJson(row.payload) } : null;

const idempotencyRow = (row) => row ? { ...row, response: parseJson(row.response) } : null;

const eventRow = (row) => row ? { ...row, payload: parseJson(row.payload) } : null;

const asVersion = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
};

export const dgfyLaundryOrderRepository = {
  async findActiveMapping({ companyId, locationId = null }) {
    const rows = await sequelize.query(`SELECT * FROM dgfy_dglaundry_mappings
      WHERE dgfy_company_id = ? AND status = 'active'
        AND (? = '' OR dgfy_location_id = ?)
      ORDER BY dgfy_location_id LIMIT 1`, {
      replacements: [companyId, locationId || '', locationId || ''], type: QueryTypes.SELECT
    });
    return rows[0] || null;
  },

  async findEvent(eventId) {
    const rows = await sequelize.query('SELECT * FROM dgfy_dglaundry_integration_events WHERE event_id = ? LIMIT 1', {
      replacements: [eventId], type: QueryTypes.SELECT
    });
    return eventRow(rows[0]);
  },

  async recordEvent({ eventId, eventType, companyId = null, locationId = null, aggregateVersion = null, payload, keyId = null }) {
    const existing = await this.findEvent(eventId);
    if (existing) return { row: existing, duplicate: true };
    const id = crypto.randomUUID();
    try {
      await sequelize.query(`INSERT INTO dgfy_dglaundry_integration_events
        (id, event_id, direction, event_type, company_id, location_id, aggregate_version,
         payload, key_id, status, attempts, received_at, updated_at)
        VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, 'received', 0, NOW(), NOW())`, {
        replacements: [id, eventId, eventType, companyId, locationId, aggregateVersion, JSON.stringify(payload), keyId]
      });
    } catch (error) {
      if (!['ER_DUP_ENTRY', '23505'].includes(error?.original?.code) && !['ER_DUP_ENTRY', '23505'].includes(error?.parent?.code)) throw error;
      const raced = await this.findEvent(eventId);
      if (raced) return { row: raced, duplicate: true };
      throw error;
    }
    return { row: await this.findEvent(eventId), duplicate: false };
  },

  async updateEvent(eventId, patch) {
    const fields = [];
    const replacements = [];
    for (const [key, value] of Object.entries(patch || {})) {
      const column = {
        status: 'status', failureCode: 'failure_code', failureReason: 'failure_reason',
        attempts: 'attempts', nextAttemptAt: 'next_attempt_at'
      }[key];
      if (!column) continue;
      fields.push(`${column} = ?`);
      replacements.push(value);
    }
    if (!fields.length) return this.findEvent(eventId);
    fields.push('updated_at = NOW()');
    replacements.push(eventId);
    await sequelize.query(`UPDATE dgfy_dglaundry_integration_events SET ${fields.join(', ')} WHERE event_id = ?`, { replacements });
    return this.findEvent(eventId);
  },

  async listDeadLetters({ companyId, locationId, direction = null, limit = 100 } = {}) {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const rows = [];
    if (!direction || direction === 'inbound') {
      rows.push(...await sequelize.query(`SELECT id, event_id, direction, event_type, company_id, location_id,
        status, attempts, next_attempt_at, failure_code, failure_reason, received_at, updated_at
        FROM dgfy_dglaundry_integration_events WHERE company_id = ? AND location_id = ?
          AND status IN ('dead_letter', 'quarantined') ORDER BY received_at ASC LIMIT ${boundedLimit}`,
      { replacements: [companyId, locationId], type: QueryTypes.SELECT }));
    }
    if (!direction || direction === 'outbound') {
      rows.push(...await sequelize.query(`SELECT id, id AS event_id, direction, operation AS event_type,
        company_id, location_id, status, completion_status, attempts, next_attempt_at,
        COALESCE(completion_failure, failure_code) AS failure_code,
        COALESCE(completion_failure, failure_reason) AS failure_reason,
        created_at AS received_at, updated_at FROM dgfy_dglaundry_outbox
        WHERE company_id = ? AND location_id = ?
          AND (status = 'dead_letter' OR completion_status = 'failed')
        ORDER BY created_at ASC LIMIT ${boundedLimit}`,
      { replacements: [companyId, locationId], type: QueryTypes.SELECT }));
    }
    return rows.sort((a, b) => new Date(a.received_at) - new Date(b.received_at)).slice(0, boundedLimit).map((row) => ({
      id: row.id,
      eventId: row.event_id,
      direction: row.direction,
      type: row.event_type,
      companyId: row.company_id,
      locationId: row.location_id,
      status: row.status,
      completionStatus: row.completion_status || null,
      attempts: Number(row.attempts || 0),
      nextAttemptAt: row.next_attempt_at || null,
      failureCode: String(row.failure_code || '').slice(0, 120),
      failureReason: String(row.failure_reason || '').replace(/(bearer\s+)[^\s,;]+/ig, '$1[redacted]').replace(/(tracking|capability|token)[^,;]*/ig, '[redacted]').slice(0, 500),
      receivedAt: row.received_at,
      updatedAt: row.updated_at
    }));
  },

  async findDeadLetter({ id, companyId, locationId, direction }) {
    const table = direction === 'outbound' ? 'dgfy_dglaundry_outbox' : 'dgfy_dglaundry_integration_events';
    const idPredicate = direction === 'outbound' ? 'id = ?' : '(id = ? OR event_id = ?)';
    const rows = await sequelize.query(`SELECT * FROM ${table} WHERE ${idPredicate}
      AND company_id = ? AND location_id = ?
      AND (status IN ('dead_letter', 'quarantined') OR (direction = 'outbound' AND completion_status = 'failed')) LIMIT 1`, {
      replacements: direction === 'outbound' ? [id, companyId, locationId] : [id, id, companyId, locationId], type: QueryTypes.SELECT
    });
    return direction === 'outbound' ? (rows[0] ? { ...rows[0], payload: parseJson(rows[0].payload), response: parseJson(rows[0].response) } : null) : eventRow(rows[0]);
  },

  async claimInboundRedrive({ eventId, companyId, locationId }) {
    const [result, metadata] = await sequelize.query(`UPDATE dgfy_dglaundry_integration_events SET status = 'redriving', updated_at = NOW()
      WHERE event_id = ? AND company_id = ? AND location_id = ? AND status IN ('dead_letter', 'quarantined')`, {
      replacements: [eventId, companyId, locationId]
    });
    return Number(metadata?.affectedRows || result?.affectedRows || 0) === 1;
  },

  async redriveOutbound({ id, companyId, locationId, maxAttempts = 8 }) {
    const [result, metadata] = await sequelize.query(`UPDATE dgfy_dglaundry_outbox SET status = 'pending', attempts = 0,
      max_attempts = ?, next_attempt_at = NOW(), lease_token = NULL, lease_expires_at = NULL,
      failure_code = NULL, failure_reason = NULL, updated_at = NOW()
      WHERE id = ? AND company_id = ? AND location_id = ? AND status = 'dead_letter'`, {
      replacements: [maxAttempts, id, companyId, locationId]
    });
    return Number(metadata?.affectedRows || result?.affectedRows || 0) === 1;
  },

  async redriveOutboundCompletion({ id, companyId, locationId }) {
    const [result, metadata] = await sequelize.query(`UPDATE dgfy_dglaundry_outbox SET completion_status = 'pending',
      completion_attempts = 0, completion_next_attempt_at = NOW(), completion_lease_token = NULL,
      completion_lease_expires_at = NULL, completion_failure = NULL, updated_at = NOW()
      WHERE id = ? AND company_id = ? AND location_id = ? AND status = 'delivered' AND completion_status = 'failed'`, {
      replacements: [id, companyId, locationId]
    });
    return Number(metadata?.affectedRows || result?.affectedRows || 0) === 1;
  },

  async getCatalog({ companyId, locationId = null }) {
    const rows = await sequelize.query(`SELECT * FROM dgfy_dglaundry_catalog_projections
      WHERE company_id = ? AND (location_id <=> ?) LIMIT 1`, {
      replacements: [companyId, locationId || ''], type: QueryTypes.SELECT
    });
    return rowPayload(rows[0]);
  },

  async upsertCatalog({ companyId, locationId = null, version, payload }) {
    const current = await this.getCatalog({ companyId, locationId });
    if (current && asVersion(current.version_number) >= asVersion(version)) return { row: current, stale: true };
    const id = current?.id || crypto.randomUUID();
    await sequelize.query(`INSERT INTO dgfy_dglaundry_catalog_projections
      (id, company_id, location_id, catalog_version, version_number, payload, status, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'published', NOW(), NOW(), NOW())
      ON DUPLICATE KEY UPDATE catalog_version = VALUES(catalog_version), version_number = VALUES(version_number),
      payload = VALUES(payload), status = VALUES(status), published_at = VALUES(published_at), updated_at = NOW()`, {
      replacements: [id, companyId, locationId || '', String(version), asVersion(version), JSON.stringify(payload)]
    });
    return { row: await this.getCatalog({ companyId, locationId }), stale: false };
  },

  async getAvailability({ companyId, locationId }) {
    const rows = await sequelize.query(`SELECT * FROM dgfy_dglaundry_availability_projections
      WHERE company_id = ? AND location_id = ? LIMIT 1`, {
      replacements: [companyId, locationId], type: QueryTypes.SELECT
    });
    return rowPayload(rows[0]);
  },

  async upsertAvailability({ companyId, locationId, version, payload }) {
    const current = await this.getAvailability({ companyId, locationId });
    if (current && asVersion(current.version_number) >= asVersion(version)) return { row: current, stale: true };
    const id = current?.id || crypto.randomUUID();
    await sequelize.query(`INSERT INTO dgfy_dglaundry_availability_projections
      (id, company_id, location_id, availability_version, version_number, payload, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'published', NOW(), NOW())
      ON DUPLICATE KEY UPDATE availability_version = VALUES(availability_version), version_number = VALUES(version_number),
      payload = VALUES(payload), status = VALUES(status), updated_at = NOW()`, {
      replacements: [id, companyId, locationId, String(version), asVersion(version), JSON.stringify(payload)]
    });
    return { row: await this.getAvailability({ companyId, locationId }), stale: false };
  },

  async getOrder({ companyId, locationId, externalOrderReference }) {
    const rows = await sequelize.query(`SELECT * FROM dgfy_dglaundry_order_projections
      WHERE company_id = ? AND location_id = ? AND external_order_reference = ? LIMIT 1`, {
      replacements: [companyId, locationId, externalOrderReference], type: QueryTypes.SELECT
    });
    return rowPayload(rows[0]);
  },

  // Customer reads and mutations must always include the immutable DGFY
  // account id.  Company membership alone is not order ownership: another
  // member of the same company must not be able to enumerate or mutate a
  // customer's order by guessing its external reference.
  async getOrderForAccount({ companyId, locationId, externalOrderReference, dgfyAccountId }) {
    const rows = await sequelize.query(`SELECT * FROM dgfy_dglaundry_order_projections
      WHERE company_id = ? AND location_id = ? AND external_order_reference = ?
        AND dgfy_account_id = ? LIMIT 1`, {
      replacements: [companyId, locationId, externalOrderReference, dgfyAccountId], type: QueryTypes.SELECT
    });
    return rowPayload(rows[0]);
  },

  async getOrderByTrackingReference({ companyId, locationId, externalOrderReference, externalTrackingReference }) {
    const rows = await sequelize.query(`SELECT * FROM dgfy_dglaundry_order_projections
      WHERE company_id = ? AND location_id = ? AND external_order_reference = ?
        AND external_tracking_reference = ? LIMIT 1`, {
      replacements: [companyId, locationId, externalOrderReference, externalTrackingReference], type: QueryTypes.SELECT
    });
    return rowPayload(rows[0]);
  },

  // Bind ownership before sending a submit event.  The unique scope key makes
  // the claim race-safe; the no-op duplicate update deliberately never
  // changes an existing owner (including an unowned provider/counter row).
  async bindOrderOwnership({ companyId, locationId, externalOrderReference, externalTrackingReference, dgfyAccountId = null }) {
    const existing = await this.getOrder({ companyId, locationId, externalOrderReference });
    if (!existing) {
      try {
        await sequelize.query(`INSERT INTO dgfy_dglaundry_order_projections
          (id, company_id, location_id, external_order_reference, external_tracking_reference,
           dgfy_account_id, aggregate_version, status, payload, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, 'pending_submission', JSON_OBJECT(), NOW(), NOW())
          ON DUPLICATE KEY UPDATE external_order_reference = VALUES(external_order_reference)`, {
          replacements: [crypto.randomUUID(), companyId, locationId, externalOrderReference, externalTrackingReference, dgfyAccountId]
        });
      } catch (error) {
        const duplicateCode = error?.original?.code || error?.parent?.code;
        if (!['ER_DUP_ENTRY', '23505'].includes(duplicateCode)) throw error;
      }
    }
    const row = await this.getOrder({ companyId, locationId, externalOrderReference });
    if (!row
      || row.external_tracking_reference !== externalTrackingReference
      || (row.dgfy_account_id || null) !== (dgfyAccountId || null)) return null;
    return row;
  },

  async getCustomerActivity({ companyId, locationId, activityReference }) {
    const rows = await sequelize.query(`SELECT * FROM dgfy_dglaundry_customer_activity_projections
      WHERE company_id = ? AND location_id = ? AND activity_reference = ? LIMIT 1`, {
      replacements: [companyId, locationId, activityReference], type: QueryTypes.SELECT
    });
    return rowPayload(rows[0]);
  },

  async upsertCustomerActivity({ companyId, locationId, activityReference, version, payload }) {
    const current = await this.getCustomerActivity({ companyId, locationId, activityReference });
    if (current && asVersion(current.version_number) >= asVersion(version)) return { row: current, stale: true };
    const id = current?.id || crypto.randomUUID();
    await sequelize.query(`INSERT INTO dgfy_dglaundry_customer_activity_projections
      (id, company_id, location_id, activity_reference, version_number, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE version_number = VALUES(version_number), payload = VALUES(payload), updated_at = NOW()`, {
      replacements: [id, companyId, locationId, activityReference, asVersion(version), JSON.stringify(payload)]
    });
    return { row: await this.getCustomerActivity({ companyId, locationId, activityReference }), stale: false };
  },

  async upsertOrder({ companyId, locationId, externalOrderReference, trackingReference = null, version, status, payload }) {
    const current = await this.getOrder({ companyId, locationId, externalOrderReference });
    if (current && asVersion(current.aggregate_version) >= asVersion(version)) return { row: current, stale: true };
    const id = current?.id || crypto.randomUUID();
    await sequelize.query(`INSERT INTO dgfy_dglaundry_order_projections
      (id, company_id, location_id, external_order_reference, external_tracking_reference,
       aggregate_version, status, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE external_tracking_reference = VALUES(external_tracking_reference),
       aggregate_version = VALUES(aggregate_version), status = VALUES(status), payload = VALUES(payload), updated_at = NOW()`, {
      replacements: [id, companyId, locationId, externalOrderReference, trackingReference, asVersion(version), status, JSON.stringify(payload)]
    });
    return { row: await this.getOrder({ companyId, locationId, externalOrderReference }), stale: false };
  },

  async findIdempotency(key) {
    const rows = await sequelize.query('SELECT * FROM dgfy_dglaundry_order_idempotency WHERE idempotency_key = ? LIMIT 1', {
      replacements: [key], type: QueryTypes.SELECT
    });
    return idempotencyRow(rows[0]);
  },

  async saveIdempotency({ key, requestHash: hash, operation, response }) {
    try {
      await sequelize.query(`INSERT INTO dgfy_dglaundry_order_idempotency
        (id, idempotency_key, request_hash, operation, response, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())`, {
        replacements: [crypto.randomUUID(), key, hash, operation, JSON.stringify(response)]
      });
    } catch (error) {
      if (!['ER_DUP_ENTRY', '23505'].includes(error?.original?.code || error?.parent?.code || error?.code)) throw error;
    }
    return this.findIdempotency(key);
  },

  async updateIdempotencyResponse(key, response) {
    await sequelize.query('UPDATE dgfy_dglaundry_order_idempotency SET response = ? WHERE idempotency_key = ?', {
      replacements: [JSON.stringify(response), key]
    });
    return this.findIdempotency(key);
  }
};
