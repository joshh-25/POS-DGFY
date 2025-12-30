import Joi from 'joi';

// Schema for updating system settings
export const updateSettingsSchema = Joi.object({
  low_stock_threshold: Joi.number().min(0).optional(),
  critical_stock_threshold: Joi.number().min(0).optional(),
  enable_email_alerts: Joi.boolean().optional(),
  enable_low_stock_alerts: Joi.boolean().optional(),
  enable_expiry_alerts: Joi.boolean().optional(),
  alert_frequency_hours: Joi.number().min(1).max(168).optional(), // 1 hour to 1 week
  quality_check_frequency_days: Joi.number().min(1).max(365).optional(),
  supplier_rating_threshold: Joi.number().min(0).max(5).optional(),
  enable_auto_reorder: Joi.boolean().optional(),
  reorder_safety_margin: Joi.number().min(1).max(3).optional()
}).min(1).messages({
  'object.min': 'At least one setting must be provided'
});

// Schema for updating a single setting
export const updateSingleSettingSchema = Joi.object({
  value: Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.boolean(),
    Joi.object()
  ).required().messages({
    'any.required': 'Setting value is required'
  })
});

// Middleware to validate settings update
export const validateUpdateSettings = (req, res, next) => {
  const { error, value } = updateSettingsSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};

// Middleware to validate single setting update
export const validateUpdateSingleSetting = (req, res, next) => {
  const { error, value } = updateSingleSettingSchema.validate(req.body, {
    abortEarly: false
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};
