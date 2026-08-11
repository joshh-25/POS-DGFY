import api from './api.js';
import { setBrowserSession } from './browserSession.js';

/**
 * Get current authenticated user's profile
 * @returns {Promise<Object>} Current user data
 */
export const getCurrentUser = async () => {
  const response = await api.get('/users/me');
  return response.data.data;
};

/**
 * Update current user's profile (username, email)
 * @param {Object} profileData - { username?, email? }
 * @returns {Promise<Object>} Updated user data with new token if username/email changed
 */
export const updateProfile = async (profileData) => {
  const response = await api.put('/users/me', profileData);

  // If username or email changed, backend returns new token
  const result = response.data.data;
  if (result.token) {
    setBrowserSession({ token: result.token });
  }

  return result;
};

export const requestEmailChangeOtp = async ({ email }) => {
  const response = await api.post('/users/me/email-otp/request', { email });
  return response.data.data;
};

/**
 * Change current user's password
 * @param {Object} passwordData - { currentPassword, newPassword }
 * @returns {Promise<void>}
 */
export const changePassword = async (passwordData) => {
  const response = await api.put('/users/me/password', passwordData);
  return response.data.data;
};

export const resetLocalCashierPassword = async (userId, newPassword, options = {}) => {
  const response = await api.put(`/users/${userId}/password`, {
    newPassword,
    notifyUser: options.notifyUser === true,
    terminalLabel: options.terminalLabel || '',
    storeName: options.storeName || ''
  });
  return response.data.data;
};

export const provisionCashierFromGmail = async ({
  email,
  password,
  locationIds = [],
  terminalLabel = '',
  storeName = ''
} = {}) => {
  const response = await api.post('/users/cashier-provision', {
    email,
    password,
    location_ids: Array.isArray(locationIds) ? locationIds : [],
    terminal_label: terminalLabel,
    store_name: storeName
  });
  return response.data.data;
};

/**
 * Get all users (admin only)
 * @returns {Promise<Array>} List of all users
 */
export const getAllUsers = async (params = {}) => {
  const response = await api.get('/users', { params });
  return response.data.data;
};

/**
 * Get the active tenant role catalog for the current workflow mode.
 * @returns {Promise<Object>} Role presets and visible permission groups
 */
export const getRoleCatalog = async () => {
  const response = await api.get('/users/role-catalog');
  return response.data.data;
};

/**
 * Update user role (admin only)
 * @param {number} userId - Target user ID
 * @param {string|Object} role - Legacy role string or role assignment payload
 * @returns {Promise<Object>} Updated user data
 */
export const updateUserRole = async (userId, role) => {
  const payload = role && typeof role === 'object' ? role : { role };
  const response = await api.put(`/users/${userId}/role`, payload);
  return response.data.data;
};

/**
 * Update user active status (admin only)
 * @param {number} userId - Target user ID
 * @param {boolean} isActive - Active status
 * @returns {Promise<Object>} Updated user data
 */
export const updateUserStatus = async (userId, isActive) => {
  const response = await api.put(`/users/${userId}/status`, { is_active: isActive });
  return response.data.data;
};

export const updateUserPermissions = async (userId, permissions = []) => {
  const response = await api.put(`/users/${userId}/permissions`, { permissions });
  return response.data.data;
};

export const updatePosApprovalPin = async (userId, { pin, clear = false } = {}) => {
  const response = await api.put(`/users/${userId}/pos-approval-pin`, clear ? { clear: true } : { pin });
  return response.data.data;
};

export const updatePosDayClosePin = async (userId) => {
  const response = await api.put(`/users/${userId}/pos-day-close-pin`, { clear: true });
  return response.data.data;
};

export const updateOwnPosDayClosePin = async ({ currentPassword, pin } = {}) => {
  const response = await api.put('/users/me/pos-day-close-pin', { currentPassword, pin });
  return response.data.data;
};

/**
 * Remove user from company (soft delete)
 * @param {number} userId - Target user ID
 * @returns {Promise<Object>} Removed user data
 */
export const removeUserFromCompany = async (userId) => {
  const response = await api.delete(`/users/${userId}`);
  return response.data.data;
};

/**
 * Invite a new user
 * @param {string} email - User email
 * @param {string} role - User role
 * @returns {Promise<Object>} Invitation result
 */
export const inviteUser = async (email, role, options = {}) => {
  const payload = {
    email,
    role: role || undefined,
    role_preset_key: options.rolePresetKey || undefined,
    location_ids: options.locationIds || [],
    delivery_mode: options.deliveryMode || 'email'
  };
  const response = await api.post('/users/invite', payload);
  return response.data.data;
};

export const searchDgfyBusinessAccounts = async (query) => {
  const response = await api.get('/dgfy/accounts/search', {
    params: { query }
  });
  return response.data.data;
};

export const inviteDgfyAccountToCompany = async ({
  dgfyAccountId,
  role,
  rolePresetKey = null,
  locationIds = []
} = {}) => {
  const response = await api.post('/dgfy/invitations', {
    dgfy_account_id: dgfyAccountId,
    role: role || undefined,
    role_preset_key: rolePresetKey || undefined,
    location_ids: Array.isArray(locationIds) ? locationIds : []
  });
  return response.data.data;
};

export const resendUserInvitation = async (userId) => {
  const response = await api.post(`/users/${userId}/invitation/resend`);
  return response.data.data;
};

export const createInvitationLink = async (userId) => {
  const response = await api.post(`/users/${userId}/invitation/link`);
  return response.data.data;
};

export const cancelUserInvitation = async (userId) => {
  const response = await api.delete(`/users/${userId}/invitation`);
  return response.data.data;
};

/**
 * Get location grants for a specific user (admin only)
 * @param {number} userId - Target user ID
 * @param {Object} params - Optional query params
 * @returns {Promise<Object>} Location grant payload
 */
export const getUserLocationGrants = async (userId, params = {}) => {
  const response = await api.get(`/users/${userId}/location-grants`, { params });
  return response.data.data;
};

/**
 * Replace location grants for a specific user (admin only)
 * @param {number} userId - Target user ID
 * @param {number[]} locationIds - Location IDs to grant
 * @returns {Promise<Object>} Updated location grant payload
 */
export const updateUserLocationGrants = async (userId, locationIds = []) => {
  const response = await api.put(`/users/${userId}/location-grants`, {
    location_ids: locationIds
  });
  return response.data.data;
};
