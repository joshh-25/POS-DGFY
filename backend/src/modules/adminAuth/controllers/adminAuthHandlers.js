import { adminLoginUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

export const adminLogin = async (req, res) => {
  try {
    const result = await adminLoginUseCase({
      username: req.body?.username,
      password: req.body?.password
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        message: 'Admin login successful',
        token: result.data?.token,
        admin: result.data?.admin
      })
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export default {
  adminLogin
};
