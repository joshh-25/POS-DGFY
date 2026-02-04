import * as authService from '../services/authService.js';
import * as landlordService from '../services/landlordService.js';

export const register = async (req, res, next) => {
  try {
    const userData = req.validatedData;
    const result = await authService.registerUser(userData);

    res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.validatedData;
    const result = await authService.loginUser(email, password);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Login successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.validatedData;
    const result = await authService.refreshUserToken(refreshToken);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Token refreshed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    // Get token from authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (token) {
      // Blacklist the token
      await authService.blacklistToken(token);
    }

    res.status(200).json({
      success: true,
      data: null,
      message: 'Logout successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Look up which tenant(s) an email belongs to
 * Used by frontend to determine if token is needed for login
 */
export const lookupEmail = async (req, res, next) => {
  try {
    const { email } = req.validatedData;
    const tenants = await landlordService.findTenantsByEmail(email);

    if (tenants.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Email not registered in any company',
        timestamp: new Date().toISOString()
      });
    }

    if (tenants.length === 1) {
      // Single tenant - return token for auto-fill
      return res.status(200).json({
        success: true,
        data: {
          company_token: tenants[0].company_token,
          company_name: tenants[0].name,
          tenant_id: tenants[0].id
        },
        message: 'Tenant found',
        timestamp: new Date().toISOString()
      });
    }

    // Multiple tenants - return list for user selection
    return res.status(200).json({
      success: true,
      data: {
        multiple: true,
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          company_token: t.company_token
        }))
      },
      message: 'Multiple tenants found',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate a company token and return company info
 * Used by frontend during registration to show company name
 */
export const validateToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Token is required',
        timestamp: new Date().toISOString()
      });
    }

    const tenant = await landlordService.findTenantByToken(token);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Invalid or expired company token',
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      data: {
        company_name: tenant.name,
        tenant_id: tenant.id
      },
      message: 'Token is valid',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

