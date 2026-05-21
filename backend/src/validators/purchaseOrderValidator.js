import Joi from 'joi';

export const createPurchaseOrderSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required().messages({
    'number.base': 'Supplier ID must be a number',
    'number.positive': 'Supplier ID must be positive',
    'any.required': 'Supplier ID is required'
  }),
  order_date: Joi.date().optional().messages({
    'date.base': 'Order date must be a valid date'
  }),
  expected_delivery_date: Joi.date().allow(null).messages({
    'date.base': 'Expected delivery date must be a valid date'
  }),
  discount: Joi.number().min(0).allow(null),
  notes: Joi.string().allow(null, ''),
  line_items: Joi.array().items(
    Joi.object({
      item_id: Joi.number().integer().positive().required(),
      quantity_ordered: Joi.number().positive().required(),
      unit_price: Joi.number().min(0).required(),
      total_price: Joi.number().min(0).required()
    }).unknown(true)
  ).min(1).required().messages({
    'array.min': 'At least one line item is required'
  }),
  status: Joi.string().valid('draft', 'pending', 'partial', 'received', 'cancelled').default('draft')
});

// Draft schema - minimal requirements
export const createPurchaseOrderDraftSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().allow(null).messages({
    'number.base': 'Supplier ID must be a number',
    'number.positive': 'Supplier ID must be positive'
  }),
  order_date: Joi.date().allow(null),
  expected_delivery_date: Joi.date().allow(null),
  notes: Joi.string().allow(null, ''),
  line_items: Joi.array().items(
    Joi.object({
      item_id: Joi.number().integer().positive().allow(null),
      quantity_ordered: Joi.number().positive().allow(null),
      unit_price: Joi.number().min(0).allow(null),
      total_price: Joi.number().min(0).allow(null)
    }).unknown(true)
  ).allow(null),
  status: Joi.string().valid('draft').default('draft')
});

export const updatePurchaseOrderSchema = Joi.object({
  supplier_id: Joi.number().integer().positive(),
  order_date: Joi.date(),
  expected_delivery_date: Joi.date().allow(null),
  notes: Joi.string().allow(null, ''),
  line_items: Joi.array().items(
    Joi.object({
      item_id: Joi.number().integer().positive(),
      quantity_ordered: Joi.number().positive(),
      unit_price: Joi.number().min(0),
      total_price: Joi.number().min(0)
    }).unknown(true)
  ),
  status: Joi.string().valid('draft', 'pending', 'partial', 'received', 'cancelled')
});

export const receivePurchaseOrderSchema = Joi.object({
  location_id: Joi.number().integer().positive().required().messages({
    'number.base': 'location_id must be a number',
    'number.integer': 'location_id must be an integer',
    'number.positive': 'location_id must be positive',
    'any.required': 'location_id is required'
  }),
  notes: Joi.string().allow(null, ''),
  delivery_rating: Joi.number().integer().min(1).max(5).allow(null),
  line_items: Joi.array().items(
    Joi.object({
      line_item_id: Joi.number().integer().positive().required(),
      quantity_received: Joi.number().positive().required(),
      quality_check_status: Joi.string().valid('pending', 'passed', 'failed').allow(null),
      expiry_date: Joi.date().iso().allow(null, '')
    })
  ).min(1).required()
});

export const validateCreatePurchaseOrder = (req, res, next) => {
  const { error, value } = createPurchaseOrderSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

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

export const validateCreatePurchaseOrderDraft = (req, res, next) => {
  const { error, value } = createPurchaseOrderDraftSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

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

export const validateUpdatePurchaseOrder = (req, res, next) => {
  const { error, value } = updatePurchaseOrderSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

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

export const validateReceivePurchaseOrder = (req, res, next) => {
  const { error, value } = receivePurchaseOrderSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

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
