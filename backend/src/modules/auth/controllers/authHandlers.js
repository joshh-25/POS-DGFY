import {
  registerUseCase,
  loginUseCase,
  refreshTokenUseCase,
  blacklistTokenUseCase,
  lookupEmailUseCase,
  validateCompanyTokenUseCase,
  validateInviteTokenUseCase,
  acceptInvitationUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const defaultErrorPayload = (req, res, failure) => ({
  success: false,
  data: null,
  message: failure.message,
  error_code: failure.code,
  errors: failure.details,
  request_id: requestId(req, res),
  timestamp: timestamp()
});

export const register = async (req, res, next) => {
  try {
    const userData = req.validatedData;
    const result = await registerUseCase({ userData });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'User registered successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.validatedData;
    const result = await loginUseCase({ email, password });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Login successful',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.validatedData;
    const result = await refreshTokenUseCase({ refreshToken });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Token refreshed successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (token) {
      const result = await blacklistTokenUseCase({ token });
      unwrapApplicationResultOrThrow(result, 'Logout failed');
    }

    return res.status(200).json({
      success: true,
      data: null,
      message: 'Logout successful',
      timestamp: timestamp()
    });
  } catch (error) {
    next(error);
  }
};

export const lookupEmail = async (req, res, next) => {
  try {
    const { email } = req.validatedData;
    const result = await lookupEmailUseCase({ email });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => {
        const tenants = result.data || [];
        return tenants.length === 0 ? 404 : 200;
      },
      successPayloadResolver: () => {
        const tenants = result.data || [];

        if (tenants.length === 0) {
          return {
            success: false,
            data: null,
            message: 'Email not registered in any company',
            timestamp: timestamp()
          };
        }

        if (tenants.length === 1) {
          return {
            success: true,
            data: {
              company_token: tenants[0].company_token,
              company_name: tenants[0].name,
              tenant_id: tenants[0].id,
              status: tenants[0].status
            },
            message: 'Tenant found',
            timestamp: timestamp()
          };
        }

        return {
          success: true,
          data: {
            multiple: true,
            tenants: tenants.map((tenant) => ({
              id: tenant.id,
              name: tenant.name,
              company_token: tenant.company_token,
              status: tenant.status
            }))
          },
          message: 'Multiple tenants found',
          timestamp: timestamp()
        };
      },
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const validateToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Token is required',
        timestamp: timestamp()
      });
    }

    const result = await validateCompanyTokenUseCase({ token });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => (result.data ? 200 : 404),
      successPayloadResolver: () => {
        if (!result.data) {
          return {
            success: false,
            data: null,
            message: 'Invalid or expired company token',
            timestamp: timestamp()
          };
        }

        return {
          success: true,
          data: {
            company_name: result.data.name,
            tenant_id: result.data.id
          },
          message: 'Token is valid',
          timestamp: timestamp()
        };
      },
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const validateInviteToken = async (req, res, next) => {
  try {
    const { token } = req.validatedData;
    const result = await validateInviteTokenUseCase({ token });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Invitation token is valid',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        timestamp: timestamp()
      })
    });
  } catch (error) {
    next(error);
  }
};

export const acceptInvitation = async (req, res, next) => {
  try {
    const { token, username, password } = req.validatedData;
    const result = await acceptInvitationUseCase({ token, username, password });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: {
          user: {
            user_id: result.data.user_id,
            username: result.data.username,
            email: result.data.email,
            role: result.data.role
          }
        },
        message: 'Account created successfully. You are now logged in.',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        timestamp: timestamp()
      })
    });
  } catch (error) {
    next(error);
  }
};

export default {
  register,
  login,
  refreshToken,
  logout,
  lookupEmail,
  validateToken,
  validateInviteToken,
  acceptInvitation
};
