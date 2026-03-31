import Joi from 'joi';

const ORDER_METHODS = ['dine_in', 'takeout', 'pickup', 'delivery', 'online'];

const posDiscountProfileSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required().messages({
    'any.required': 'Discount name is required'
  }),
  percentage: Joi.number().min(0).max(100).precision(2).required().messages({
    'any.required': 'Discount percentage is required',
    'number.min': 'Discount percentage must be 0 or greater',
    'number.max': 'Discount percentage must be 100 or less'
  }),
  active: Joi.boolean().default(true)
});

const posDiscountProfilesSchema = Joi.array()
  .items(posDiscountProfileSchema)
  .max(20)
  .custom((profiles, helpers) => {
    const seen = new Set();
    for (const profile of profiles) {
      const normalizedName = String(profile?.name || '').trim().toLowerCase();
      if (!normalizedName) continue;
      if (seen.has(normalizedName)) {
        return helpers.error('any.invalid', {
          message: `Duplicate discount profile name: ${profile.name}`
        });
      }
      seen.add(normalizedName);
    }
    return profiles;
  })
  .messages({
    'array.max': 'A maximum of 20 POS discount profiles is allowed',
    'any.invalid': '{{#message}}'
  });

const orderMethodFeeEntrySchema = Joi.object({
  enabled: Joi.boolean().required(),
  amount: Joi.number().min(0).precision(4).required().messages({
    'number.min': 'Order method fee amount must be 0 or greater'
  }),
  label: Joi.string().trim().max(80).allow('', null).optional()
});

const posOrderMethodFeesSchema = Joi.object({
  dine_in: orderMethodFeeEntrySchema.optional(),
  takeout: orderMethodFeeEntrySchema.optional(),
  pickup: orderMethodFeeEntrySchema.optional(),
  delivery: orderMethodFeeEntrySchema.optional(),
  online: orderMethodFeeEntrySchema.optional()
})
  .min(1)
  .custom((value, helpers) => {
    if (!value || typeof value !== 'object') {
      return helpers.error('any.invalid', { message: 'Order method fees must be an object' });
    }

    for (const key of Object.keys(value)) {
      if (!ORDER_METHODS.includes(key)) {
        return helpers.error('any.invalid', {
          message: `Unsupported order method fee key: ${key}`
        });
      }
    }

    for (const method of ORDER_METHODS) {
      const entry = value[method];
      if (!entry) continue;
      const enabled = Boolean(entry.enabled);
      const amount = Number(entry.amount);
      if (enabled && (!Number.isFinite(amount) || amount < 0)) {
        return helpers.error('any.invalid', {
          message: `${method} fee amount is required and must be 0 or greater when enabled`
        });
      }
    }

    return value;
  })
  .messages({
    'object.min': 'At least one order method fee entry is required',
    'any.invalid': '{{#message}}'
  });

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
  reorder_safety_margin: Joi.number().min(1).max(3).optional(),
  // Stock threshold percentage settings
  min_stock_threshold_percent: Joi.number().min(0).max(100).optional(),
  purchase_allowance_percent: Joi.number().min(0).max(100).optional(),
  // POS setup settings (tenant scoped)
  pos_business_name: Joi.string().trim().min(2).max(150).allow('').optional(),
  pos_tin_branch: Joi.string().trim().max(80).pattern(/^[A-Za-z0-9\-/\s.]*$/).allow('').optional().messages({
    'string.pattern.base': 'POS TIN/Branch contains invalid characters'
  }),
  pos_address: Joi.string().trim().max(255).allow('').optional(),
  pos_ptu_number: Joi.string().trim().max(80).pattern(/^[A-Za-z0-9\-/\s.]*$/).allow('').optional().messages({
    'string.pattern.base': 'PTU number contains invalid characters'
  }),
  pos_min_number: Joi.string().trim().max(80).pattern(/^[A-Za-z0-9\-/\s.]*$/).allow('').optional().messages({
    'string.pattern.base': 'MIN number contains invalid characters'
  }),
  pos_accreditation_number: Joi.string().trim().max(80).pattern(/^[A-Za-z0-9\-/\s.]*$/).allow('').optional().messages({
    'string.pattern.base': 'Accreditation number contains invalid characters'
  }),
  pos_strict_compliance_enabled: Joi.boolean().optional(),
  pos_receipt_footer_message: Joi.string().trim().max(300).allow('').optional(),
  pos_discount_profiles: posDiscountProfilesSchema.optional(),
  pos_order_method_fees: posOrderMethodFeesSchema.optional(),
  pos_petty_cash_symbol: Joi.string().trim().max(12).allow('').optional(),
  pos_petty_cash_amount: Joi.number().min(0).precision(4).optional(),
  store_delivery_fee: Joi.number().min(0).precision(4).optional(),
  store_tenant_slug: Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9-]*$/).allow('').optional().messages({
    'string.pattern.base': 'Store tenant slug may only contain lowercase letters, numbers, and hyphens'
  }),
  store_is_visible: Joi.boolean().optional(),
  pos_open_status: Joi.boolean().optional(),
  pos_wait_time_minutes: Joi.number().integer().min(0).max(720).optional()
}).min(1).messages({
  'object.min': 'At least one setting must be provided'
});

// Schema for updating a single setting
export const updateSingleSettingSchema = Joi.object({
  value: Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.boolean(),
    Joi.array(),
    Joi.object()
  ).required().messages({
    'any.required': 'Setting value is required'
  })
});

// Middleware to validate settings update
export const validateUpdateSettings = (req, res, next) => {
  const rawOrderMethodFees = req?.body?.pos_order_method_fees;
  if (rawOrderMethodFees && typeof rawOrderMethodFees === 'object' && !Array.isArray(rawOrderMethodFees)) {
    const unsupportedKeys = Object.keys(rawOrderMethodFees).filter((key) => !ORDER_METHODS.includes(key));
    if (unsupportedKeys.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: unsupportedKeys.map((key) => ({
          field: `pos_order_method_fees.${key}`,
          message: `Unsupported order method fee key: ${key}`
        })),
        timestamp: new Date().toISOString()
      });
    }
  }

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

  const settingKey = String(req?.params?.key || '').trim();
  const singleSettingSchemaByKey = {
    pos_business_name: Joi.string().trim().min(2).max(150).allow(''),
    pos_tin_branch: Joi.string().trim().max(80).pattern(/^[A-Za-z0-9\-/\s.]*$/).allow('').messages({
      'string.pattern.base': 'POS TIN/Branch contains invalid characters'
    }),
    pos_address: Joi.string().trim().max(255).allow(''),
    pos_ptu_number: Joi.string().trim().max(80).pattern(/^[A-Za-z0-9\-/\s.]*$/).allow('').messages({
      'string.pattern.base': 'PTU number contains invalid characters'
    }),
    pos_min_number: Joi.string().trim().max(80).pattern(/^[A-Za-z0-9\-/\s.]*$/).allow('').messages({
      'string.pattern.base': 'MIN number contains invalid characters'
    }),
    pos_accreditation_number: Joi.string().trim().max(80).pattern(/^[A-Za-z0-9\-/\s.]*$/).allow('').messages({
      'string.pattern.base': 'Accreditation number contains invalid characters'
    }),
    pos_strict_compliance_enabled: Joi.boolean(),
    pos_receipt_footer_message: Joi.string().trim().max(300).allow(''),
    pos_discount_profiles: posDiscountProfilesSchema,
    pos_order_method_fees: posOrderMethodFeesSchema,
    pos_petty_cash_symbol: Joi.string().trim().max(12).allow(''),
    pos_petty_cash_amount: Joi.number().min(0).precision(4),
    store_delivery_fee: Joi.number().min(0).precision(4),
    store_tenant_slug: Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9-]*$/).allow('').messages({
      'string.pattern.base': 'Store tenant slug may only contain lowercase letters, numbers, and hyphens'
    }),
    store_is_visible: Joi.boolean(),
    pos_open_status: Joi.boolean(),
    pos_wait_time_minutes: Joi.number().integer().min(0).max(720)
  };

  if (settingKey === 'pos_order_method_fees' && value?.value && typeof value.value === 'object' && !Array.isArray(value.value)) {
    const unsupportedKeys = Object.keys(value.value).filter((key) => !ORDER_METHODS.includes(key));
    if (unsupportedKeys.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: unsupportedKeys.map((key) => ({
          field: `value.${key}`,
          message: `Unsupported order method fee key: ${key}`
        })),
        timestamp: new Date().toISOString()
      });
    }
  }

  const settingValueSchema = singleSettingSchemaByKey[settingKey];
  if (settingValueSchema) {
    const validation = settingValueSchema.validate(value.value, { abortEarly: false });
    if (validation.error) {
      const errors = validation.error.details.map(detail => ({
        field: detail.path.length ? `value.${detail.path.join('.')}` : 'value',
        message: detail.message
      }));
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors,
        timestamp: new Date().toISOString()
      });
    }
    req.validatedData = { ...value, value: validation.value };
    return next();
  }

  req.validatedData = value;
  next();
};
