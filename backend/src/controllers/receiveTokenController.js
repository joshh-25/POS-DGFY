import * as receiveTokenService from '../services/receiveTokenService.js';

/**
 * Generate a QR token for an order
 * POST /api/v1/receive-tokens
 */
export const generateToken = async (req, res, next) => {
    try {
        const { order_type, order_id, expiry_days } = req.body;
        const userId = req.user.user_id;

        const token = await receiveTokenService.generateToken(
            order_type,
            order_id,
            userId,
            expiry_days
        );

        res.status(201).json({
            success: true,
            data: token,
            message: 'Token generated successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Validate a token and get order details
 * GET /api/v1/receive-tokens/:token
 */
export const validateToken = async (req, res, next) => {
    try {
        const { token } = req.params;

        const result = await receiveTokenService.validateToken(token);

        res.json({
            success: true,
            data: result,
            message: 'Token is valid'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Mark token as used (called after successful receive)
 * POST /api/v1/receive-tokens/:tokenId/use
 */
export const markTokenUsed = async (req, res, next) => {
    try {
        const { tokenId } = req.params;
        const userId = req.user.user_id;

        const token = await receiveTokenService.markTokenUsed(tokenId, userId);

        res.json({
            success: true,
            data: token,
            message: 'Token marked as used'
        });
    } catch (error) {
        next(error);
    }
};
