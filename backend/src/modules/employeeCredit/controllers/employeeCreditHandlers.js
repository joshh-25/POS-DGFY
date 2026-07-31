import {
  adjustEmployeeCreditOutstandingUseCase,
  getEmployeeCreditReportUseCase,
  listEmployeeCreditAccountsUseCase,
  listEmployeeCreditCheckoutOptionsUseCase,
  lookupEmployeeCreditAccountUseCase,
  recordEmployeeCreditRepaymentUseCase,
  updateEmployeeCreditAccountUseCase,
  updateEmployeeCreditEmployeeAccountUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const respond = (req, res, result, message) => sendUseCaseResult(res, result, {
  successStatusCodeResolver: () => 200,
  successPayloadResolver: () => ({ success: true, data: result.data, message, timestamp: timestamp() }),
  errorPayloadResolver: (failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: req.requestId || res.locals?.requestId || null,
    timestamp: timestamp()
  })
});

export const listEmployeeCreditAccounts = async (req, res, next) => {
  try {
    const result = await listEmployeeCreditAccountsUseCase();
    return respond(req, res, result, 'Employee Credit accounts retrieved successfully');
  } catch (error) {
    return next(error);
  }
};

export const listEmployeeCreditCheckoutOptions = async (req, res, next) => {
  try {
    const result = await listEmployeeCreditCheckoutOptionsUseCase({
      query: req.validatedQuery
    });
    return respond(req, res, result, 'Employee Credit checkout options retrieved successfully');
  } catch (error) {
    return next(error);
  }
};

export const updateEmployeeCreditAccount = async (req, res, next) => {
  try {
    const result = await updateEmployeeCreditAccountUseCase({
      userId: req.validatedParams.userId,
      payload: req.validatedData,
      actorUserId: req.user.user_id
    });
    return respond(req, res, result, 'Employee Credit account updated successfully');
  } catch (error) {
    return next(error);
  }
};

export const updateEmployeeCreditEmployeeAccount = async (req, res, next) => {
  try {
    const result = await updateEmployeeCreditEmployeeAccountUseCase({
      employeeId: req.validatedParams.employeeId,
      payload: req.validatedData,
      actorUserId: req.user.user_id
    });
    return respond(req, res, result, 'Employee Credit account updated successfully');
  } catch (error) {
    return next(error);
  }
};

export const recordEmployeeCreditRepayment = async (req, res, next) => {
  try {
    const result = await recordEmployeeCreditRepaymentUseCase({
      accountId: req.validatedParams.accountId,
      payload: req.validatedData,
      actorUserId: req.user.user_id
    });
    return respond(req, res, result, 'Employee Credit repayment recorded successfully');
  } catch (error) {
    return next(error);
  }
};

export const adjustEmployeeCreditOutstanding = async (req, res, next) => {
  try {
    const result = await adjustEmployeeCreditOutstandingUseCase({
      accountId: req.validatedParams.accountId,
      payload: req.validatedData,
      actorUserId: req.user.user_id
    });
    return respond(req, res, result, 'Employee Credit outstanding balance adjusted successfully');
  } catch (error) {
    return next(error);
  }
};

export const lookupEmployeeCreditAccount = async (req, res, next) => {
  try {
    const result = await lookupEmployeeCreditAccountUseCase({
      accountCode: req.validatedQuery.account_code
    });
    return respond(req, res, result, 'Employee Credit account verified successfully');
  } catch (error) {
    return next(error);
  }
};

export const getEmployeeCreditReport = async (req, res, next) => {
  try {
    const result = await getEmployeeCreditReportUseCase({ query: req.validatedQuery });
    return respond(req, res, result, 'Employee Credit report retrieved successfully');
  } catch (error) {
    return next(error);
  }
};
