import * as forecastService from '../services/forecastService.js';

export const getStockForecast = async (req, res, next) => {
  try {
    const daysAhead = parseInt(req.query.days || 30);
    const forecasts = await forecastService.forecastStockLevels(daysAhead);
    res.status(200).json({
      success: true,
      data: { forecasts },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

