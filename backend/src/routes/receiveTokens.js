import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as receiveTokenController from '../controllers/receiveTokenController.js';

const router = express.Router();

/**
 * @route   POST /api/v1/receive-tokens
 * @desc    Generate a QR token for PO/JO receiving
 * @access  Private (any authenticated user)
 */
router.post('/', authenticate, receiveTokenController.generateToken);

/**
 * @route   GET /api/v1/receive-tokens/:token
 * @desc    Validate token and get order details for mobile receive page
 * @access  Private (any authenticated user)
 */
router.get('/:token', authenticate, receiveTokenController.validateToken);

/**
 * @route   POST /api/v1/receive-tokens/:tokenId/use
 * @desc    Mark a token as used after successful receive
 * @access  Private (any authenticated user)
 */
router.post('/:tokenId/use', authenticate, receiveTokenController.markTokenUsed);

export default router;
