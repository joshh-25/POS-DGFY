/**
 * Auth Controller (Compatibility Facade)
 */

export {
  register,
  requestAuthEmailOtp,
  login,
  refreshToken,
  logout,
  lookupEmail,
  validateToken,
  validateInviteToken,
  acceptInvitation
} from '../modules/auth/controllers/authHandlers.js';

import {
  register,
  requestAuthEmailOtp,
  login,
  refreshToken,
  logout,
  lookupEmail,
  validateToken,
  validateInviteToken,
  acceptInvitation
} from '../modules/auth/controllers/authHandlers.js';

export default {
  register,
  requestAuthEmailOtp,
  login,
  refreshToken,
  logout,
  lookupEmail,
  validateToken,
  validateInviteToken,
  acceptInvitation
};
