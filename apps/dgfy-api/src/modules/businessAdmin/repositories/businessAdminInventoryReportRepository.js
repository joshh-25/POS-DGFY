import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => value?.toJSON ? value.toJSON() : value;
const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const decimal = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const direction = (value) => String(value).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

const scopedMovementWhere = ({ dateFrom, dateTo, branchId, allowedLocationIds }) => {
    const endAt = new Date(`${dateTo}T00:00:00.000+08:00`);
    endAt.setDate(endAt.getDate() + 1);
    const where = {
        timestamp: {
            [Op.gte]: new Date(`${dateFrom}T00:00:00.000+08:00`),
            [Op.lt]: endAt
        }
    };
    const locationIds = branchId ? [branchId] : allowedLocationIds;
    if (Array.isArray(locationIds)) {
        where[Op.or] = [
            { location_id: { [Op.in]: locationIds } },
            { source_location_id: { [Op.in]: locationIds } },
            { destination_location_id: { [Op.in]: locationIds } }
        ];
    }
    return where;
};

const locationLabel = (location, allowedLocationIds) => {
    if (!location) return '-';
    if (Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(Number(location.location_id))) return 'Other branch';
    return location.name || `Branch #${location.location_id}`;
};

const movementSortColumns = Object.freeze({
    timestamp: 'timestamp',
    item: 'item_id',
    movement_type: 'movement_type',
    quantity: 'quantity',
    reference: 'reference_id'
});

const lowStockSortColumns = Object.freeze({
    item: 'item_id',
    quantity_on_hand: 'quantity_on_hand',
    min_threshold: 'item.min_threshold'
});

export const businessAdminInventoryReportRepository = {
    async listBranchStock({ branchId, itemIds = [] } = {}) {
        const ItemLocationStock = dbStore.get('ItemLocationStock');
        const normalizedBranchId = positiveInt(branchId, null);
        const normalizedItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
            .map((itemId) => positiveInt(itemId, null))
            .filter(Boolean))];

        if (!normalizedBranchId || normalizedItemIds.length === 0) return [];

        const rows = await ItemLocationStock.findAll({
            where: {
                location_id: normalizedBranchId,
                item_id: { [Op.in]: normalizedItemIds }
            },
            attributes: ['item_id', 'quantity_on_hand'],
            raw: true
        });

        return rows.map((row) => ({
            item_id: Number(row.item_id),
            quantity_on_hand: decimal(row.quantity_on_hand)
        }));
    },

    async listMovementReport({ dateFrom, dateTo, branchId = null, allowedLocationIds = null, page = 1, limit = 50, sortBy = '', sortDirection = 'desc' } = {}) {
        const StockMovement = dbStore.get('StockMovement');
        const Item = dbStore.get('Item');
        const User = dbStore.get('User');
        const TenantLocation = dbStore.get('TenantLocation');
        const normalizedPage = positiveInt(page, 1);
        const normalizedLimit = Math.min(5000, positiveInt(limit, 50));
        const sortColumn = movementSortColumns[sortBy] || movementSortColumns.timestamp;
        const { count, rows } = await StockMovement.findAndCountAll({
            where: scopedMovementWhere({ dateFrom, dateTo, branchId, allowedLocationIds }),
            include: [
                { model: Item, as: 'item', attributes: ['item_id', 'name', 'sku_code'], required: true },
                { model: User, as: 'userResponsible', attributes: ['user_id', 'username'], required: false },
                { model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false },
                { model: TenantLocation, as: 'sourceLocation', attributes: ['location_id', 'name'], required: false },
                { model: TenantLocation, as: 'destinationLocation', attributes: ['location_id', 'name'], required: false }
            ],
            distinct: true,
            limit: normalizedLimit,
            offset: (normalizedPage - 1) * normalizedLimit,
            order: [[sortColumn, direction(sortDirection)]]
        });
        return {
            rows: rows.map((row) => {
                const movement = toPlain(row);
                return {
                    movement_id: movement.movement_id,
                    timestamp: movement.timestamp,
                    item: movement.item?.name || `Item #${movement.item_id}`,
                    sku_code: movement.item?.sku_code || '',
                    movement_type: movement.movement_type,
                    quantity: decimal(movement.quantity),
                    branch: locationLabel(movement.location, allowedLocationIds),
                    source_branch: locationLabel(movement.sourceLocation, allowedLocationIds),
                    destination_branch: locationLabel(movement.destinationLocation, allowedLocationIds),
                    reference: movement.reference_id || '',
                    actor: movement.userResponsible?.username || '',
                    notes: movement.notes || ''
                };
            }),
            pagination: { page: normalizedPage, limit: normalizedLimit, total: count, total_pages: Math.ceil(count / normalizedLimit) },
            sort: { by: Object.entries(movementSortColumns).find(([, value]) => value === sortColumn)?.[0] || 'timestamp', direction: direction(sortDirection).toLowerCase() },
            available_sort_fields: ['timestamp', 'item', 'movement_type', 'quantity', 'reference']
        };
    },

    async listLowStockReport({ branchId = null, allowedLocationIds = null, page = 1, limit = 50, sortBy = '', sortDirection = 'desc' } = {}) {
        const ItemLocationStock = dbStore.get('ItemLocationStock');
        const Item = dbStore.get('Item');
        const TenantLocation = dbStore.get('TenantLocation');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const normalizedPage = positiveInt(page, 1);
        const normalizedLimit = Math.min(5000, positiveInt(limit, 50));
        const locationIds = branchId ? [branchId] : allowedLocationIds;
        const where = {};
        if (Array.isArray(locationIds)) where.location_id = { [Op.in]: locationIds };
        const sortColumn = lowStockSortColumns[sortBy] || lowStockSortColumns.quantity_on_hand;
        const { count, rows } = await ItemLocationStock.findAndCountAll({
            where: {
                ...where,
                [Op.and]: [sequelize.where(sequelize.col('quantity_on_hand'), Op.lte, sequelize.col('item.min_threshold'))]
            },
            include: [
                { model: Item, as: 'item', attributes: ['item_id', 'name', 'sku_code', 'min_threshold'], where: { status: 'active', min_threshold: { [Op.ne]: null } }, required: true },
                { model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: true }
            ],
            distinct: true,
            limit: normalizedLimit,
            offset: (normalizedPage - 1) * normalizedLimit,
            order: [
                sortColumn === 'item.min_threshold'
                    ? [{ model: Item, as: 'item' }, 'min_threshold', direction(sortDirection)]
                    : [sortColumn, direction(sortDirection)]
            ]
        });
        return {
            rows: rows.map((row) => {
                const stock = toPlain(row);
                const quantity = decimal(stock.quantity_on_hand);
                const threshold = decimal(stock.item?.min_threshold);
                return {
                    item: stock.item?.name || `Item #${stock.item_id}`,
                    sku_code: stock.item?.sku_code || '',
                    branch: locationLabel(stock.location, allowedLocationIds),
                    quantity_on_hand: quantity,
                    min_threshold: threshold,
                    shortage_quantity: Math.max(0, threshold - quantity)
                };
            }),
            pagination: { page: normalizedPage, limit: normalizedLimit, total: count, total_pages: Math.ceil(count / normalizedLimit) },
            sort: { by: Object.entries(lowStockSortColumns).find(([, value]) => value === sortColumn)?.[0] || 'quantity_on_hand', direction: direction(sortDirection).toLowerCase() },
            available_sort_fields: ['item', 'quantity_on_hand', 'min_threshold']
        };
    }
};
