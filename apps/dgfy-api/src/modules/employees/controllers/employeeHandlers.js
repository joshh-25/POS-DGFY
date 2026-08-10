import { createEmployeeUseCase, listEmployeesUseCase, updateEmployeeUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const respond = (req, res, result, message, successStatusCode = 200) => sendUseCaseResult(res, result, {
  successStatusCodeResolver: () => successStatusCode,
  successPayloadResolver: () => ({ success: true, data: result.data, message, timestamp: new Date().toISOString() }),
  errorPayloadResolver: (failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: req.requestId || res.locals?.requestId || null,
    timestamp: new Date().toISOString()
  })
});

export const listEmployees = async (req, res, next) => {
  try {
    return respond(req, res, await listEmployeesUseCase({
      includeInactive: req.validatedQuery?.include_inactive === true
    }), 'Employees retrieved successfully');
  } catch (error) {
    return next(error);
  }
};

export const createEmployee = async (req, res, next) => {
  try {
    return respond(req, res, await createEmployeeUseCase({
      payload: req.validatedData,
      actorUserId: req.user.user_id
    }), 'Employee created successfully', 201);
  } catch (error) {
    return next(error);
  }
};

export const updateEmployee = async (req, res, next) => {
  try {
    return respond(req, res, await updateEmployeeUseCase({
      employeeId: req.validatedParams.employeeId,
      payload: req.validatedData,
      actorUserId: req.user.user_id
    }), 'Employee updated successfully');
  } catch (error) {
    return next(error);
  }
};
