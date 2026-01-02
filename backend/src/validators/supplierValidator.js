import Joi from 'joi';

export const createSupplierSchema = Joi.object({
  name: Joi.string().min(1).max(255).required().messages({
    'string.min': 'Name must be at least 1 character',
    'string.max': 'Name must not exceed 255 characters',
    'any.required': 'Name is required'
  }),
  contact_person: Joi.string().max(100).allow(null, '').messages({
    'string.max': 'Contact person must not exceed 100 characters'
  }),
  email: Joi.string().email().max(100).allow(null, '').messages({
    'string.email': 'Email must be a valid email address',
    'string.max': 'Email must not exceed 100 characters'
  }),
  phone: Joi.string().max(20).allow(null, '').messages({
    'string.max': 'Phone must not exceed 20 characters'
  }),
  address: Joi.string().allow(null, ''),
  quality_rating: Joi.number().min(0).max(5).allow(null).messages({
    'number.min': 'Quality rating must be 0 or greater',
    'number.max': 'Quality rating must not exceed 5'
  }),
  avg_delivery_days: Joi.number().integer().min(0).allow(null).messages({
    'number.integer': 'Average delivery days must be an integer',
    'number.min': 'Average delivery days must be 0 or greater'
  }),
  notes: Joi.string().allow(null, ''),
  status: Joi.string().valid('draft', 'active', 'inactive').default('active'),
  items_supplied: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().required(),
    item_name: Joi.string().allow('', null).optional(),  // Allow but will be ignored - fetched from DB
    moq: Joi.number().integer().min(0).required(),
    price_per_unit: Joi.number().min(0).required()
  }).unknown(true)).optional(),
  bulk_discounts: Joi.array().items(Joi.object({
    min_quantity: Joi.number().integer().min(0).required(),
    discount_percent: Joi.number().min(0).max(100).required()
  })).optional()
});

// Draft schema - only requires name
export const createSupplierDraftSchema = Joi.object({
  name: Joi.string().min(1).max(255).required().messages({
    'string.min': 'Name must be at least 1 character',
    'string.max': 'Name must not exceed 255 characters',
    'any.required': 'Name is required'
  }),
  contact_person: Joi.string().max(100).allow(null, ''),
  email: Joi.string().email().max(100).allow(null, ''),
  phone: Joi.string().max(20).allow(null, ''),
  address: Joi.string().allow(null, ''),
  quality_rating: Joi.number().min(0).max(5).allow(null),
  avg_delivery_days: Joi.number().integer().min(0).allow(null),
  notes: Joi.string().allow(null, ''),
  status: Joi.string().valid('draft').default('draft'),
  items_supplied: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().required(),
    item_name: Joi.string().allow('', null).optional(),  // Allow but will be ignored - fetched from DB
    moq: Joi.number().integer().min(0).required(),
    price_per_unit: Joi.number().min(0).required()
  }).unknown(true)).optional(),
  bulk_discounts: Joi.array().items(Joi.object({
    min_quantity: Joi.number().integer().min(0).required(),
    discount_percent: Joi.number().min(0).max(100).required()
  })).optional()
});

export const updateSupplierSchema = Joi.object({
  name: Joi.string().min(1).max(255),
  contact_person: Joi.string().max(100).allow(null, ''),
  email: Joi.string().email().max(100).allow(null, ''),
  phone: Joi.string().max(20).allow(null, ''),
  address: Joi.string().allow(null, ''),
  quality_rating: Joi.number().min(0).max(5).allow(null),
  avg_delivery_days: Joi.number().integer().min(0).allow(null),
  notes: Joi.string().allow(null, ''),
  status: Joi.string().valid('draft', 'active', 'inactive'),
  items_supplied: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().required(),
    item_name: Joi.string().allow('', null).optional(),  // Allow but will be ignored - fetched from DB
    moq: Joi.number().integer().min(0).required(),
    price_per_unit: Joi.number().min(0).required()
  }).unknown(true)).optional(),
  bulk_discounts: Joi.array().items(Joi.object({
    min_quantity: Joi.number().integer().min(0).required(),
    discount_percent: Joi.number().min(0).max(100).required()
  })).optional()
});

export const validateCreateSupplier = (req, res, next) => {
  const { error, value } = createSupplierSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path[0],
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

export const validateCreateSupplierDraft = (req, res, next) => {
  const { error, value } = createSupplierDraftSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path[0],
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

export const validateUpdateSupplier = (req, res, next) => {
  const { error, value } = updateSupplierSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path[0],
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
