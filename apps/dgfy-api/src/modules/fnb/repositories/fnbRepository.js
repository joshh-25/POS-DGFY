import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (row) => (
  row && typeof row.toJSON === 'function'
    ? row.toJSON()
    : row
);

const mapRows = (rows = []) => (Array.isArray(rows) ? rows.map(toPlain) : []);

const modifierGroupInclude = () => ([{
  model: dbStore.get('FnbModifierOption'),
  as: 'options',
  required: false,
  separate: true,
  order: [['sort_order', 'ASC'], ['name', 'ASC']]
}]);

const diningAreaInclude = () => ([{
  model: dbStore.get('FnbDiningTable'),
  as: 'tables',
  required: false,
  separate: true,
  order: [['table_number', 'ASC']]
}]);

const checkInclude = () => ([
  {
    model: dbStore.get('FnbDiningTable'),
    as: 'table',
    required: false,
    include: [{ model: dbStore.get('FnbDiningArea'), as: 'area', required: false }]
  },
  {
    model: dbStore.get('User'),
    as: 'server',
    required: false,
    attributes: ['user_id', 'username', 'email']
  },
  {
    model: dbStore.get('FnbCheckLine'),
    as: 'lines',
    required: false,
    separate: true,
    include: [
      {
        model: dbStore.get('Item'),
        as: 'item',
        attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'default_sale_price']
      },
      {
        model: dbStore.get('FnbKitchenStation'),
        as: 'kitchenStation',
        required: false
      }
    ],
    order: [['created_at', 'ASC']]
  },
  {
    model: dbStore.get('FnbKitchenTicket'),
    as: 'kitchenTickets',
    required: false,
    separate: true,
    include: [{ model: dbStore.get('FnbKitchenStation'), as: 'station', required: false }],
    order: [['created_at', 'DESC']]
  }
]);

const kitchenRouteInclude = () => ([
  {
    model: dbStore.get('FnbKitchenStation'),
    as: 'station',
    required: false
  },
  {
    model: dbStore.get('Item'),
    as: 'item',
    required: false,
    attributes: ['item_id', 'name', 'sku_code', 'default_sale_price']
  }
]);

const itemModifierGroupInclude = () => ([
  {
    model: dbStore.get('FnbModifierGroup'),
    as: 'modifierGroup',
    required: true,
    include: modifierGroupInclude()
  },
  {
    model: dbStore.get('Item'),
    as: 'item',
    required: false,
    attributes: ['item_id', 'name', 'sku_code', 'default_sale_price']
  }
]);

const reservationInclude = () => ([{
  model: dbStore.get('FnbDiningTable'),
  as: 'table',
  required: false,
  include: [{ model: dbStore.get('FnbDiningArea'), as: 'area', required: false }]
}, {
  model: dbStore.get('FnbReservationTable'),
  as: 'reservationTables',
  required: false,
  separate: true,
  include: [{
    model: dbStore.get('FnbDiningTable'),
    as: 'table',
    required: false,
    include: [{ model: dbStore.get('FnbDiningArea'), as: 'area', required: false }]
  }],
  order: [['table_id', 'ASC']]
}]);

export const FNB_SERVICE_CHARGE_SETTING_KEY = 'fnb_restaurant_service_charge';

export const fnbRepository = {
  async beginTransaction() {
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    return sequelize.transaction();
  },

  async listModifierGroups({ includeInactive = false } = {}, options = {}) {
    const FnbModifierGroup = dbStore.get('FnbModifierGroup');
    const where = includeInactive ? {} : { is_active: true };
    const rows = await FnbModifierGroup.findAll({
      where,
      include: modifierGroupInclude(),
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      transaction: options.transaction
    });
    return mapRows(rows);
  },

  async createModifierGroup(payload = {}, options = {}) {
    const FnbModifierGroup = dbStore.get('FnbModifierGroup');
    const FnbModifierOption = dbStore.get('FnbModifierOption');
    const group = await FnbModifierGroup.create(payload.group, { transaction: options.transaction });
    const optionsPayload = (payload.options || []).map((entry) => ({
      ...entry,
      modifier_group_id: group.modifier_group_id
    }));
    if (optionsPayload.length > 0) {
      await FnbModifierOption.bulkCreate(optionsPayload, { transaction: options.transaction });
    }
    return this.getModifierGroupById(group.modifier_group_id, options);
  },

  async getModifierGroupById(modifierGroupId, options = {}) {
    const FnbModifierGroup = dbStore.get('FnbModifierGroup');
    const row = await FnbModifierGroup.findByPk(modifierGroupId, {
      include: modifierGroupInclude(),
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    return toPlain(row);
  },

  async listDiningAreas({ includeInactive = false } = {}, options = {}) {
    const FnbDiningArea = dbStore.get('FnbDiningArea');
    const where = includeInactive ? {} : { is_active: true };
    const rows = await FnbDiningArea.findAll({
      where,
      include: diningAreaInclude(),
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      transaction: options.transaction
    });
    return mapRows(rows);
  },

  async createDiningArea(payload = {}, options = {}) {
    const FnbDiningArea = dbStore.get('FnbDiningArea');
    const FnbDiningTable = dbStore.get('FnbDiningTable');
    const area = await FnbDiningArea.create(payload.area, { transaction: options.transaction });
    const tables = (payload.tables || []).map((entry) => ({
      ...entry,
      dining_area_id: area.dining_area_id
    }));
    if (tables.length > 0) {
      await FnbDiningTable.bulkCreate(tables, { transaction: options.transaction });
    }
    return this.getDiningAreaById(area.dining_area_id, options);
  },

  async getDiningAreaById(diningAreaId, options = {}) {
    const FnbDiningArea = dbStore.get('FnbDiningArea');
    const row = await FnbDiningArea.findByPk(diningAreaId, {
      include: diningAreaInclude(),
      transaction: options.transaction
    });
    return toPlain(row);
  },

  async getTableById(tableId, options = {}) {
    const FnbDiningTable = dbStore.get('FnbDiningTable');
    const row = await FnbDiningTable.findByPk(tableId, {
      include: [{ model: dbStore.get('FnbDiningArea'), as: 'area', required: false }],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    return row;
  },

  async updateTableStatus(tableId, status, options = {}) {
    const table = await this.getTableById(tableId, { ...options, lock: true });
    if (!table) return null;
    await table.update({ status }, { transaction: options.transaction });
    return toPlain(table);
  },

  async listKitchenStations({ includeInactive = false } = {}, options = {}) {
    const FnbKitchenStation = dbStore.get('FnbKitchenStation');
    const where = includeInactive ? {} : { is_active: true };
    const rows = await FnbKitchenStation.findAll({
      where,
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      transaction: options.transaction
    });
    return mapRows(rows);
  },

  async createKitchenStation(payload = {}, options = {}) {
    const FnbKitchenStation = dbStore.get('FnbKitchenStation');
    const row = await FnbKitchenStation.create(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async listChecks({ statuses = ['open', 'sent_to_kitchen', 'partially_paid'], limit = 100 } = {}, options = {}) {
    const FnbCheck = dbStore.get('FnbCheck');
    const normalizedStatuses = Array.isArray(statuses) ? statuses.filter(Boolean) : [];
    const where = normalizedStatuses.length > 0 ? { status: { [Op.in]: normalizedStatuses } } : {};
    const rows = await FnbCheck.findAll({
      where,
      include: checkInclude(),
      order: [['opened_at', 'DESC']],
      limit: Math.min(Number.parseInt(limit, 10) || 100, 300),
      transaction: options.transaction
    });
    return mapRows(rows);
  },

  async getCheckById(checkId, options = {}) {
    const FnbCheck = dbStore.get('FnbCheck');
    const row = await FnbCheck.findByPk(checkId, {
      include: checkInclude(),
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    return row;
  },

  async createCheck(payload = {}, options = {}) {
    const FnbCheck = dbStore.get('FnbCheck');
    const row = await FnbCheck.create(payload, { transaction: options.transaction });
    return toPlain(await this.getCheckById(row.check_id, options));
  },

  async updateCheck(checkId, payload = {}, options = {}) {
    const row = await this.getCheckById(checkId, { ...options, lock: true });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(await this.getCheckById(checkId, options));
  },

  async createCheckLine(payload = {}, options = {}) {
    const FnbCheckLine = dbStore.get('FnbCheckLine');
    const row = await FnbCheckLine.create(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async updateCheckLinesStatus({ checkId, lineIds = [], status } = {}, options = {}) {
    const FnbCheckLine = dbStore.get('FnbCheckLine');
    const normalizedCheckId = Number.parseInt(checkId, 10);
    if (!Number.isInteger(normalizedCheckId) || normalizedCheckId <= 0) return 0;
    if (!['sent', 'preparing', 'ready', 'served', 'voided'].includes(status)) return 0;
    const normalizedLineIds = [...new Set((Array.isArray(lineIds) ? lineIds : [])
      .map((lineId) => Number.parseInt(lineId, 10))
      .filter((lineId) => Number.isInteger(lineId) && lineId > 0))];
    const where = {
      check_id: normalizedCheckId,
      status: { [Op.ne]: 'voided' }
    };
    if (normalizedLineIds.length > 0) {
      where.check_line_id = { [Op.in]: normalizedLineIds };
    }
    const [count] = await FnbCheckLine.update(
      { status },
      {
        where,
        transaction: options.transaction
      }
    );
    return count;
  },

  async getCheckLineById(checkLineId, options = {}) {
    const FnbCheckLine = dbStore.get('FnbCheckLine');
    const row = await FnbCheckLine.findByPk(checkLineId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    return row;
  },

  async moveCheckLines({ lineIds = [], fromCheckId, toCheckId } = {}, options = {}) {
    const FnbCheckLine = dbStore.get('FnbCheckLine');
    const normalizedLineIds = [...new Set((Array.isArray(lineIds) ? lineIds : [])
      .map((lineId) => Number.parseInt(lineId, 10))
      .filter((lineId) => Number.isInteger(lineId) && lineId > 0))];
    if (normalizedLineIds.length === 0) return 0;
    const [count] = await FnbCheckLine.update(
      { check_id: toCheckId },
      {
        where: {
          check_id: fromCheckId,
          check_line_id: { [Op.in]: normalizedLineIds }
        },
        transaction: options.transaction
      }
    );
    return count;
  },

  async countCheckLines(checkId, options = {}) {
    const FnbCheckLine = dbStore.get('FnbCheckLine');
    return FnbCheckLine.count({
      where: { check_id: checkId },
      transaction: options.transaction
    });
  },

  async createKitchenTicket(payload = {}, options = {}) {
    const FnbKitchenTicket = dbStore.get('FnbKitchenTicket');
    const row = await FnbKitchenTicket.create(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async getKitchenTicketById(ticketId, options = {}) {
    const FnbKitchenTicket = dbStore.get('FnbKitchenTicket');
    const row = await FnbKitchenTicket.findByPk(ticketId, {
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    return row;
  },

  async updateKitchenTicket(ticketId, payload = {}, options = {}) {
    const row = await this.getKitchenTicketById(ticketId, { ...options, lock: true });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async listItemKitchenRoutes({ itemId = null } = {}, options = {}) {
    const FnbItemKitchenRoute = dbStore.get('FnbItemKitchenRoute');
    const where = itemId ? { item_id: itemId } : {};
    const rows = await FnbItemKitchenRoute.findAll({
      where,
      include: kitchenRouteInclude(),
      order: [['item_id', 'ASC'], ['is_primary', 'DESC'], ['created_at', 'ASC']],
      transaction: options.transaction
    });
    return mapRows(rows);
  },

  async getPrimaryKitchenRouteForItem(itemId, options = {}) {
    const FnbItemKitchenRoute = dbStore.get('FnbItemKitchenRoute');
    const row = await FnbItemKitchenRoute.findOne({
      where: { item_id: itemId },
      include: kitchenRouteInclude(),
      order: [['is_primary', 'DESC'], ['created_at', 'ASC']],
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    return toPlain(row);
  },

  async upsertItemKitchenRoute(itemId, payload = {}, options = {}) {
    const FnbItemKitchenRoute = dbStore.get('FnbItemKitchenRoute');
    const existing = await FnbItemKitchenRoute.findOne({
      where: {
        item_id: itemId,
        is_primary: true
      },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    const nextPayload = {
      item_id: itemId,
      kitchen_station_id: payload.kitchen_station_id,
      default_course: payload.default_course || 'main',
      is_primary: true
    };
    if (existing) {
      await existing.update(nextPayload, { transaction: options.transaction });
      return this.getPrimaryKitchenRouteForItem(itemId, options);
    }
    const row = await FnbItemKitchenRoute.create(nextPayload, { transaction: options.transaction });
    return this.getPrimaryKitchenRouteForItem(row.item_id, options);
  },

  async listItemModifierGroups({ itemId = null } = {}, options = {}) {
    const FnbItemModifierGroup = dbStore.get('FnbItemModifierGroup');
    const where = itemId ? { item_id: itemId } : {};
    const rows = await FnbItemModifierGroup.findAll({
      where,
      include: itemModifierGroupInclude(),
      order: [['item_id', 'ASC'], ['sort_order', 'ASC']],
      transaction: options.transaction
    });
    return mapRows(rows);
  },

  async replaceItemModifierGroups(itemId, assignments = [], options = {}) {
    const FnbItemModifierGroup = dbStore.get('FnbItemModifierGroup');
    await FnbItemModifierGroup.destroy({
      where: { item_id: itemId },
      transaction: options.transaction
    });
    const rows = (Array.isArray(assignments) ? assignments : []).map((entry, index) => ({
      item_id: itemId,
      modifier_group_id: entry.modifier_group_id,
      is_required_override: Object.prototype.hasOwnProperty.call(entry, 'is_required_override')
        ? entry.is_required_override
        : null,
      sort_order: Number.parseInt(entry.sort_order, 10) >= 0 ? Number.parseInt(entry.sort_order, 10) : index
    }));
    if (rows.length > 0) {
      await FnbItemModifierGroup.bulkCreate(rows, { transaction: options.transaction });
    }
    return this.listItemModifierGroups({ itemId }, options);
  },

  async listReservations({ status = '', tableId = null, from = null, to = null, limit = 100 } = {}, options = {}) {
    const FnbReservationRequest = dbStore.get('FnbReservationRequest');
    const where = {};
    if (status) where.status = status;
    if (tableId) where.table_id = tableId;
    if (from || to) {
      where.requested_at = {};
      if (from) where.requested_at[Op.gte] = from;
      if (to) where.requested_at[Op.lte] = to;
    }
    const rows = await FnbReservationRequest.findAll({
      where,
      include: reservationInclude(),
      order: [['requested_at', 'ASC']],
      limit: Math.min(Number.parseInt(limit, 10) || 100, 300),
      transaction: options.transaction
    });
    return mapRows(rows);
  },

  async listOverlappingReservations({
    tableId = null,
    tableIds = [],
    startAt,
    endAt,
    excludeReservationId = null,
    blockingStatuses = ['confirmed', 'seated']
  } = {}, options = {}) {
    const FnbReservationRequest = dbStore.get('FnbReservationRequest');
    const FnbReservationTable = dbStore.get('FnbReservationTable');
    const normalizedTableIds = [...new Set([
      ...(Array.isArray(tableIds) ? tableIds : []),
      tableId
    ].map((entry) => Number.parseInt(entry, 10)).filter((entry) => Number.isInteger(entry) && entry > 0))];
    if (normalizedTableIds.length === 0) return [];
    const where = {
      status: { [Op.in]: blockingStatuses },
      requested_at: { [Op.lt]: endAt }
    };
    if (excludeReservationId) {
      where.reservation_request_id = { [Op.ne]: excludeReservationId };
    }
    const directRows = await FnbReservationRequest.findAll({
      where: {
        ...where,
        table_id: { [Op.in]: normalizedTableIds }
      },
      include: reservationInclude(),
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    const assignmentRows = await FnbReservationTable.findAll({
      where: { table_id: { [Op.in]: normalizedTableIds } },
      attributes: ['reservation_request_id'],
      transaction: options.transaction
    });
    const assignedReservationIds = [...new Set(assignmentRows.map((row) => Number(row.reservation_request_id)).filter(Boolean))];
    const assignedRows = assignedReservationIds.length > 0
      ? await FnbReservationRequest.findAll({
        where: {
          ...where,
          reservation_request_id: excludeReservationId
            ? { [Op.in]: assignedReservationIds.filter((id) => id !== Number(excludeReservationId)) }
            : { [Op.in]: assignedReservationIds }
        },
        include: reservationInclude(),
        transaction: options.transaction,
        lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
      })
      : [];
    const byId = new Map([...mapRows(directRows), ...mapRows(assignedRows)].map((reservation) => [
      Number(reservation.reservation_request_id),
      reservation
    ]));
    return Array.from(byId.values()).filter((reservation) => {
      const reservationStart = new Date(reservation.requested_at);
      const reservationEnd = new Date(reservationStart.getTime() + (
        (Number(reservation.duration_minutes || 90) + Number(reservation.buffer_minutes || 15)) * 60000
      ));
      return reservationEnd > startAt;
    });
  },

  async createReservation(payload = {}, options = {}) {
    const FnbReservationRequest = dbStore.get('FnbReservationRequest');
    const { table_ids: tableIds = [], ...reservationPayload } = payload;
    const row = await FnbReservationRequest.create(reservationPayload, { transaction: options.transaction });
    await this.replaceReservationTables(row.reservation_request_id, tableIds, options);
    return toPlain(await this.getReservationById(row.reservation_request_id, options));
  },

  async getReservationById(reservationId, options = {}) {
    const FnbReservationRequest = dbStore.get('FnbReservationRequest');
    const row = await FnbReservationRequest.findByPk(reservationId, {
      include: reservationInclude(),
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    return row;
  },

  async updateReservation(reservationId, payload = {}, options = {}) {
    const { table_ids: tableIds, ...reservationPayload } = payload;
    const row = await this.getReservationById(reservationId, { ...options, lock: true });
    if (!row) return null;
    await row.update(reservationPayload, { transaction: options.transaction });
    if (Array.isArray(tableIds)) {
      await this.replaceReservationTables(reservationId, tableIds, options);
    }
    return toPlain(await this.getReservationById(reservationId, options));
  },

  async replaceReservationTables(reservationId, tableIds = [], options = {}) {
    const FnbReservationTable = dbStore.get('FnbReservationTable');
    const normalizedTableIds = [...new Set((Array.isArray(tableIds) ? tableIds : [])
      .map((tableId) => Number.parseInt(tableId, 10))
      .filter((tableId) => Number.isInteger(tableId) && tableId > 0))];
    await FnbReservationTable.destroy({
      where: { reservation_request_id: reservationId },
      transaction: options.transaction
    });
    if (normalizedTableIds.length > 0) {
      await FnbReservationTable.bulkCreate(normalizedTableIds.map((tableId) => ({
        reservation_request_id: reservationId,
        table_id: tableId
      })), { transaction: options.transaction });
    }
    return normalizedTableIds;
  },

  async getServiceChargeSetting(options = {}) {
    const SystemSetting = dbStore.get('SystemSetting');
    const row = await SystemSetting.findOne({
      where: { setting_key: FNB_SERVICE_CHARGE_SETTING_KEY },
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    return toPlain(row);
  },

  async upsertServiceChargeSetting(settings, options = {}) {
    const SystemSetting = dbStore.get('SystemSetting');
    const existing = await this.getServiceChargeSetting({ ...options, lock: true });
    const payload = {
      setting_key: FNB_SERVICE_CHARGE_SETTING_KEY,
      setting_value: JSON.stringify(settings),
      data_type: 'json',
      description: 'Food & Beverage restaurant service charge settings',
      updated_at: new Date()
    };
    if (existing) {
      await SystemSetting.update(payload, {
        where: { setting_key: FNB_SERVICE_CHARGE_SETTING_KEY },
        transaction: options.transaction
      });
      return payload;
    }
    const row = await SystemSetting.create(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async dashboard(options = {}) {
    const [checks, reservations, stations, areas] = await Promise.all([
      this.listChecks({}, options),
      this.listReservations({ status: 'requested', limit: 50 }, options),
      this.listKitchenStations({}, options),
      this.listDiningAreas({}, options)
    ]);
    return {
      open_checks: checks.length,
      pending_reservations: reservations.length,
      kitchen_stations: stations.length,
      dining_areas: areas.length,
      checks,
      reservations,
      stations,
      areas
    };
  }
};
