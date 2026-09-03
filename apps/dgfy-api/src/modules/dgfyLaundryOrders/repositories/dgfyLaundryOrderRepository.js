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

  async listDeadLetters({ limit = 100 } = {}) {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const rows = await sequelize.query(`SELECT * FROM dgfy_dglaundry_integration_events
      WHERE status IN ('dead_letter', 'quarantined') ORDER BY received_at ASC LIMIT ${boundedLimit}`, {
      type: QueryTypes.SELECT
    });
    return rows.map(eventRow);
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

  // Bind ownership before sending a submit event.  The unique scope key makes
  // the claim race-safe; the no-op duplicate update deliberately never
  // changes an existing owner (including an unowned provider/counter row).
  async bindOrderOwnership({ companyId, locationId, externalOrderReference, dgfyAccountId }) {
    const existing = await this.getOrder({ companyId, locationId, externalOrderReference });
    if (!existing) {
      try {
        await sequelize.query(`INSERT INTO dgfy_dglaundry_order_projections
          (id, company_id, location_id, external_order_reference, external_tracking_reference,
           dgfy_account_id, aggregate_version, status, payload, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, ?, 0, 'pending_submission', JSON_OBJECT(), NOW(), NOW())
          ON DUPLICATE KEY UPDATE external_order_reference = VALUES(external_order_reference)`, {
          replacements: [crypto.randomUUID(), companyId, locationId, externalOrderReference, dgfyAccountId]
        });
      } catch (error) {
        const duplicateCode = error?.original?.code || error?.parent?.code;
        if (!['ER_DUP_ENTRY', '23505'].includes(duplicateCode)) throw error;
      }
    }
    return this.getOrder({ companyId, locationId, externalOrderReference });
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
    await sequelize.query(`INSERT INTO dgfy_dglaundry_order_idempotency
      (id, idempotency_key, request_hash, operation, response, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())`, {
      replacements: [crypto.randomUUID(), key, hash, operation, JSON.stringify(response)]
    });
    return this.findIdempotency(key);
  }
};
