import Joi from 'joi';

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
      unit: Joi.string()
    })
  ).allow(null),
  status: Joi.string().valid('draft', 'in_progress', 'completed', 'cancelled').default('draft')
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
      unit: Joi.string().allow(null, '')
    })
  ).allow(null),
  status: Joi.string().valid('draft').default('draft')
});

export const updateJobOrderSchema = Joi.object({
  product_id: Joi.number().integer().positive(),
  quantity_to_produce: Joi.number().positive(),
  responsible_user: Joi.number().integer().positive().allow(null),
  notes: Joi.string().allow(null, ''),
  status: Joi.string().valid('draft', 'in_progress', 'completed', 'cancelled')
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
  const { error, value } = createJobOrderDraftSchema.validate(req.body, { abortEarly: false });

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
