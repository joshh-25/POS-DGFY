/**
 * AI Validator
 *
 * Joi validation schemas for AI-related endpoints.
 */

import Joi from 'joi';

/**
 * Validate chat message request
 */
export const chatSchema = Joi.object({
  message: Joi.string()
    .min(1)
    .max(10000)
    .required()
    .messages({
      'string.empty': 'Message cannot be empty',
      'string.max': 'Message is too long (max 10000 characters)',
      'any.required': 'Message is required'
    }),

  conversationId: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.guid': 'Invalid conversation ID format'
    }),

  // Optional file attachment (for CSV import)
  file: Joi.object({
    content: Joi.string().max(5 * 1024 * 1024), // 5MB max
    filename: Joi.string().max(255),
    mimetype: Joi.string().valid('text/csv', 'application/csv')
  }).optional()
});

/**
 * Validate action confirmation request
 */
export const confirmActionSchema = Joi.object({
  actionId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid action ID format',
      'any.required': 'Action ID is required'
    })
});

/**
 * Validate action cancellation request
 */
export const cancelActionSchema = Joi.object({
  actionId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid action ID format',
      'any.required': 'Action ID is required'
    })
});

/**
 * Validate conversation ID parameter
 */
export const conversationIdSchema = Joi.object({
  id: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid conversation ID format',
      'any.required': 'Conversation ID is required'
    })
});

/**
 * Validate export download request
 */
export const exportDownloadSchema = Joi.object({
  id: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid export ID format',
      'any.required': 'Export ID is required'
    })
});

/**
 * Middleware factory for validation
 */
export const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const dataToValidate = property === 'params' ? req.params : req.body;

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
        timestamp: new Date().toISOString()
      });
    }

    // Replace with validated and sanitized values
    if (property === 'params') {
      req.params = value;
    } else {
      req.body = value;
    }

    next();
  };
};

export default {
  chatSchema,
  confirmActionSchema,
  cancelActionSchema,
  conversationIdSchema,
  exportDownloadSchema,
  validate
};
