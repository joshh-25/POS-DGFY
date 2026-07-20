import { Op, QueryTypes } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { issueStockForDispatch } from '../modules/inventory/commands/stockCommandService.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';
import { resolveMovementLocation } from './locationInventoryService.js';
import { requireExplicitSalePrice } from '../modules/shared/utils/itemFinancialPolicy.js';

// CSV formula injection prevention (matches csvExportService.js pattern)
const escapeCSVCell = (value) => {
    if (value === null || value === undefined) return '';
    let str = String(value);
    if (/^[=+\-@]/.test(str)) str = `'${str}`;
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Generates a unique DO number: DO-{YEAR}-{6-digit timestamp suffix}
 */
const generateDoNumber = () => {
    const year = new Date().getFullYear();
    return `DO-${year}-${String(Date.now()).slice(-6)}`;
};

const findVisibleItemById = async (Item, itemId) => {
    return Item.findOne({
        where: buildVisibleWhere(
            { item_id: itemId },
            { statusField: 'status', excludeInactiveStatus: true }
        )
    });
};

const resolveDispatchSalePrice = (line, item) => {
    const rawSalePrice = line.sale_price_per_unit != null
        ? line.sale_price_per_unit
        : requireExplicitSalePrice(item, 'Dispatch Order');
    const salePrice = Number(rawSalePrice);

    if (!Number.isFinite(salePrice) || salePrice <= 0) {
        const error = new Error(`Item "${item.name}" requires a positive selling price before it can be dispatched.`);
        error.statusCode = 400;
        error.reason_code = 'MISSING_PRICE';
        throw error;
    }

    return salePrice;
};

/**
 * Recalculates and saves the DO status based on its lines.
 * - All lines: qty_dispatched - qty_voided <= 0  →  confirmed (nothing dispatched)
 * - Some but not all lines fully met               →  partial
 * - All lines: qty_dispatched - qty_voided >= qty_ordered → completed
 *
 * @param {number} doId
 * @param {object} transaction - Sequelize transaction
 */
export const recalculateDOStatus = async (doId, transaction) => {
    const DispatchOrder = dbStore.get('DispatchOrder');
    const DispatchOrderLine = dbStore.get('DispatchOrderLine');

    const lines = await DispatchOrderLine.findAll({
        where: { do_id: doId },
        transaction
    });

    if (!lines.length) return;

    let allCompleted = true;
    let anyDispatched = false;

    for (const line of lines) {
        const netDispatched = parseFloat(line.qty_dispatched) - parseFloat(line.qty_voided);
        const qtyOrdered = parseFloat(line.qty_ordered);

        if (netDispatched > 0) anyDispatched = true;
        if (netDispatched < qtyOrdered - 0.001) allCompleted = false;
    }

    let newStatus;
    if (allCompleted) {
        newStatus = 'completed';
    } else if (anyDispatched) {
        newStatus = 'partial';
    } else {
        newStatus = 'confirmed';
    }

    await DispatchOrder.update(
        { status: newStatus },
        { where: { do_id: doId }, transaction }
    );
};

// ─────────────────────────────────────────────────────────────
// Read Operations
// ─────────────────────────────────────────────────────────────

export const getDispatchOrders = async (params = {}) => {
    const DispatchOrder = dbStore.get('DispatchOrder');
    const DispatchOrderLine = dbStore.get('DispatchOrderLine');
    const Item = dbStore.get('Item');
    const User = dbStore.get('User');

    const {
        page = 1,
        limit = 20,
        status,
        recipient_name,
        startDate,
        endDate,
        archived
    } = params;

    const where = {};
    if (archived === 'true') {
        where.archived_at = { [Op.not]: null };
    } else {
        where.archived_at = null;
    }
    if (status) where.status = status;
    if (recipient_name) where.recipient_name = { [Op.like]: `%${recipient_name}%` };
    if (startDate || endDate) {
        where.dispatch_date = {};
        if (startDate) where.dispatch_date[Op.gte] = startDate;
        if (endDate) where.dispatch_date[Op.lte] = endDate;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await DispatchOrder.findAndCountAll({
        where,
        include: [
            { model: User, as: 'creator', attributes: ['user_id', 'username'] },
            {
                model: DispatchOrderLine,
                as: 'lines',
                include: [
                    { model: Item, as: 'item', attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'current_stock'] }
                ]
            }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset
    });

    return {
        dispatchOrders: rows,
        pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(count / parseInt(limit))
        }
    };
};

export const getDispatchOrderById = async (doId) => {
    const DispatchOrder = dbStore.get('DispatchOrder');
    const DispatchOrderLine = dbStore.get('DispatchOrderLine');
    const Item = dbStore.get('Item');
    const User = dbStore.get('User');
    const FIFOBatch = dbStore.get('FIFOBatch');
    const StockMovement = dbStore.get('StockMovement');

    const dispatchOrder = await DispatchOrder.findOne({
        where: { do_id: doId },
        include: [
            { model: User, as: 'creator', attributes: ['user_id', 'username'] },
            { model: User, as: 'confirmedByUser', attributes: ['user_id', 'username'] },
            {
                model: DispatchOrderLine,
                as: 'lines',
                include: [
                    {
                        model: Item,
                        as: 'item',
                        attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'current_stock', 'fifo_enabled', 'shelf_life_days', 'cost_per_unit']
                    },
                    { model: FIFOBatch, as: 'batch', attributes: ['batch_id', 'received_date', 'expiry_date', 'quantity', 'quantity_consumed'] }
                ]
            }
        ]
    });

    if (!dispatchOrder) {
        const error = new Error('Dispatch Order not found');
        error.statusCode = 404;
        throw error;
    }

    // Include related stock movements for audit trail
    // reference_id stores line_id as string for DO-type movements
    const lineIds = (dispatchOrder.lines || []).map(l => String(l.line_id));
    const movements = lineIds.length
        ? await StockMovement.findAll({
            where: {
                reference_type: 'DO',
                reference_id: { [Op.in]: lineIds }
            },
            include: [
                { model: User, as: 'userResponsible', attributes: ['user_id', 'username'] }
            ],
            order: [['timestamp', 'DESC']]
        })
        : [];

    return { ...dispatchOrder.toJSON(), movements };
};

export const getDispatchStats = async (params = {}) => {
    const DispatchOrder = dbStore.get('DispatchOrder');

    const { startDate, endDate } = params;
    const dateWhere = {};
    if (startDate || endDate) {
        dateWhere.dispatch_date = {};
        if (startDate) dateWhere.dispatch_date[Op.gte] = startDate;
        if (endDate) dateWhere.dispatch_date[Op.lte] = endDate;
    }

    const [total, byStatus] = await Promise.all([
        DispatchOrder.count({ where: { archived_at: null, ...dateWhere } }),
        DispatchOrder.findAll({
            where: { archived_at: null, ...dateWhere },
            attributes: ['status', [dbStore.get('sequelize').fn('COUNT', dbStore.get('sequelize').col('do_id')), 'count']],
            group: ['status'],
            raw: true
        })
    ]);

    const statusMap = { draft: 0, confirmed: 0, partial: 0, completed: 0, cancelled: 0 };
    byStatus.forEach(row => { statusMap[row.status] = parseInt(row.count); });

    return {
        total,
        draft: statusMap.draft,
        confirmed: statusMap.confirmed,
        partial: statusMap.partial,
        completed: statusMap.completed,
        cancelled: statusMap.cancelled,
        pending: statusMap.draft + statusMap.confirmed + statusMap.partial
    };
};

// ─────────────────────────────────────────────────────────────
// Write Operations
// ─────────────────────────────────────────────────────────────

export const createDispatchOrder = async (data, userId) => {
    const DispatchOrder = dbStore.get('DispatchOrder');
    const DispatchOrderLine = dbStore.get('DispatchOrderLine');
    const Item = dbStore.get('Item');
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

    const { recipient_name, recipient_type = 'external', reference_jo, reference_po, dispatch_date, notes, lines } = data;

    // Validate lines reference finished goods items
    for (const line of lines) {
        const item = await findVisibleItemById(Item, line.item_id);
        if (!item) {
            const error = new Error(`Item ID ${line.item_id} not found or inactive`);
            error.statusCode = 400;
            throw error;
        }
        if (item.category !== 'product' || item.product_type !== 'finished_goods') {
            const error = new Error(`Item "${item.name}" is not a finished goods product. Only finished goods can be dispatched.`);
            error.statusCode = 400;
            throw error;
        }
    }

    const transaction = await sequelize.transaction();
    try {
        const doNumber = generateDoNumber();

        const dispatchOrder = await DispatchOrder.create({
            do_number: doNumber,
            recipient_name,
            recipient_type,
            reference_jo: reference_jo || null,
            reference_po: reference_po || null,
            dispatch_date,
            status: 'draft',
            notes: notes || null,
            created_by: userId
        }, { transaction });

        for (const line of lines) {
            const item = await findVisibleItemById(Item, line.item_id);
            const salePrice = resolveDispatchSalePrice(line, item);
            await DispatchOrderLine.create({
                do_id: dispatchOrder.do_id,
                item_id: line.item_id,
                qty_ordered: line.qty_ordered,
                qty_dispatched: 0,
                qty_voided: 0,
                unit_of_measure: item.unit_of_measure,
                cost_per_unit: item.cost_per_unit || null,
                sale_price_per_unit: salePrice,
                notes: line.notes || null
            }, { transaction });
        }

        await transaction.commit();
        return getDispatchOrderById(dispatchOrder.do_id);
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
};

export const updateDispatchOrder = async (doId, data) => {
    const DispatchOrder = dbStore.get('DispatchOrder');
    const DispatchOrderLine = dbStore.get('DispatchOrderLine');
    const Item = dbStore.get('Item');
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

    const dispatchOrder = await DispatchOrder.findByPk(doId);
    if (!dispatchOrder) {
        const error = new Error('Dispatch Order not found');
        error.statusCode = 404;
        throw error;
    }
    if (dispatchOrder.status !== 'draft') {
        const error = new Error('Only draft Dispatch Orders can be edited');
        error.statusCode = 400;
        throw error;
    }

    const transaction = await sequelize.transaction();
    try {
        const { recipient_name, recipient_type, reference_jo, reference_po, dispatch_date, notes, lines } = data;

        await dispatchOrder.update({
            ...(recipient_name && { recipient_name }),
            ...(recipient_type && { recipient_type }),
            reference_jo: reference_jo !== undefined ? reference_jo : dispatchOrder.reference_jo,
            reference_po: reference_po !== undefined ? reference_po : dispatchOrder.reference_po,
            ...(dispatch_date && { dispatch_date }),
            notes: notes !== undefined ? notes : dispatchOrder.notes
        }, { transaction });

        if (lines) {
            // Validate lines before replacing
            for (const line of lines) {
                const item = await findVisibleItemById(Item, line.item_id);
                if (!item) {
                    const error = new Error(`Item ID ${line.item_id} not found or inactive`);
                    error.statusCode = 400;
                    throw error;
                }
                if (item.category !== 'product' || item.product_type !== 'finished_goods') {
                    const error = new Error(`Item "${item.name}" is not a finished goods product`);
                    error.statusCode = 400;
                    throw error;
                }
            }
            // Replace all lines
            await DispatchOrderLine.destroy({ where: { do_id: doId }, transaction });
            for (const line of lines) {
                const item = await findVisibleItemById(Item, line.item_id);
                const salePrice = resolveDispatchSalePrice(line, item);
                await DispatchOrderLine.create({
                    do_id: doId,
                    item_id: line.item_id,
                    qty_ordered: line.qty_ordered,
                    qty_dispatched: 0,
                    qty_voided: 0,
                    unit_of_measure: item.unit_of_measure,
                    cost_per_unit: item.cost_per_unit || null,
                    sale_price_per_unit: salePrice,
                    notes: line.notes || null
                }, { transaction });
            }
        }

        await transaction.commit();
        return getDispatchOrderById(doId);
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
};

export const confirmDispatchOrder = async (doId, userId) => {
    const DispatchOrder = dbStore.get('DispatchOrder');

    const dispatchOrder = await DispatchOrder.findByPk(doId);
    if (!dispatchOrder) {
        const error = new Error('Dispatch Order not found');
        error.statusCode = 404;
        throw error;
    }
    if (dispatchOrder.status !== 'draft') {
        const error = new Error('Only draft Dispatch Orders can be confirmed');
        error.statusCode = 400;
        throw error;
    }

    await dispatchOrder.update({
        status: 'confirmed',
        confirmed_by: userId
    });

    return getDispatchOrderById(doId);
};

/**
 * Execute a dispatch run — deducts stock for each line item.
 * Supports partial dispatch: qty_to_dispatch per line can be less than qty_ordered.
 *
 * @param {number} doId
 * @param {Array}  lineDispatches - [{ line_id, qty_to_dispatch, batch_id? }]
 * @param {number} userId
 * @param {number|null} locationId
 */
export const dispatchLines = async (doId, lineDispatches, userId, locationId = null) => {
    const DispatchOrder = dbStore.get('DispatchOrder');
    const DispatchOrderLine = dbStore.get('DispatchOrderLine');
    const Item = dbStore.get('Item');
    const ItemLocationStock = dbStore.get('ItemLocationStock');
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

    const dispatchOrder = await DispatchOrder.findByPk(doId);
    if (!dispatchOrder) {
        const error = new Error('Dispatch Order not found');
        error.statusCode = 404;
        throw error;
    }
    if (!['confirmed', 'partial'].includes(dispatchOrder.status)) {
        const error = new Error('Dispatch can only be executed on confirmed or partial Dispatch Orders');
        error.statusCode = 400;
        throw error;
    }

    const transaction = await sequelize.transaction();
    try {
        const resolvedLocation = await resolveMovementLocation({
            requestedLocationId: locationId,
            userId,
            transaction,
            lock: true,
            operationLabel: 'dispatch execution'
        });
        const resolvedLocationId = resolvedLocation?.location_id || null;

        for (const { line_id, qty_to_dispatch, batch_id } of lineDispatches) {
            if (!qty_to_dispatch || qty_to_dispatch <= 0) continue;

            const line = await DispatchOrderLine.findOne({
                where: { line_id, do_id: doId },
                include: [{ model: Item, as: 'item' }],
                transaction
            });

            if (!line) {
                const error = new Error(`Line ID ${line_id} not found on Dispatch Order ${dispatchOrder.do_number}`);
                error.statusCode = 404;
                throw error;
            }

            const item = line.item;
            const remainingQty = parseFloat(line.qty_ordered) - parseFloat(line.qty_dispatched);

            if (qty_to_dispatch > remainingQty + 0.001) {
                const error = new Error(`Cannot dispatch ${qty_to_dispatch} ${item.unit_of_measure} of "${item.name}" — only ${remainingQty.toFixed(4)} remaining`);
                error.statusCode = 400;
                throw error;
            }

            if (resolvedLocationId) {
                const locationStock = await ItemLocationStock.findOne({
                    where: {
                        item_id: item.item_id,
                        location_id: resolvedLocationId
                    },
                    attributes: ['quantity_on_hand'],
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                const availableAtLocation = Number.parseFloat(locationStock?.quantity_on_hand || 0);
                if (availableAtLocation + 0.000001 < qty_to_dispatch) {
                    const error = new Error(
                        `Insufficient stock for "${item.name}" at location ${resolvedLocationId}. `
                        + `Available: ${availableAtLocation} ${item.unit_of_measure}, requested: ${qty_to_dispatch}`
                    );
                    error.statusCode = 400;
                    throw error;
                }
            } else if (parseFloat(item.current_stock) < qty_to_dispatch) {
                const error = new Error(`Insufficient stock for "${item.name}". Available: ${item.current_stock} ${item.unit_of_measure}, requested: ${qty_to_dispatch}`);
                error.statusCode = 400;
                throw error;
            }

            // Determine FIFO vs FEFO — perishable items (shelf_life_days set) use FEFO
            // reference_id stores line_id (string) so that voidMovement() can find the DO line.
            // do_number is captured in notes for human readability.
            const movementData = {
                item_id: item.item_id,
                quantity: qty_to_dispatch,
                movement_type: 'goods_issue',
                reference_id: String(line.line_id),
                reference_type: 'DO',
                notes: `Dispatch to ${dispatchOrder.recipient_name} (${dispatchOrder.do_number})`,
                cost_per_unit: parseFloat(line.cost_per_unit) || item.cost_per_unit,
                location_id: resolvedLocationId || undefined
            };

            // If a specific batch is requested, pass it. Otherwise let FIFO/FEFO kick in.
            if (batch_id) {
                movementData.batch_id = batch_id;
            }

            // For FEFO (perishable items): set a flag so stockMovementService sorts by expiry_date
            // The existing createStockMovement already uses FIFO (received_date ASC).
            // For FEFO we need expiry_date ASC — pass fefo flag to trigger alternate sort.
            if (item.fifo_enabled && item.shelf_life_days && !batch_id) {
                movementData.use_fefo = true;
            }

            const movement = await issueStockForDispatch(movementData, userId, transaction);

            // Update line quantities and snapshot the primary batch
            await line.update({
                qty_dispatched: parseFloat(line.qty_dispatched) + qty_to_dispatch,
                batch_id: movement.batch_id || line.batch_id,
                cost_per_unit: line.cost_per_unit || (parseFloat(movement.weighted_average_cost) || item.cost_per_unit)
            }, { transaction });

            // Persist the sale price as the item's default for future DOs
            if (line.sale_price_per_unit != null) {
                await Item.update(
                    { default_sale_price: parseFloat(line.sale_price_per_unit) },
                    { where: { item_id: item.item_id }, transaction }
                );
            }
        }

        // Recalculate DO status based on all lines
        await recalculateDOStatus(doId, transaction);

        await transaction.commit();
        return getDispatchOrderById(doId);
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
};

export const cancelDispatchOrder = async (doId, userId, reason) => {
    const DispatchOrder = dbStore.get('DispatchOrder');

    const dispatchOrder = await DispatchOrder.findByPk(doId);
    if (!dispatchOrder) {
        const error = new Error('Dispatch Order not found');
        error.statusCode = 404;
        throw error;
    }
    if (['completed', 'cancelled'].includes(dispatchOrder.status)) {
        const error = new Error('Completed or already cancelled Dispatch Orders cannot be cancelled');
        error.statusCode = 400;
        throw error;
    }

    // Note: if the DO is partial, the already-dispatched goods_issue movements
    // must be voided separately by the user via the stock movements void workflow.
    // This sets the document status to cancelled but does not auto-void movements.
    await dispatchOrder.update({
        status: 'cancelled',
        notes: dispatchOrder.notes
            ? `${dispatchOrder.notes}\n[Cancelled by user ${userId}: ${reason || 'No reason provided'}]`
            : `[Cancelled by user ${userId}: ${reason || 'No reason provided'}]`
    });

    return getDispatchOrderById(doId);
};

export const archiveDispatchOrder = async (doId, userId) => {
    const DispatchOrder = dbStore.get('DispatchOrder');

    const dispatchOrder = await DispatchOrder.findByPk(doId);
    if (!dispatchOrder) {
        const error = new Error('Dispatch Order not found');
        error.statusCode = 404;
        throw error;
    }
    if (!['completed', 'cancelled'].includes(dispatchOrder.status)) {
        const error = new Error('Only completed or cancelled Dispatch Orders can be archived');
        error.statusCode = 400;
        throw error;
    }
    if (dispatchOrder.archived_at) {
        const error = new Error('Dispatch Order is already archived');
        error.statusCode = 400;
        throw error;
    }

    await dispatchOrder.update({
        archived_at: new Date(),
        archived_by: userId
    });

    return dispatchOrder;
};

// ─────────────────────────────────────────────────────────────
// CSV Export
// ─────────────────────────────────────────────────────────────

export const exportDispatchOrders = async (params = {}) => {
    const { dispatchOrders } = await getDispatchOrders({ ...params, limit: 10000, page: 1 });

    const rows = [];
    for (const doRecord of dispatchOrders) {
        for (const line of (doRecord.lines || [])) {
            const effectiveQty = parseFloat(line.qty_dispatched) - parseFloat(line.qty_voided);
            const salePrice = line.sale_price_per_unit != null ? parseFloat(line.sale_price_per_unit) : null;
            const costPrice = line.cost_per_unit != null ? parseFloat(line.cost_per_unit) : null;
            const revenue = salePrice != null ? salePrice * effectiveQty : null;
            const cogs = costPrice != null ? costPrice * effectiveQty : null;
            const grossProfit = revenue != null && cogs != null ? revenue - cogs : null;
            const marginPct = revenue != null && revenue > 0 && grossProfit != null
                ? ((grossProfit / revenue) * 100).toFixed(2)
                : null;

            rows.push({
                do_number: doRecord.do_number,
                status: doRecord.status,
                recipient_name: doRecord.recipient_name,
                recipient_type: doRecord.recipient_type,
                dispatch_date: doRecord.dispatch_date,
                reference_jo: doRecord.reference_jo || '',
                reference_po: doRecord.reference_po || '',
                item_sku: line.item?.sku_code || '',
                item_name: line.item?.name || '',
                qty_ordered: line.qty_ordered,
                qty_dispatched: line.qty_dispatched,
                qty_voided: line.qty_voided,
                unit: line.unit_of_measure || '',
                cost_per_unit: costPrice != null ? costPrice : '',
                sale_price_per_unit: salePrice != null ? salePrice : '',
                revenue: revenue != null ? revenue.toFixed(4) : '',
                gross_profit: grossProfit != null ? grossProfit.toFixed(4) : '',
                margin_pct: marginPct != null ? marginPct : '',
                created_by: doRecord.creator?.username || '',
                notes: doRecord.notes || ''
            });
        }
    }

    const headers = [
        'DO Number', 'Status', 'Recipient', 'Recipient Type', 'Dispatch Date',
        'Ref JO', 'Ref PO', 'SKU', 'Item Name', 'Qty Ordered', 'Qty Dispatched',
        'Qty Voided', 'UOM', 'Cost/Unit', 'Sale Price/Unit', 'Revenue',
        'Gross Profit', 'Margin %', 'Created By', 'Notes'
    ];

    const csvLines = [headers.join(',')];
    for (const row of rows) {
        csvLines.push([
            escapeCSVCell(row.do_number),
            escapeCSVCell(row.status),
            escapeCSVCell(row.recipient_name),
            escapeCSVCell(row.recipient_type),
            escapeCSVCell(row.dispatch_date),
            escapeCSVCell(row.reference_jo),
            escapeCSVCell(row.reference_po),
            escapeCSVCell(row.item_sku),
            escapeCSVCell(row.item_name),
            row.qty_ordered,
            row.qty_dispatched,
            row.qty_voided,
            escapeCSVCell(row.unit),
            row.cost_per_unit,
            row.sale_price_per_unit,
            row.revenue,
            row.gross_profit,
            row.margin_pct,
            escapeCSVCell(row.created_by),
            escapeCSVCell(row.notes)
        ].join(','));
    }

    return csvLines.join('\n');
};

// ─────────────────────────────────────────────────────────────
// Earnings Report
// ─────────────────────────────────────────────────────────────

/**
 * Builds the shared WHERE clause and positional replacements array
 * for earnings queries (applied to the dispatch_orders table alias `do`).
 */
const buildEarningsWhere = (params) => {
    const conditions = [];
    const replacements = [];

    conditions.push('`do`.archived_at IS NULL');

    const validStatuses = ['partial', 'completed'];
    const rawStatus = params.status || 'completed';
    const statuses = rawStatus.split(',').map(s => s.trim()).filter(s => validStatuses.includes(s));
    if (!statuses.length) statuses.push('completed');
    conditions.push(`\`do\`.status IN (${statuses.map(() => '?').join(',')})`);
    replacements.push(...statuses);

    // Normalize to plain YYYY-MM-DD string — Joi.date().iso() converts inputs to Date objects,
    // and serializing a Date object carries UTC offset which can shift boundaries on non-UTC servers.
    const toDateStr = (val) => val instanceof Date ? val.toISOString().slice(0, 10) : String(val);
    if (params.date_from) { conditions.push('`do`.dispatch_date >= ?'); replacements.push(toDateStr(params.date_from)); }
    if (params.date_to)   { conditions.push('`do`.dispatch_date <= ?'); replacements.push(toDateStr(params.date_to)); }
    if (params.recipient_type) { conditions.push('`do`.recipient_type = ?'); replacements.push(params.recipient_type); }

    return { conditions, replacements };
};

/**
 * Aggregated gross earnings report for dispatched orders.
 * Only lines with sale_price_per_unit != null contribute to revenue.
 * Effective qty = GREATEST(qty_dispatched - qty_voided, 0) — guards against over-voiding.
 * Runs 6 parallel SQL queries instead of loading all rows into memory.
 *
 * @param {object} params - { date_from, date_to, recipient_type, item_id, period, status }
 */
export const getEarningsReport = async (params = {}) => {
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    const { item_id, period = 'month' } = params;

    const { conditions: baseConditions, replacements: baseReplacements } = buildEarningsWhere(params);
    const baseWhere = baseConditions.join(' AND ');

    // Applied to dispatch_order_lines in all breakdowns except the excluded count
    const lineFilter = `
      AND dol.sale_price_per_unit IS NOT NULL
      AND GREATEST(dol.qty_dispatched - dol.qty_voided, 0) > 0`;

    const itemFilter = item_id ? ' AND dol.item_id = ?' : '';
    const itemReplacements = item_id ? [parseInt(item_id)] : [];

    // Shared replacements for summary / by_item / by_order / by_recipient queries
    const sharedReplacements = [...baseReplacements, ...itemReplacements];

    // DATE_FORMAT string for by_period grouping
    const formatStr = period === 'day' ? '%Y-%m-%d' : period === 'week' ? '%x-W%v' : '%Y-%m';

    // ── SQL Queries ───────────────────────────────────────────────────────────

    const summarySQL = `
        SELECT
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * dol.sale_price_per_unit), 0) AS revenue,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * COALESCE(dol.cost_per_unit, 0)), 0) AS cogs,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0)), 0) AS units_dispatched,
          COUNT(DISTINCT \`do\`.do_id) AS orders_counted
        FROM dispatch_orders \`do\`
        INNER JOIN dispatch_order_lines dol ON dol.do_id = \`do\`.do_id
        WHERE ${baseWhere}${lineFilter}${itemFilter}`;

    // Counts DOs in the filtered period that have NO priced+dispatched lines
    const excludedSQL = `
        SELECT COUNT(*) AS excluded_count
        FROM dispatch_orders \`do\`
        WHERE ${baseWhere}
          AND NOT EXISTS (
            SELECT 1 FROM dispatch_order_lines dol
            WHERE dol.do_id = \`do\`.do_id
              AND dol.sale_price_per_unit IS NOT NULL
              AND GREATEST(dol.qty_dispatched - dol.qty_voided, 0) > 0
          )`;

    const byItemSQL = `
        SELECT
          dol.item_id,
          i.sku_code, i.name, i.unit_of_measure,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0)), 0) AS units_dispatched,
          COALESCE(AVG(dol.sale_price_per_unit), 0) AS avg_sale_price,
          COALESCE(AVG(dol.cost_per_unit), 0) AS avg_cost_price,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * dol.sale_price_per_unit), 0) AS revenue,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * COALESCE(dol.cost_per_unit, 0)), 0) AS cogs
        FROM dispatch_order_lines dol
        INNER JOIN dispatch_orders \`do\` ON \`do\`.do_id = dol.do_id
        INNER JOIN items i ON i.item_id = dol.item_id
        WHERE ${baseWhere}${lineFilter}${itemFilter}
        GROUP BY dol.item_id, i.sku_code, i.name, i.unit_of_measure
        ORDER BY revenue DESC
        LIMIT 50`;

    const byOrderSQL = `
        SELECT
          \`do\`.do_id, \`do\`.do_number, \`do\`.recipient_name, \`do\`.recipient_type, \`do\`.dispatch_date,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * dol.sale_price_per_unit), 0) AS revenue,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * COALESCE(dol.cost_per_unit, 0)), 0) AS cogs
        FROM dispatch_orders \`do\`
        INNER JOIN dispatch_order_lines dol ON dol.do_id = \`do\`.do_id
        WHERE ${baseWhere}${lineFilter}${itemFilter}
        GROUP BY \`do\`.do_id, \`do\`.do_number, \`do\`.recipient_name, \`do\`.recipient_type, \`do\`.dispatch_date
        ORDER BY \`do\`.dispatch_date DESC
        LIMIT 100`;

    const byRecipientSQL = `
        SELECT
          \`do\`.recipient_name, \`do\`.recipient_type,
          COUNT(DISTINCT \`do\`.do_id) AS order_count,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * dol.sale_price_per_unit), 0) AS revenue,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * COALESCE(dol.cost_per_unit, 0)), 0) AS cogs
        FROM dispatch_orders \`do\`
        INNER JOIN dispatch_order_lines dol ON dol.do_id = \`do\`.do_id
        WHERE ${baseWhere}${lineFilter}${itemFilter}
        GROUP BY \`do\`.recipient_name, \`do\`.recipient_type
        ORDER BY revenue DESC
        LIMIT 100`;

    // DATE_FORMAT(?) placeholder appears before the WHERE clause, so formatStr goes first
    const byPeriodSQL = `
        SELECT
          DATE_FORMAT(\`do\`.dispatch_date, ?) AS period_label,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * dol.sale_price_per_unit), 0) AS revenue,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0) * COALESCE(dol.cost_per_unit, 0)), 0) AS cogs,
          COALESCE(SUM(GREATEST(dol.qty_dispatched - dol.qty_voided, 0)), 0) AS units_dispatched
        FROM dispatch_orders \`do\`
        INNER JOIN dispatch_order_lines dol ON dol.do_id = \`do\`.do_id
        WHERE ${baseWhere}${lineFilter}${itemFilter}
        GROUP BY period_label
        ORDER BY period_label ASC`;

    // ── Execute in parallel ───────────────────────────────────────────────────

    // When item_id is specified, excluded count is meaningless (it's order-level, not item-level).
    // Skip the query entirely and return 0 to avoid a misleading banner in the UI.
    const excludedPromise = item_id
        ? Promise.resolve([{ excluded_count: 0 }])
        : sequelize.query(excludedSQL, { type: QueryTypes.SELECT, replacements: baseReplacements });

    const [summaryRows, excludedRows, byItemRows, byOrderRows, byRecipientRows, byPeriodRows] = await Promise.all([
        sequelize.query(summarySQL,     { type: QueryTypes.SELECT, replacements: sharedReplacements }),
        excludedPromise,
        sequelize.query(byItemSQL,      { type: QueryTypes.SELECT, replacements: sharedReplacements }),
        sequelize.query(byOrderSQL,     { type: QueryTypes.SELECT, replacements: sharedReplacements }),
        sequelize.query(byRecipientSQL, { type: QueryTypes.SELECT, replacements: sharedReplacements }),
        sequelize.query(byPeriodSQL,    { type: QueryTypes.SELECT, replacements: [formatStr, ...sharedReplacements] }),
    ]);

    // ── Post-process ──────────────────────────────────────────────────────────

    const round4 = (n) => Math.round(parseFloat(n || 0) * 10000) / 10000;
    const round2 = (n) => Math.round(parseFloat(n || 0) * 100) / 100;

    const s = summaryRows[0] || {};
    const revenue = round4(s.revenue);
    const cogs    = round4(s.cogs);
    const gross_profit = round4(revenue - cogs);

    const summary = {
        revenue,
        cogs,
        gross_profit,
        margin_pct:           revenue > 0 ? round2((gross_profit / revenue) * 100) : 0,
        orders_counted:       parseInt(s.orders_counted || 0),
        units_dispatched:     round4(s.units_dispatched),
        excluded_orders_count: parseInt(excludedRows[0]?.excluded_count || 0)
    };

    const by_item = byItemRows.map(row => {
        const rev = round4(row.revenue);
        const c   = round4(row.cogs);
        const gp  = round4(rev - c);
        return {
            item_id:          row.item_id,
            sku_code:         row.sku_code,
            name:             row.name,
            unit_of_measure:  row.unit_of_measure,
            units_dispatched: round4(row.units_dispatched),
            avg_sale_price:   round4(row.avg_sale_price),
            avg_cost_price:   round4(row.avg_cost_price),
            revenue:          rev,
            cogs:             c,
            gross_profit:     gp,
            margin_pct:       rev > 0 ? round2((gp / rev) * 100) : 0
        };
    });

    const by_order = byOrderRows.map(row => {
        const rev = round4(row.revenue);
        const c   = round4(row.cogs);
        const gp  = round4(rev - c);
        return {
            do_id:          row.do_id,
            do_number:      row.do_number,
            recipient_name: row.recipient_name,
            recipient_type: row.recipient_type,
            dispatch_date:  row.dispatch_date,
            revenue:        rev,
            cogs:           c,
            gross_profit:   gp,
            margin_pct:     rev > 0 ? round2((gp / rev) * 100) : 0
        };
    });

    const by_recipient = byRecipientRows.map(row => {
        const rev = round4(row.revenue);
        const c   = round4(row.cogs);
        const gp  = round4(rev - c);
        return {
            recipient_name: row.recipient_name,
            recipient_type: row.recipient_type,
            order_count:    parseInt(row.order_count || 0),
            revenue:        rev,
            cogs:           c,
            gross_profit:   gp,
            margin_pct:     rev > 0 ? round2((gp / rev) * 100) : 0
        };
    });

    const by_period = byPeriodRows.map(row => {
        const rev = round4(row.revenue);
        const c   = round4(row.cogs);
        const gp  = round4(rev - c);
        return {
            period_label:     row.period_label,
            units_dispatched: round4(row.units_dispatched),
            revenue:          rev,
            cogs:             c,
            gross_profit:     gp,
            margin_pct:       rev > 0 ? round2((gp / rev) * 100) : 0
        };
    });

    return { summary, by_item, by_order, by_recipient, by_period };
};

// ─────────────────────────────────────────────────────────────
// Retroactive Sale Price Update
// ─────────────────────────────────────────────────────────────

/**
 * Updates the sale_price_per_unit on a single DO line (non-draft only).
 * Also propagates the new price to item.default_sale_price so future DOs are pre-filled.
 *
 * @param {number} doId
 * @param {number} lineId
 * @param {number|null} salePrice
 */
export const updateLineSalePrice = async (doId, lineId, salePrice) => {
    const DispatchOrder = dbStore.get('DispatchOrder');
    const DispatchOrderLine = dbStore.get('DispatchOrderLine');
    const Item = dbStore.get('Item');
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

    const dispatchOrder = await DispatchOrder.findByPk(doId);
    if (!dispatchOrder) {
        const error = new Error('Dispatch Order not found');
        error.statusCode = 404;
        throw error;
    }
    if (dispatchOrder.status === 'draft') {
        const error = new Error('Use the edit order flow to modify draft orders');
        error.statusCode = 400;
        throw error;
    }

    const line = await DispatchOrderLine.findOne({ where: { line_id: lineId, do_id: doId } });
    if (!line) {
        const error = new Error('Line not found on this Dispatch Order');
        error.statusCode = 404;
        throw error;
    }
    const normalizedSalePrice = Number(salePrice);
    if (!Number.isFinite(normalizedSalePrice) || normalizedSalePrice <= 0) {
        const error = new Error('Dispatch Order line sale price must be a positive amount.');
        error.statusCode = 400;
        error.reason_code = 'MISSING_PRICE';
        throw error;
    }

    const transaction = await sequelize.transaction();
    try {
        await line.update({ sale_price_per_unit: normalizedSalePrice }, { transaction });

        // Propagate to item's default_sale_price so future DOs are pre-filled
        await Item.update(
            { default_sale_price: normalizedSalePrice },
            { where: { item_id: line.item_id }, transaction }
        );

        await transaction.commit();
        return getDispatchOrderById(doId);
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
};
