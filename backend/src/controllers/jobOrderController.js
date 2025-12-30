import * as jobOrderService from '../services/jobOrderService.js';

export const getJobOrders = async (req, res, next) => {
  try {
    const result = await jobOrderService.getJobOrders(req.query);
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getJobOrderById = async (req, res, next) => {
  try {
    const jo = await jobOrderService.getJobOrderById(req.params.jo_id);
    res.status(200).json({
      success: true,
      data: jo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const createJobOrder = async (req, res, next) => {
  try {
    const joData = req.validatedData;
    const userId = req.user.user_id;
    const jo = await jobOrderService.createJobOrder(joData, userId);

    const message = jo.status === 'draft' ? 'Job order draft saved successfully' : 'Job order created successfully';

    res.status(201).json({
      success: true,
      data: jo,
      message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const finalizeJobOrder = async (req, res, next) => {
  try {
    const { jo_id } = req.params;
    const userId = req.user.user_id;
    const jo = await jobOrderService.finalizeJobOrder(jo_id, userId);

    res.status(200).json({
      success: true,
      data: jo,
      message: 'Job order finalized successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const completeJobOrder = async (req, res, next) => {
  try {
    const jo = await jobOrderService.completeJobOrder(req.params.jo_id, req.user.user_id);
    res.status(200).json({
      success: true,
      data: jo,
      message: 'Job order completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

