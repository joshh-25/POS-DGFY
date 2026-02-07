import * as itemService from '../services/itemService.js';
import * as itemGroupingService from '../services/itemGroupingService.js';
import { validateComposition as validateCompositionService } from '../services/compositionValidationService.js';

export const getItems = async (req, res, next) => {
  try {
    const result = await itemService.getItems(req.query);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getItemById = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const item = await itemService.getItemById(item_id);

    res.status(200).json({
      success: true,
      data: item,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const createItem = async (req, res, next) => {
  try {
    const itemData = req.validatedData;
    const userId = req.user.user_id;
    const item = await itemService.createItem(itemData, userId);

    const message = item.status === 'draft' ? 'Item draft saved successfully' : 'Item created successfully';

    res.status(201).json({
      success: true,
      data: {
        item_id: item.item_id,
        sku_code: item.sku_code,
        name: item.name,
        category: item.category,
        status: item.status
      },
      message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const updateItem = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const itemData = req.validatedData;
    const userId = req.user.user_id;



    const item = await itemService.updateItem(item_id, itemData, userId);

    res.status(200).json({
      success: true,
      data: item,
      message: 'Item updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const finalizeItem = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const itemData = req.validatedData || req.body || {};
    const userId = req.user.user_id;
    const item = await itemService.finalizeItem(item_id, itemData, userId);

    res.status(200).json({
      success: true,
      data: item,
      message: 'Item finalized successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const deleteItem = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const userId = req.user.user_id;

    await itemService.deleteItem(item_id, userId);

    res.status(200).json({
      success: true,
      data: null,
      message: 'Item deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // If error has details array (from validation), include it in response
    if (error.details) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString()
      });
    }
    next(error);
  }
};

export const getItemStockHistory = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const movements = await itemService.getItemStockHistory(item_id, req.query);

    res.status(200).json({
      success: true,
      data: { movements },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getItemBatches = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const batches = await itemService.getItemBatches(item_id);

    res.status(200).json({
      success: true,
      data: { batches },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getItemMovements = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const movements = await itemService.getItemMovements(item_id);

    res.status(200).json({
      success: true,
      data: { movements },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const validateComposition = async (req, res, next) => {
  try {
    const { product_id, ingredient_ids } = req.body;

    if (!ingredient_ids || !Array.isArray(ingredient_ids)) {
      return res.status(400).json({
        success: false,
        message: 'ingredient_ids must be an array',
        timestamp: new Date().toISOString()
      });
    }

    const result = await validateCompositionService(product_id, ingredient_ids);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getItemSupplierCoverage = async (req, res, next) => {
  try {
    const result = await itemService.getItemSupplierCoverage();

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getFolders = async (req, res, next) => {
  try {
    const folders = await itemGroupingService.listFolders();
    res.status(200).json({
      success: true,
      data: folders,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const createFolder = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const result = await itemGroupingService.createFolder(name, description);
    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const deleteFolder = async (req, res, next) => {
  try {
    const { folder_id } = req.params;
    const result = await itemGroupingService.deleteFolder(folder_id);
    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

