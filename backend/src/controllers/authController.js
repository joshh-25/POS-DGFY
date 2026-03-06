/**
 * Auth Controller (Compatibility Facade)
 */

export {
  register,
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
  login,
  refreshToken,
  logout,
  lookupEmail,
  validateToken,
  validateInviteToken,
  acceptInvitation
};
