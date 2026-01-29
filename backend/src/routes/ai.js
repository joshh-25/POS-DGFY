/**
 * AI Routes
 *
 * API endpoints for AI assistant functionality.
 */

import express from 'express';
import * as aiController from '../controllers/aiController.js';
import { authenticate } from '../middleware/auth.js';
import {
  chatSchema,
  confirmActionSchema,
  cancelActionSchema,
  conversationIdSchema,
  validate
} from '../validators/aiValidator.js';

const router = express.Router();

// All AI routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/ai/chat
 * @desc    Send a message to the AI assistant
 * @access  Private (all authenticated users)
 */
router.post('/chat', validate(chatSchema), aiController.chat);

/**
 * @route   POST /api/v1/ai/confirm
 * @desc    Confirm and execute a pending action
 * @access  Private (owner of the action)
 */
router.post('/confirm', validate(confirmActionSchema), aiController.confirmAction);

/**
 * @route   POST /api/v1/ai/cancel
 * @desc    Cancel a pending action
 * @access  Private (owner of the action)
 */
router.post('/cancel', validate(cancelActionSchema), aiController.cancelAction);

/**
 * @route   GET /api/v1/ai/conversations
 * @desc    Get user's conversation history
 * @access  Private (own conversations only)
 */
router.get('/conversations', aiController.getConversations);

/**
 * @route   GET /api/v1/ai/conversations/:id
 * @desc    Get a specific conversation
 * @access  Private (own conversation only)
 */
router.get(
  '/conversations/:id',
  validate(conversationIdSchema, 'params'),
  aiController.getConversation
);

/**
 * @route   DELETE /api/v1/ai/conversations/:id
 * @desc    Delete a conversation
 * @access  Private (own conversation only)
 */
router.delete(
  '/conversations/:id',
  validate(conversationIdSchema, 'params'),
  aiController.deleteConversation
);

export default router;
