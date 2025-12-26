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

