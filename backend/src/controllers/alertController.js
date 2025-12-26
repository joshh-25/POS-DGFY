import * as alertService from '../services/alertService.js';

export const generateAlerts = async (req, res, next) => {
  try {
    const alerts = await alertService.generateAlerts();
    res.status(200).json({
      success: true,
      data: { alerts },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

