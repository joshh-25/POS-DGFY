import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (row) => (
  row && typeof row.toJSON === 'function' ? row.toJSON() : row
);

export const createServiceOptionRepository = () => ({
  async findOptionGroups(tenantId, options = {}) {
    const ServiceOptionGroup = dbStore.get('ServiceOptionGroup');
    const ServiceOption = dbStore.get('ServiceOption');
    const where = {};
    if (tenantId) where.tenant_id = tenantId;
    if (options.status) where.status = options.status;

    const rows = await ServiceOptionGroup.findAll({
      where,
      include: options.includeOptions !== false ? [{
        model: ServiceOption,
        as: 'options',
        where: options.optionsStatus ? { status: options.optionsStatus } : undefined,
        required: false
      }] : [],
      order: [
        ['display_order', 'ASC'],
        ['created_at', 'ASC'],
        [{ model: ServiceOption, as: 'options' }, 'display_order', 'ASC']
      ],
      transaction: options.transaction
    });
    return (rows || []).map(toPlain);
  },

  async findOptionGroupById(groupId, tenantId, options = {}) {
    const ServiceOptionGroup = dbStore.get('ServiceOptionGroup');
    const ServiceOption = dbStore.get('ServiceOption');
    const where = { group_id: Number(groupId) };
    if (tenantId) where.tenant_id = tenantId;

    const row = await ServiceOptionGroup.findOne({
      where,
      include: [{
        model: ServiceOption,
        as: 'options',
        required: false
      }],
      order: [[{ model: ServiceOption, as: 'options' }, 'display_order', 'ASC']],
      transaction: options.transaction
    });
    return toPlain(row);
  },

  async createOptionGroup(payload, options = {}) {
    const ServiceOptionGroup = dbStore.get('ServiceOptionGroup');
    const row = await ServiceOptionGroup.create(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async updateOptionGroup(groupId, payload, tenantId, options = {}) {
    const ServiceOptionGroup = dbStore.get('ServiceOptionGroup');
    const where = { group_id: Number(groupId) };
    if (tenantId) where.tenant_id = tenantId;

    const [updatedCount] = await ServiceOptionGroup.update(payload, {
      where,
      transaction: options.transaction
    });
    if (!updatedCount) return null;
    return this.findOptionGroupById(groupId, tenantId, options);
  },

  async createOption(payload, options = {}) {
    const ServiceOption = dbStore.get('ServiceOption');
    const row = await ServiceOption.create(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async updateOption(optionId, payload, tenantId, options = {}) {
    const ServiceOption = dbStore.get('ServiceOption');
    const where = { option_id: Number(optionId) };
    if (tenantId) where.tenant_id = tenantId;

    const [updatedCount] = await ServiceOption.update(payload, {
      where,
      transaction: options.transaction
    });
    if (!updatedCount) return null;
    const row = await ServiceOption.findOne({ where, transaction: options.transaction });
    return toPlain(row);
  },

  async findOptionById(optionId, tenantId, options = {}) {
    const ServiceOption = dbStore.get('ServiceOption');
    const where = { option_id: Number(optionId) };
    if (tenantId) where.tenant_id = tenantId;

    const row = await ServiceOption.findOne({ where, transaction: options.transaction });
    return toPlain(row);
  },

  async findOptionsByIds(optionIds = [], tenantId, options = {}) {
    const ServiceOption = dbStore.get('ServiceOption');
    const ServiceOptionGroup = dbStore.get('ServiceOptionGroup');
    const normalizedIds = [...new Set(optionIds.map(Number).filter(Boolean))];
    if (normalizedIds.length === 0) return [];

    const where = { option_id: { [Op.in]: normalizedIds } };
    if (tenantId) where.tenant_id = tenantId;

    const rows = await ServiceOption.findAll({
      where,
      include: [{ model: ServiceOptionGroup, as: 'group' }],
      transaction: options.transaction
    });
    return (rows || []).map(toPlain);
  },

  async assignItemOptionGroups(itemId, groupIds = [], tenantId, options = {}) {
    const ServiceItemOptionGroup = dbStore.get('ServiceItemOptionGroup');
    const normalizedItemId = Number(itemId);
    const normalizedGroupIds = [...new Set(groupIds.map(Number).filter(Boolean))];

    await ServiceItemOptionGroup.destroy({
      where: { service_item_id: normalizedItemId },
      transaction: options.transaction
    });

    if (normalizedGroupIds.length === 0) return [];

    const records = normalizedGroupIds.map((groupId, index) => ({
      service_item_id: normalizedItemId,
      option_group_id: groupId,
      tenant_id: tenantId || null,
      display_order: index
    }));

    await ServiceItemOptionGroup.bulkCreate(records, { transaction: options.transaction });
    return this.getItemOptionGroups(itemId, tenantId, options);
  },

  async getItemOptionGroups(itemId, tenantId, options = {}) {
    const ServiceItemOptionGroup = dbStore.get('ServiceItemOptionGroup');
    const ServiceOptionGroup = dbStore.get('ServiceOptionGroup');
    const ServiceOption = dbStore.get('ServiceOption');
    const normalizedItemId = Number(itemId);

    const rows = await ServiceItemOptionGroup.findAll({
      where: { service_item_id: normalizedItemId },
      include: [{
        model: ServiceOptionGroup,
        as: 'group',
        where: options.activeOnly ? { status: 'active' } : undefined,
        include: [{
          model: ServiceOption,
          as: 'options',
          where: options.activeOnly ? { status: 'active' } : undefined,
          required: false
        }]
      }],
      order: [
        ['display_order', 'ASC'],
        [{ model: ServiceOptionGroup, as: 'group' }, { model: ServiceOption, as: 'options' }, 'display_order', 'ASC']
      ],
      transaction: options.transaction
    });
    return (rows || []).map((row) => toPlain(row.group)).filter(Boolean);
  },

  async getItemOptionGroupsByItemIds(itemIds = [], tenantId, options = {}) {
    const ServiceItemOptionGroup = dbStore.get('ServiceItemOptionGroup');
    const ServiceOptionGroup = dbStore.get('ServiceOptionGroup');
    const ServiceOption = dbStore.get('ServiceOption');
    const normalizedItemIds = [...new Set(itemIds.map(Number).filter(Boolean))];
    const groupsByItemId = new Map(normalizedItemIds.map((itemId) => [itemId, []]));
    if (normalizedItemIds.length === 0) return groupsByItemId;

    const assignmentWhere = {
      service_item_id: { [Op.in]: normalizedItemIds }
    };
    if (tenantId) assignmentWhere.tenant_id = tenantId;

    const groupWhere = {};
    if (tenantId) groupWhere.tenant_id = tenantId;
    if (options.activeOnly) groupWhere.status = 'active';

    const optionWhere = {};
    if (tenantId) optionWhere.tenant_id = tenantId;
    if (options.activeOnly) optionWhere.status = 'active';

    const rows = await ServiceItemOptionGroup.findAll({
      where: assignmentWhere,
      include: [{
        model: ServiceOptionGroup,
        as: 'group',
        where: groupWhere,
        include: [{
          model: ServiceOption,
          as: 'options',
          where: optionWhere,
          required: false
        }]
      }],
      order: [
        ['display_order', 'ASC'],
        [{ model: ServiceOptionGroup, as: 'group' }, { model: ServiceOption, as: 'options' }, 'display_order', 'ASC']
      ],
      transaction: options.transaction
    });

    for (const row of rows || []) {
      const plainRow = toPlain(row);
      const itemId = Number(plainRow?.service_item_id);
      const group = toPlain(plainRow?.group);
      if (!groupsByItemId.has(itemId) || !group) continue;
      groupsByItemId.get(itemId).push(group);
    }
    return groupsByItemId;
  },

  async isOptionReferencedByBookings(optionId, options = {}) {
    const ServiceBookingLineOption = dbStore.get('ServiceBookingLineOption');
    if (!ServiceBookingLineOption?.count) return false;
    const count = await ServiceBookingLineOption.count({
      where: { option_id: Number(optionId) },
      transaction: options.transaction
    });
    return count > 0;
  }
});
