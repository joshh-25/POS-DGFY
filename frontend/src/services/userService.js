import api from './api.js';

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
    localStorage.setItem('authToken', result.token);
  }

  return result;
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

/**
 * Get all users (admin only)
 * @returns {Promise<Array>} List of all users
 */
export const getAllUsers = async () => {
  const response = await api.get('/users');
  return response.data.data;
};

/**
 * Update user role (admin only)
 * @param {number} userId - Target user ID
 * @param {string} role - New role ('admin', 'manager', 'staff')
 * @returns {Promise<Object>} Updated user data
 */
export const updateUserRole = async (userId, role) => {
  const response = await api.put(`/users/${userId}/role`, { role });
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
