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
 * @access  Public (token is the credential)
 */
router.get('/:token', receiveTokenController.validateToken);

/**
 * @route   POST /api/v1/receive-tokens/:token/receive
 * @desc    Perform PO or JO receive using the QR token as authorization
 * @access  Public (token is the credential)
 */
router.post('/:token/receive', receiveTokenController.receiveViaToken);

/**
 * @route   POST /api/v1/receive-tokens/:tokenId/use
 * @desc    Mark a token as used after successful receive
 * @access  Public (token-based auth)
 */
router.post('/:tokenId/use', receiveTokenController.markTokenUsed);

export default router;
