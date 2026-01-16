import * as stockMovementService from '../services/stockMovementService.js';

export const getStockMovements = async (req, res, next) => {
  try {
    const result = await stockMovementService.getStockMovements(req.query);
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getMovementById = async (req, res, next) => {
  try {
    const movement = await stockMovementService.getMovementById(req.params.id);
    res.status(200).json({
      success: true,
      data: movement,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getMovementStats = async (req, res, next) => {
  try {
    const stats = await stockMovementService.getMovementStats(req.query);
    res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const createStockMovement = async (req, res, next) => {
  try {
    const movement = await stockMovementService.createStockMovement(
      req.body,
      req.user.user_id
    );
    res.status(201).json({
      success: true,
      data: movement,
      message: 'Stock movement recorded successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const voidMovement = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      const error = new Error('Reason is required');
      error.statusCode = 400;
      throw error;
    }
    const result = await stockMovementService.voidMovement(
      req.params.id,
      req.user.user_id,
      reason
    );
    res.status(200).json({
      success: true,
      data: result,
      message: 'Movement voided successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const exportMovements = async (req, res, next) => {
  try {
    const data = await stockMovementService.exportMovements(req.query);
    // If request asks for CSV download
    if (req.query.format === 'csv') {
      // Robust CSV conversion
      const escapeCSV = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const headers = Object.keys(data[0] || {}).join(',');
      const rows = data.map(row => Object.values(row).map(v => escapeCSV(v)).join(','));
      const csv = [headers, ...rows].join('\n');

      res.header('Content-Type', 'text/csv');
      res.attachment(`stock_movements_${new Date().toISOString()}.csv`);
      return res.send(csv);
    }

    res.status(200).json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const createBulkMovements = async (req, res, next) => {
  try {
    const result = await stockMovementService.createBulkMovements(
      req.body.movements,
      req.user.user_id
    );
    res.status(201).json({
      success: true,
      data: result,
      message: `${result.length} movements recorded successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};
