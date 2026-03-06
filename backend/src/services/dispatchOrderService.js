import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { createStockMovement } from './stockMovementService.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';

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
            await DispatchOrderLine.create({
                do_id: dispatchOrder.do_id,
                item_id: line.item_id,
                qty_ordered: line.qty_ordered,
                qty_dispatched: 0,
                qty_voided: 0,
                unit_of_measure: item.unit_of_measure,
                cost_per_unit: item.cost_per_unit || null,
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

export const updateDispatchOrder = async (doId, data, userId) => {
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
                await DispatchOrderLine.create({
                    do_id: doId,
                    item_id: line.item_id,
                    qty_ordered: line.qty_ordered,
                    qty_dispatched: 0,
                    qty_voided: 0,
                    unit_of_measure: item.unit_of_measure,
                    cost_per_unit: item.cost_per_unit || null,
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
 */
export const dispatchLines = async (doId, lineDispatches, userId) => {
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
    if (!['confirmed', 'partial'].includes(dispatchOrder.status)) {
        const error = new Error('Dispatch can only be executed on confirmed or partial Dispatch Orders');
        error.statusCode = 400;
        throw error;
    }

    const transaction = await sequelize.transaction();
    try {
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

            if (parseFloat(item.current_stock) < qty_to_dispatch) {
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
                cost_per_unit: parseFloat(line.cost_per_unit) || item.cost_per_unit
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

            const movement = await createStockMovement(movementData, userId, transaction);

            // Update line quantities and snapshot the primary batch
            await line.update({
                qty_dispatched: parseFloat(line.qty_dispatched) + qty_to_dispatch,
                batch_id: movement.batch_id || line.batch_id,
                cost_per_unit: line.cost_per_unit || (parseFloat(movement.weighted_average_cost) || item.cost_per_unit)
            }, { transaction });
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
                cost_per_unit: line.cost_per_unit || '',
                created_by: doRecord.creator?.username || '',
                notes: doRecord.notes || ''
            });
        }
    }

    const headers = [
        'DO Number', 'Status', 'Recipient', 'Recipient Type', 'Dispatch Date',
        'Ref JO', 'Ref PO', 'SKU', 'Item Name', 'Qty Ordered', 'Qty Dispatched',
        'Qty Voided', 'UOM', 'Cost/Unit', 'Created By', 'Notes'
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
            escapeCSVCell(row.created_by),
            escapeCSVCell(row.notes)
        ].join(','));
    }

    return csvLines.join('\n');
};
