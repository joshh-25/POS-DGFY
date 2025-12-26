import Joi from 'joi';

export const createItemSchema = Joi.object({
  sku_code: Joi.string().min(1).max(50).required().messages({
    'string.min': 'SKU code must be at least 1 character',
    'string.max': 'SKU code must not exceed 50 characters',
    'any.required': 'SKU code is required'
  }),
  name: Joi.string().min(1).max(255).required().messages({
    'string.min': 'Name must be at least 1 character',
    'string.max': 'Name must not exceed 255 characters',
    'any.required': 'Name is required'
  }),
  category: Joi.string().valid('ingredient', 'product', 'packaging').required().messages({
    'any.only': 'Category must be one of: ingredient, product, packaging',
    'any.required': 'Category is required'
  }),
  product_folder: Joi.string().max(100).allow(null, '').messages({
    'string.max': 'Product folder must not exceed 100 characters'
  }),
  description: Joi.string().allow(null, '').messages({
    'string.base': 'Description must be a string'
  }),
  max_capacity: Joi.number().positive().required().messages({
    'number.positive': 'Max capacity must be a positive number',
    'any.required': 'Max capacity is required'
  }),
  min_threshold: Joi.number().min(0).allow(null).messages({
    'number.min': 'Min threshold must be 0 or greater'
  }),
  purchase_allowance: Joi.number().min(0).allow(null).messages({
    'number.min': 'Purchase allowance must be 0 or greater'
  }),
  unit_of_measure: Joi.string().min(1).max(50).required().messages({
    'string.min': 'Unit of measure must be at least 1 character',
    'string.max': 'Unit of measure must not exceed 50 characters',
    'any.required': 'Unit of measure is required'
  }),
  cost_per_unit: Joi.number().min(0).allow(null).messages({
    'number.min': 'Cost per unit must be 0 or greater'
  }),
  fifo_enabled: Joi.boolean().default(false),
  batch_size: Joi.number().positive().allow(null).messages({
    'number.positive': 'Batch size must be a positive number'
  }),
  yield_percentage: Joi.number().min(0).max(100).allow(null).messages({
    'number.min': 'Yield percentage must be 0 or greater',
    'number.max': 'Yield percentage must not exceed 100'
  }),
  processing_loss: Joi.number().min(0).max(100).allow(null).messages({
    'number.min': 'Processing loss must be 0 or greater',
    'number.max': 'Processing loss must not exceed 100'
  }),
  production_notes: Joi.string().allow(null, '')
});

export const updateItemSchema = Joi.object({
  sku_code: Joi.string().min(1).max(50).messages({
    'string.min': 'SKU code must be at least 1 character',
    'string.max': 'SKU code must not exceed 50 characters'
  }),
  name: Joi.string().min(1).max(255).messages({
    'string.min': 'Name must be at least 1 character',
    'string.max': 'Name must not exceed 255 characters'
  }),
  category: Joi.string().valid('ingredient', 'product', 'packaging').messages({
    'any.only': 'Category must be one of: ingredient, product, packaging'
  }),
  product_folder: Joi.string().max(100).allow(null, ''),
  description: Joi.string().allow(null, ''),
  max_capacity: Joi.number().positive().messages({
    'number.positive': 'Max capacity must be a positive number'
  }),
  min_threshold: Joi.number().min(0).allow(null),
  purchase_allowance: Joi.number().min(0).allow(null),
  unit_of_measure: Joi.string().min(1).max(50),
  cost_per_unit: Joi.number().min(0).allow(null),
  fifo_enabled: Joi.boolean(),
  batch_size: Joi.number().positive().allow(null),
  yield_percentage: Joi.number().min(0).max(100).allow(null),
  processing_loss: Joi.number().min(0).max(100).allow(null),
  production_notes: Joi.string().allow(null, ''),
  is_active: Joi.boolean()
});

export const validateCreateItem = (req, res, next) => {
  const { error, value } = createItemSchema.validate(req.body, { abortEarly: false });
  
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

export const validateUpdateItem = (req, res, next) => {
  const { error, value } = updateItemSchema.validate(req.body, { abortEarly: false });
  
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

