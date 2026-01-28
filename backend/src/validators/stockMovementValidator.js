import Joi from 'joi';

// Valid enum values (must match StockMovement model)
const MOVEMENT_TYPES = ['production_consumption', 'purchase_receipt', 'return', 'transfer', 'calculated_loss', 'adjustment', 'production_output'];
const REFERENCE_TYPES = ['PO', 'JO', 'MANUAL', 'RETURN'];
const LOSS_REASONS = ['waste', 'spoilage', 'damage', 'pilferage'];

export const createStockMovementSchema = Joi.object({
  item_id: Joi.number().integer().positive().required().messages({
    'number.base': 'Item ID must be a number',
    'number.integer': 'Item ID must be an integer',
    'number.positive': 'Item ID must be positive',
    'any.required': 'Item ID is required'
  }),
  quantity: Joi.number().positive().required().messages({
    'number.base': 'Quantity must be a number',
    'number.positive': 'Quantity must be a positive number',
    'any.required': 'Quantity is required'
  }),
  movement_type: Joi.string().valid(...MOVEMENT_TYPES).required().messages({
    'any.only': `Movement type must be one of: ${MOVEMENT_TYPES.join(', ')}`,
    'any.required': 'Movement type is required'
  }),
  batch_id: Joi.number().integer().positive().allow(null).messages({
    'number.base': 'Batch ID must be a number',
    'number.integer': 'Batch ID must be an integer',
    'number.positive': 'Batch ID must be positive'
  }),
  expiry_date: Joi.date().iso().allow(null, '').messages({
    'date.format': 'Expiry date must be a valid ISO date'
  }),
  cost_per_unit: Joi.number().min(0).allow(null).messages({
    'number.base': 'Cost per unit must be a number',
    'number.min': 'Cost per unit must be 0 or greater'
  }),
  po_number: Joi.string().max(50).allow(null, '').messages({
    'string.max': 'PO number must not exceed 50 characters'
  }),
  reference_id: Joi.string().max(50).allow(null, '').messages({
    'string.max': 'Reference ID must not exceed 50 characters'
  }),
  reference_type: Joi.string().valid(...REFERENCE_TYPES).allow(null).messages({
    'any.only': `Reference type must be one of: ${REFERENCE_TYPES.join(', ')}`
  }),
  from_location: Joi.string().max(100).allow(null, '').messages({
    'string.max': 'From location must not exceed 100 characters'
  }),
  to_location: Joi.string().max(100).allow(null, '').messages({
    'string.max': 'To location must not exceed 100 characters'
  }),
  notes: Joi.string().max(1000).allow(null, '').messages({
    'string.max': 'Notes must not exceed 1000 characters'
  }),
  loss_reason: Joi.string().valid(...LOSS_REASONS).allow(null).when('movement_type', {
    is: 'calculated_loss',
    then: Joi.required().messages({
      'any.required': 'Loss reason is required for calculated_loss movements'
    }),
    otherwise: Joi.allow(null, '')
  }).messages({
    'any.only': `Loss reason must be one of: ${LOSS_REASONS.join(', ')}`
  })
});

export const voidMovementSchema = Joi.object({
  reason: Joi.string().min(1).max(500).required().messages({
    'string.min': 'Void reason must be at least 1 character',
    'string.max': 'Void reason must not exceed 500 characters',
    'any.required': 'Void reason is required'
  })
});

export const bulkCreateSchema = Joi.object({
  movements: Joi.array().items(createStockMovementSchema).min(1).max(100).required().messages({
    'array.min': 'At least one movement is required',
    'array.max': 'Cannot create more than 100 movements at once',
    'any.required': 'Movements array is required'
  })
});

export const validateCreateStockMovement = (req, res, next) => {
  const { error, value } = createStockMovementSchema.validate(req.body, {
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
      data: null,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};

export const validateVoidMovement = (req, res, next) => {
  const { error, value } = voidMovementSchema.validate(req.body, {
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
      data: null,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};

export const validateBulkCreate = (req, res, next) => {
  const { error, value } = bulkCreateSchema.validate(req.body, {
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
      data: null,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};
