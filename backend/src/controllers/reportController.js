import * as reportService from '../services/reportService.js';

export const getStockAging = async (req, res, next) => {
  try {
    const data = await reportService.getStockAgingReport();
    res.status(200).json({
      success: true,
      data: { aging: data },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getSurplusShortage = async (req, res, next) => {
  try {
    const data = await reportService.getSurplusShortageReport();
    res.status(200).json({
      success: true,
      data: { items: data },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getFinancialSummary = async (req, res, next) => {
  try {
    const data = await reportService.getFinancialSummary();
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getSupplierPerformance = async (req, res, next) => {
  try {
    const data = await reportService.getSupplierPerformanceReport();
    res.status(200).json({
      success: true,
      data: { suppliers: data },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

