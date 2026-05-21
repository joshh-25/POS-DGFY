import Joi from 'joi';

const normalizeQualityCheckValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'pass') return 'passed';
  if (normalized === 'fail') return 'failed';
  return normalized;
};

export const createJobOrderSchema = Joi.object({
  product_id: Joi.number().integer().positive().required().messages({
    'number.base': 'Product ID must be a number',
    'number.positive': 'Product ID must be positive',
    'any.required': 'Product selection is required. Please select a product from the dropdown.'
  }),
  quantity_to_produce: Joi.number().positive().required().messages({
    'number.positive': 'Quantity to produce must be positive',
    'any.required': 'Quantity to produce is required'
  }),
  responsible_user: Joi.number().integer().positive().allow(null),
  notes: Joi.string().allow(null, ''),
  ingredients: Joi.array().items(
    Joi.object({
      item_id: Joi.number().integer().positive(),
      item_name: Joi.string(),
      quantity_required: Joi.number().positive(),
      stock_before: Joi.number(),
      stock_after: Joi.number(),
      isInsufficient: Joi.boolean(),
      unit: Joi.string(),
      unit_of_measure: Joi.string().allow(null, '') // Add support for standard UOM field
    })
  ).allow(null),
  status: Joi.string().valid('draft', 'in_progress', 'partial', 'completed', 'cancelled').default('draft')
});

// Draft schema - minimal requirements
export const createJobOrderDraftSchema = Joi.object({
  product_id: Joi.number().integer().positive().allow(null).messages({
    'number.base': 'Product ID must be a number',
    'number.positive': 'Product ID must be positive'
  }),
  quantity_to_produce: Joi.number().positive().allow(null).messages({
    'number.positive': 'Quantity to produce must be positive'
  }),
  responsible_user: Joi.number().integer().positive().allow(null),
  notes: Joi.string().allow(null, ''),
  ingredients: Joi.array().items(
    Joi.object({
      item_id: Joi.number().integer().positive().allow(null),
      item_name: Joi.string().allow(null, ''),
      quantity_required: Joi.number().positive().allow(null),
      stock_before: Joi.number().allow(null),
      stock_after: Joi.number().allow(null),
      isInsufficient: Joi.boolean().allow(null),
      unit: Joi.string().allow(null, ''),
      unit_of_measure: Joi.string().allow(null, '') // Add support for standard UOM field
    })
  ).allow(null),
  status: Joi.string().valid('draft').default('draft')
});

export const updateJobOrderSchema = Joi.object({
  product_id: Joi.number().integer().positive(),
  quantity_to_produce: Joi.number().positive(),
  responsible_user: Joi.number().integer().positive().allow(null),
  notes: Joi.string().allow(null, ''),
  status: Joi.string().valid('draft', 'in_progress', 'partial', 'completed', 'cancelled')
});

export const completeJobOrderSchema = Joi.object({
  quantity_produced: Joi.number().positive().allow(null),
  notes: Joi.string().allow(null, ''),
  quality_check: Joi.string()
    .allow(null, '')
    .custom((value, helpers) => {
      const normalized = normalizeQualityCheckValue(value);
      if (normalized === null || normalized === '') return normalized;
      if (!['passed', 'failed', 'pending'].includes(normalized)) {
        return helpers.error('any.only');
      }
      return normalized;
    })
    .messages({
      'any.only': 'quality_check must be one of: passed, failed, pending'
    }),
  expiry_date: Joi.date().iso().allow(null, ''),
  source_location_id: Joi.number().integer().positive().required(),
  destination_location_id: Joi.number().integer().positive().required()
}).custom((value, helpers) => {
  if (Number(value.source_location_id) === Number(value.destination_location_id)) {
    return helpers.error('any.invalid', {
      message: 'source_location_id and destination_location_id must be different'
    });
  }
  return value;
}).messages({
  'any.invalid': '{{#message}}'
});

export const validateCreateJobOrder = (req, res, next) => {
  const { error, value } = createJobOrderSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(422).json({
      success: false,
      data: null,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};

export const validateCreateJobOrderDraft = (req, res, next) => {
  const { error, value } = createJobOrderDraftSchema.validate(req.body, { abortEarly: false, allowUnknown: true });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(422).json({
      success: false,
      data: null,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};

export const validateUpdateJobOrder = (req, res, next) => {
  const { error, value } = updateJobOrderSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(422).json({
      success: false,
      data: null,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};

export const validateCompleteJobOrder = (req, res, next) => {
  const { error, value } = completeJobOrderSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(422).json({
      success: false,
      data: null,
      message: 'Validation failed',
      error_code: 'VALIDATION_FAILED',
      errors,
      request_id: req.requestId || res.locals?.requestId || null,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};

