import BatchLineage from '../models/BatchLineage.js';
import FIFOBatch from '../models/FIFOBatch.js';
import Item from '../models/Item.js';
import { Op } from 'sequelize';
import logger from '../config/logger.js';

/**
 * Create batch lineage records when a product is produced from ingredients
 * @param {number} parentBatchId - The batch ID of the produced product
 * @param {Array} consumedBatches - Array of { batchId, quantityConsumed }
 * @param {string} joNumber - The job order number
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<Array>} Created lineage records
 */
export const createBatchLineage = async (parentBatchId, consumedBatches, joNumber, transaction = null) => {
    if (!consumedBatches || consumedBatches.length === 0) {
        return [];
    }

    const lineageRecords = consumedBatches.map(consumed => ({
        parent_batch_id: parentBatchId,
        child_batch_id: consumed.batchId,
        quantity_consumed: consumed.quantityConsumed,
        jo_number: joNumber
    }));

    const created = await BatchLineage.bulkCreate(lineageRecords, { transaction });

    logger.info(`Created ${created.length} batch lineage records for batch ${parentBatchId}`);

    return created;
};

/**
 * Get the ancestry tree of a batch (what batches were consumed to make it)
 * @param {number} batchId - The batch ID to trace ancestry for
 * @param {number} maxDepth - Maximum depth to traverse (default 5)
 * @returns {Promise<Object>} Tree structure of ancestor batches
 */
export const getBatchAncestry = async (batchId, maxDepth = 5) => {
    const batch = await FIFOBatch.findByPk(batchId, {
        include: [{
            model: Item,
            as: 'item',
            attributes: ['item_id', 'name', 'sku_code', 'category']
        }]
    });

    if (!batch) {
        return null;
    }

    const result = {
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        item: batch.item ? {
            item_id: batch.item.item_id,
            name: batch.item.name,
            sku_code: batch.item.sku_code,
            category: batch.item.category
        } : null,
        quantity: parseFloat(batch.quantity),
        cost_per_unit: parseFloat(batch.cost_per_unit),
        created_at: batch.created_at,
        ancestors: []
    };

    if (maxDepth <= 0) {
        return result;
    }

    // Get lineage where this batch is the parent (consumed batches)
    const lineages = await BatchLineage.findAll({
        where: { parent_batch_id: batchId }
    });

    for (const lineage of lineages) {
        const ancestor = await getBatchAncestry(lineage.child_batch_id, maxDepth - 1);
        if (ancestor) {
            result.ancestors.push({
                ...ancestor,
                quantity_consumed: parseFloat(lineage.quantity_consumed),
                jo_number: lineage.jo_number
            });
        }
    }

    return result;
};

/**
 * Get the descendant tree of a batch (what batches were made using it)
 * @param {number} batchId - The batch ID to trace descendants for
 * @param {number} maxDepth - Maximum depth to traverse (default 5)
 * @returns {Promise<Object>} Tree structure of descendant batches
 */
export const getBatchDescendants = async (batchId, maxDepth = 5) => {
    const batch = await FIFOBatch.findByPk(batchId, {
        include: [{
            model: Item,
            as: 'item',
            attributes: ['item_id', 'name', 'sku_code', 'category']
        }]
    });

    if (!batch) {
        return null;
    }

    const result = {
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        item: batch.item ? {
            item_id: batch.item.item_id,
            name: batch.item.name,
            sku_code: batch.item.sku_code,
            category: batch.item.category
        } : null,
        quantity: parseFloat(batch.quantity),
        cost_per_unit: parseFloat(batch.cost_per_unit),
        created_at: batch.created_at,
        descendants: []
    };

    if (maxDepth <= 0) {
        return result;
    }

    // Get lineage where this batch is the child (parent batches that used it)
    const lineages = await BatchLineage.findAll({
        where: { child_batch_id: batchId }
    });

    for (const lineage of lineages) {
        const descendant = await getBatchDescendants(lineage.parent_batch_id, maxDepth - 1);
        if (descendant) {
            result.descendants.push({
                ...descendant,
                quantity_used: parseFloat(lineage.quantity_consumed),
                jo_number: lineage.jo_number
            });
        }
    }

    return result;
};

/**
 * Get full lineage tree for a batch (both ancestry and descendants)
 * @param {number} batchId - The batch ID
 * @param {number} maxDepth - Maximum depth for each direction
 * @returns {Promise<Object>} Combined lineage tree
 */
export const getBatchLineageTree = async (batchId, maxDepth = 5) => {
    const [ancestry, descendants] = await Promise.all([
        getBatchAncestry(batchId, maxDepth),
        getBatchDescendants(batchId, maxDepth)
    ]);

    if (!ancestry) {
        return null;
    }

    return {
        ...ancestry,
        descendants: descendants?.descendants || []
    };
};

/**
 * Get all batches that were used to produce a specific job order
 * @param {string} joNumber - The job order number
 * @returns {Promise<Array>} Array of lineage records with batch details
 */
export const getLineageByJobOrder = async (joNumber) => {
    const lineages = await BatchLineage.findAll({
        where: { jo_number: joNumber },
        include: [
            {
                model: FIFOBatch,
                as: 'parentBatch',
                include: [{
                    model: Item,
                    as: 'item',
                    attributes: ['item_id', 'name', 'sku_code']
                }]
            },
            {
                model: FIFOBatch,
                as: 'childBatch',
                include: [{
                    model: Item,
                    as: 'item',
                    attributes: ['item_id', 'name', 'sku_code']
                }]
            }
        ]
    });

    return lineages.map(l => ({
        lineage_id: l.lineage_id,
        parent_batch: {
            batch_id: l.parentBatch.batch_id,
            batch_number: l.parentBatch.batch_number,
            item_name: l.parentBatch.item?.name,
            sku_code: l.parentBatch.item?.sku_code
        },
        child_batch: {
            batch_id: l.childBatch.batch_id,
            batch_number: l.childBatch.batch_number,
            item_name: l.childBatch.item?.name,
            sku_code: l.childBatch.item?.sku_code
        },
        quantity_consumed: parseFloat(l.quantity_consumed),
        created_at: l.created_at
    }));
};

export default {
    createBatchLineage,
    getBatchAncestry,
    getBatchDescendants,
    getBatchLineageTree,
    getLineageByJobOrder
};
