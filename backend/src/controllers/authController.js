import * as authService from '../services/authService.js';

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

