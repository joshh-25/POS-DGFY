import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import logger from '../config/logger.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';

/**
 * List all inventory folders with item counts
 */
export const listFolders = async () => {
    const ItemFolder = dbStore.get('ItemFolder');
    const Item = dbStore.get('Item');

    console.log('ItemFolder model:', !!ItemFolder);
    console.log('Item model:', !!Item);

    try {
        const folders = await ItemFolder.findAll({
            include: [
                {
                    model: Item,
                    as: 'items',
                    attributes: ['item_id'],
                    required: false,
                    where: buildVisibleWhere(
                        {},
                        { statusField: 'status', excludeInactiveStatus: true }
                    )
                }
            ]
        });

        return folders.map(f => ({
            folder_id: f.folder_id,
            name: f.name,
            description: f.description,
            parent_id: f.parent_id,
            item_count: f.items?.length || 0
        }));
    } catch (error) {
        logger.error('Error listing inventory folders:', error);
        throw error;
    }
};

/**
 * Create a new inventory folder
 */
export const createFolder = async (name, description = '', parent_id = null) => {
    const ItemFolder = dbStore.get('ItemFolder');

    try {
        const folder = await ItemFolder.create({
            name,
            description,
            parent_id
        });

        return {
            success: true,
            folder_id: folder.folder_id,
            name: folder.name,
            message: `Inventory folder "${name}" created successfully`
        };
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error(`Folder "${name}" already exists`, { cause: error });
        }
        logger.error('Error creating inventory folder:', error);
        throw error;
    }
};

/**
 * Assign items to an inventory folder
 */
export const assignItemsToFolder = async (folderName, itemIds) => {
    const ItemFolder = dbStore.get('ItemFolder');
    const Item = dbStore.get('Item');

    try {
        // Find the folder
        const folder = await ItemFolder.findOne({
            where: { name: folderName }
        });

        if (!folder) {
            throw new Error(`Inventory folder "${folderName}" not found`);
        }

        // Update items - Sync both folder_id (new) and product_folder (legacy string)
        const [updatedCount] = await Item.update(
            {
                folder_id: folder.folder_id,
                product_folder: folder.name // Sync for frontend compatibility
            },
            {
                where: {
                    ...buildVisibleWhere(
                        { item_id: { [Op.in]: itemIds } },
                        { statusField: 'status', excludeInactiveStatus: true }
                    )
                }
            }
        );

        return {
            success: true,
            updated_count: updatedCount,
            folder_id: folder.folder_id,
            folder_name: folder.name,
            message: `Successfully moved ${updatedCount} items to "${folderName}"`
        };
    } catch (error) {
        logger.error('Error assigning items to folder:', error);
        throw error;
    }
};

/**
 * Get details of a folder including items
 */
export const getFolderDetails = async (folderName) => {
    const ItemFolder = dbStore.get('ItemFolder');
    const Item = dbStore.get('Item');

    try {
        const folder = await ItemFolder.findOne({
            where: { name: folderName },
            include: [
                {
                    model: Item,
                    as: 'items',
                    attributes: ['item_id', 'sku_code', 'name', 'category', 'current_stock', 'unit_of_measure'],
                    required: false,
                    where: buildVisibleWhere(
                        {},
                        { statusField: 'status', excludeInactiveStatus: true }
                    )
                }
            ]
        });

        if (!folder) {
            throw new Error(`Inventory folder "${folderName}" not found`);
        }

        return {
            folder_id: folder.folder_id,
            name: folder.name,
            description: folder.description,
            item_count: folder.items?.length || 0,
            items: folder.items?.map(item => ({
                id: item.item_id,
                sku_code: item.sku_code,
                name: item.name,
                category: item.category,
                stock: item.current_stock,
                unit: item.unit_of_measure
            })) || []
        };
    } catch (error) {
        logger.error('Error getting folder details:', error);
        throw error;
    }
};

/**
 * Delete an inventory folder and unassign all items inside it
 */
export const deleteFolder = async (folderId) => {
    const ItemFolder = dbStore.get('ItemFolder');
    const Item = dbStore.get('Item');

    const folder = await ItemFolder.findByPk(folderId);
    if (!folder) {
        const error = new Error('Folder not found');
        error.statusCode = 404;
        throw error;
    }

    // Unassign all items in this folder
    const [unassignedCount] = await Item.update(
        { folder_id: null, product_folder: null },
        {
            where: buildVisibleWhere(
                { folder_id: folderId },
                { statusField: 'status', excludeInactiveStatus: true }
            )
        }
    );

    await folder.destroy();

    return {
        success: true,
        unassigned_count: unassignedCount,
        message: `Folder "${folder.name}" deleted successfully. ${unassignedCount} item(s) unassigned.`
    };
};

export default {
    listFolders,
    createFolder,
    assignItemsToFolder,
    getFolderDetails,
    deleteFolder
};
