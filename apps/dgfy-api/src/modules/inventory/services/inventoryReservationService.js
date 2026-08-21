import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const EPSILON = 0.000001;
const DEFAULT_TTL_MINUTES = 30;

const positiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const getOptionalModel = (name) => {
  try {
    return dbStore.get(name) || null;
  } catch {
    return null;
  }
};

const requireModels = () => {
  const InventoryReservation = getOptionalModel('InventoryReservation');
  const InventoryReservationLine = getOptionalModel('InventoryReservationLine');
  const ItemLocationStock = getOptionalModel('ItemLocationStock');
  if (!InventoryReservation || !InventoryReservationLine || !ItemLocationStock) {
    throw new DomainError(
      DomainErrorCode.SERVICE_UNAVAILABLE,
      'Inventory reservation schema is not available. Run the tenant migrations before accepting online orders.',
      {
        statusCode: 503,
        details: { reason_code: 'INVENTORY_RESERVATION_SCHEMA_UNAVAILABLE' }
      }
    );
  }
  return { InventoryReservation, InventoryReservationLine, ItemLocationStock };
};

const getReservationTtlMinutes = () => {
  const configured = Number.parseInt(process.env.ONLINE_INVENTORY_RESERVATION_TTL_MINUTES, 10);
  if (!Number.isInteger(configured) || configured <= 0) return DEFAULT_TTL_MINUTES;
  return Math.min(configured, 24 * 60);
};

const normalizedEffects = (effects = [], locationId) => {
  const normalizedLocationId = positiveInt(locationId);
  const normalized = [];
  for (const effect of Array.isArray(effects) ? effects : []) {
    const itemId = positiveInt(effect?.item_id);
    const quantity = Number(effect?.quantity || 0);
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) continue;
    normalized.push({
      item_id: itemId,
      quantity: round4(quantity),
      effect_type: effect?.effect_type || 'line_item',
      source_line_reference: String(effect?.source_line_reference || `item-${itemId}`),
      metadata: effect?.metadata || null
    });
  }
  const totalsByItem = new Map();
  for (const effect of normalized) {
    totalsByItem.set(effect.item_id, round4((totalsByItem.get(effect.item_id) || 0) + effect.quantity));
  }
  return {
    locationId: normalizedLocationId,
    effects: normalized,
    totalsByItem
  };
};

const expireActiveReservations = async ({ InventoryReservation, transaction, now }) => {
  await InventoryReservation.update(
    {
      status: 'expired',
      released_at: now,
      release_reason: 'expired'
    },
    {
      where: {
        source_type: 'online_order',
        status: 'active',
        expires_at: { [Op.lte]: now }
      },
      transaction
    }
  );
};

const buildShortfallError = ({ locationId, violations }) => new DomainError(
  DomainErrorCode.VALIDATION_FAILED,
  'The selected items are no longer available in the requested quantity.',
  {
    statusCode: 422,
    details: {
      reason_code: 'ONLINE_STOCK_RESERVATION_SHORTFALL',
      location_id: locationId,
      stock_violations: violations
    }
  }
);

export const buildInventoryReservationService = ({ resolveModels = requireModels } = {}) => ({
  async reserveOnlineOrderInventory({
    sourceId,
    locationId,
    effects = [],
    transaction,
    expiresAt = null
  } = {}) {
    const normalizedSourceId = positiveInt(sourceId);
    const {
      locationId: normalizedLocationId,
      effects: normalizedEffectsList,
      totalsByItem
    } = normalizedEffects(effects, locationId);
    if (!normalizedSourceId || !normalizedLocationId || normalizedEffectsList.length === 0) {
      return { status: 'skipped', reservation: null };
    }
    if (!transaction) {
      throw new DomainError(
        DomainErrorCode.CONFLICT,
        'Online inventory reservations require the checkout transaction.',
        { statusCode: 409, details: { reason_code: 'INVENTORY_RESERVATION_TRANSACTION_REQUIRED' } }
      );
    }

    const { InventoryReservation, InventoryReservationLine, ItemLocationStock } = resolveModels();
    const now = new Date();
    await expireActiveReservations({ InventoryReservation, transaction, now });

    const existing = await InventoryReservation.findOne({
      where: { source_type: 'online_order', source_id: normalizedSourceId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existing) {
      if (existing.status === 'active' || existing.status === 'converted') {
        return { status: existing.status, reservation: existing };
      }
      throw new DomainError(
        DomainErrorCode.CONFLICT,
        'This online order already has a closed inventory reservation.',
        { statusCode: 409, details: { reason_code: 'INVENTORY_RESERVATION_ALREADY_CLOSED' } }
      );
    }

    const itemIds = [...totalsByItem.keys()].sort((a, b) => a - b);
    const stockRows = await ItemLocationStock.findAll({
      where: {
        location_id: normalizedLocationId,
        item_id: { [Op.in]: itemIds }
      },
      attributes: ['item_id', 'quantity_on_hand'],
      order: [['item_id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const onHandByItem = new Map(stockRows.map((row) => [
      positiveInt(row.item_id),
      Math.max(0, Number(row.quantity_on_hand || 0))
    ]));

    const activeLines = await InventoryReservationLine.findAll({
      where: { item_id: { [Op.in]: itemIds } },
      include: [{
        model: InventoryReservation,
        as: 'reservation',
        required: true,
        attributes: [],
        where: {
          source_type: 'online_order',
          location_id: normalizedLocationId,
          status: 'active',
          expires_at: { [Op.gt]: now }
        }
      }],
      attributes: ['item_id', 'quantity'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const heldByItem = new Map();
    for (const row of activeLines) {
      const itemId = positiveInt(row.item_id);
      heldByItem.set(itemId, round4((heldByItem.get(itemId) || 0) + Number(row.quantity || 0)));
    }

    const violations = itemIds
      .map((itemId) => ({
        item_id: itemId,
        available_stock: round4(Math.max(0, (onHandByItem.get(itemId) || 0) - (heldByItem.get(itemId) || 0))),
        requested_qty: round4(totalsByItem.get(itemId) || 0)
      }))
      .filter((entry) => entry.available_stock + EPSILON < entry.requested_qty);
    if (violations.length > 0) throw buildShortfallError({ locationId: normalizedLocationId, violations });

    const configuredExpiry = new Date(now.getTime() + getReservationTtlMinutes() * 60 * 1000);
    const finalExpiry = expiresAt ? new Date(expiresAt) : configuredExpiry;
    if (Number.isNaN(finalExpiry.getTime()) || finalExpiry <= now) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Online inventory reservation expiry must be in the future.',
        { statusCode: 422, details: { reason_code: 'INVENTORY_RESERVATION_EXPIRY_INVALID' } }
      );
    }

    const reservation = await InventoryReservation.create({
      source_type: 'online_order',
      source_id: normalizedSourceId,
      location_id: normalizedLocationId,
      status: 'active',
      expires_at: finalExpiry
    }, { transaction });
    await InventoryReservationLine.bulkCreate(normalizedEffectsList.map((effect) => ({
      inventory_reservation_id: reservation.inventory_reservation_id,
      item_id: effect.item_id,
      quantity: effect.quantity,
      effect_type: effect.effect_type,
      source_line_reference: effect.source_line_reference,
      metadata: effect.metadata || null
    })), { transaction });

    return { status: 'active', reservation };
  },

  async releaseOnlineOrderInventory({ sourceId, transaction, reason = 'cancelled' } = {}) {
    const normalizedSourceId = positiveInt(sourceId);
    if (!normalizedSourceId || !transaction) return { status: 'skipped', reservation: null };
    const { InventoryReservation } = resolveModels();
    const reservation = await InventoryReservation.findOne({
      where: { source_type: 'online_order', source_id: normalizedSourceId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!reservation || reservation.status !== 'active') {
      return { status: reservation?.status || 'missing', reservation: reservation || null };
    }
    await reservation.update({
      status: reason === 'expired' ? 'expired' : 'released',
      released_at: new Date(),
      release_reason: String(reason).slice(0, 80)
    }, { transaction });
    return { status: reservation.status, reservation };
  },

  async convertOnlineOrderInventory({ sourceId, transaction } = {}) {
    const normalizedSourceId = positiveInt(sourceId);
    if (!normalizedSourceId || !transaction) return { status: 'skipped', reservation: null };
    const { InventoryReservation } = resolveModels();
    const reservation = await InventoryReservation.findOne({
      where: { source_type: 'online_order', source_id: normalizedSourceId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!reservation || reservation.status !== 'active') {
      return { status: reservation?.status || 'missing', reservation: reservation || null };
    }
    await reservation.update({
      status: 'converted',
      converted_at: new Date()
    }, { transaction });
    return { status: 'converted', reservation };
  }
});

export const inventoryReservationService = buildInventoryReservationService();
