/**
 * AI Routes
 *
 * API endpoints for AI assistant functionality.
 */

import express from 'express';
import * as aiController from '../controllers/aiController.js';
import { authenticate, checkPermission, requirePremium } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
  chatSchema,
  confirmActionSchema,
  cancelActionSchema,
  conversationIdSchema,
  validate
} from '../validators/aiValidator.js';

import { upload } from '../config/uploadConfig.js';

const router = express.Router();

// All AI routes require authentication AND Premium Plan
router.use(authenticate);
router.use(requirePremium);

/**
 * @route   POST /api/v1/ai/chat
 * @desc    Send a message to the AI assistant
 * @access  Private (AI_CHAT_VIEW)
 */
router.post('/chat', checkPermission(PERMISSIONS.AI.actions.AI_CHAT_VIEW), upload.array('files', 5), validate(chatSchema), aiController.chat);

/**
 * @route   POST /api/v1/ai/confirm
 * @desc    Confirm and execute a pending action
 * @access  Private (AI_CHAT_ACTION)
 */
router.post('/confirm', checkPermission(PERMISSIONS.AI.actions.AI_CHAT_ACTION), validate(confirmActionSchema), aiController.confirmAction);

/**
 * @route   POST /api/v1/ai/cancel
 * @desc    Cancel a pending action
 * @access  Private (AI_CHAT_VIEW) - Can cancel if you can chat
 */
router.post('/cancel', checkPermission(PERMISSIONS.AI.actions.AI_CHAT_VIEW), validate(cancelActionSchema), aiController.cancelAction);

/**
 * @route   GET /api/v1/ai/conversations
 * @desc    Get user's conversation history
 * @access  Private (AI_CHAT_VIEW)
 */
router.get('/conversations', checkPermission(PERMISSIONS.AI.actions.AI_CHAT_VIEW), aiController.getConversations);

/**
 * @route   GET /api/v1/ai/conversations/:id
 * @desc    Get a specific conversation
 * @access  Private (AI_CHAT_VIEW)
 */
router.get(
  '/conversations/:id',
  checkPermission(PERMISSIONS.AI.actions.AI_CHAT_VIEW),
  validate(conversationIdSchema, 'params'),
  aiController.getConversation
);

/**
 * @route   DELETE /api/v1/ai/conversations/:id
 * @desc    Delete a conversation
 * @access  Private (AI_CHAT_VIEW)
 */
router.delete(
  '/conversations/:id',
  checkPermission(PERMISSIONS.AI.actions.AI_CHAT_VIEW),
  validate(conversationIdSchema, 'params'),
  aiController.deleteConversation
);

/**
 * @route   GET /api/v1/ai/exports/:id
 * @desc    Download a temporary CSV export file
 * @access  Private (AI_CHAT_VIEW)
 */
router.get('/exports/:id', checkPermission(PERMISSIONS.AI.actions.AI_CHAT_VIEW), aiController.downloadExport);

/**
 * @route   GET /api/v1/ai/diagnostics
 * @desc    Run AI capability and knowledge gap diagnostic report
 * @access  Private (AI_CHAT_VIEW)
 */
router.get('/diagnostics', checkPermission(PERMISSIONS.AI.actions.AI_CHAT_VIEW), aiController.getDiagnostics);

export default router;
