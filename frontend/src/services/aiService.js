/**
 * AI Service
 *
 * Frontend service for communicating with the AI assistant backend.
 */

import api from './api';

/**
 * Send a chat message to the AI assistant
 * @param {string} message - The user's message
 * @param {string|null} conversationId - Optional conversation ID for context
 * @returns {Promise<Object>} AI response
 */
export const sendMessage = async (message, conversationId = null) => {
  const response = await api.post('/ai/chat', {
    message,
    conversationId
  });
  return response.data;
};

/**
 * Confirm a pending AI action
 * @param {string} actionId - The action ID to confirm
 * @returns {Promise<Object>} Execution result
 */
export const confirmAction = async (actionId) => {
  const response = await api.post('/ai/confirm', { actionId });
  return response.data;
};

/**
 * Cancel a pending AI action
 * @param {string} actionId - The action ID to cancel
 * @returns {Promise<Object>} Cancellation result
 */
export const cancelAction = async (actionId) => {
  const response = await api.post('/ai/cancel', { actionId });
  return response.data;
};

/**
 * Get all conversations for the current user
 * @returns {Promise<Object>} List of conversations
 */
export const getConversations = async () => {
  const response = await api.get('/ai/conversations');
  return response.data;
};

/**
 * Get a specific conversation by ID
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object>} Conversation details with messages
 */
export const getConversation = async (conversationId) => {
  const response = await api.get(`/ai/conversations/${conversationId}`);
  return response.data;
};

/**
 * Delete a conversation
 * @param {string} conversationId - The conversation ID to delete
 * @returns {Promise<Object>} Deletion result
 */
export const deleteConversation = async (conversationId) => {
  const response = await api.delete(`/ai/conversations/${conversationId}`);
  return response.data;
};

export default {
  sendMessage,
  confirmAction,
  cancelAction,
  getConversations,
  getConversation,
  deleteConversation
};
