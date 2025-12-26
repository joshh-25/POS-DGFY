import * as dashboardService from '../services/dashboardService.js';

export const getStats = async (req, res, next) => {
  try {
    const stats = await dashboardService.getDashboardStats();
    res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getLowStock = async (req, res, next) => {
  try {
    const items = await dashboardService.getLowStockItems();
    res.status(200).json({
      success: true,
      data: { items },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getRecentMovements = async (req, res, next) => {
  try {
    const limit = req.query.limit || 10;
    const movements = await dashboardService.getRecentMovements(limit);
    res.status(200).json({
      success: true,
      data: { movements },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

