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
 * @access  Private (authenticated receive operator)
 */
router.get('/:token', authenticate, receiveTokenController.validateToken);

/**
 * @route   POST /api/v1/receive-tokens/:token/receive
 * @desc    Perform PO or JO receive using the QR token as authorization
 * @access  Private (authenticated receive operator)
 */
router.post('/:token/receive', authenticate, receiveTokenController.receiveViaToken);

/**
 * @route   POST /api/v1/receive-tokens/:tokenId/use
 * @desc    Mark a token as used after successful receive
 * @access  Private (authenticated receive operator)
 */
router.post('/:tokenId/use', authenticate, receiveTokenController.markTokenUsed);

export default router;
