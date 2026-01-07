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
  category: Joi.string().valid('raw_material', 'packaging', 'product', 'supplies').required().messages({
    'any.only': 'Category must be one of: raw_material, packaging, product, supplies',
    'any.required': 'Category is required'
  }),
  product_type: Joi.string().valid('work_in_progress', 'finished_goods').allow(null, '').when('category', {
    is: 'product',
    then: Joi.required().messages({
      'any.required': 'product_type is required when category is "product"'
    }),
    otherwise: Joi.valid(null, '').messages({
      'any.only': 'product_type must be null for non-product categories'
    })
  }).messages({
    'any.only': 'product_type must be one of: work_in_progress, finished_goods'
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
  labor_cost: Joi.number().min(0).allow(null, ''),
  overhead_cost: Joi.number().min(0).allow(null, ''),
  additional_packaging_cost: Joi.number().min(0).allow(null, ''),
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
  production_notes: Joi.string().allow(null, ''),
  packaging_specs: Joi.object({
    height: Joi.string().allow(null, ''),
    width: Joi.string().allow(null, ''),
    thickness: Joi.string().allow(null, ''),
    material: Joi.string().allow(null, ''),
    design: Joi.string().allow(null, ''),
    contents: Joi.string().allow(null, '')
  }).allow(null),
  ingredients: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().positive().allow(null, ''),
    item_name: Joi.string().allow(null, ''),
    quantity: Joi.number().min(0).allow(null, '')
  })).allow(null),
  packaging_items: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().positive().allow(null, ''),
    item_name: Joi.string().allow(null, ''),
    quantity: Joi.number().min(0).allow(null, '')
  })).allow(null),
  nutritional_info: Joi.object({
    serving_size: Joi.string().allow(null, ''),
    calories: Joi.number().min(0).allow(null, ''),
    total_fat: Joi.number().min(0).allow(null, ''),
    saturated_fat: Joi.number().min(0).allow(null, ''),
    cholesterol: Joi.number().min(0).allow(null, ''),
    sodium: Joi.number().min(0).allow(null, ''),
    total_carbohydrates: Joi.number().min(0).allow(null, ''),
    dietary_fiber: Joi.number().min(0).allow(null, ''),
    sugars: Joi.number().min(0).allow(null, ''),
    protein: Joi.number().min(0).allow(null, '')
  }).allow(null),
  allergens: Joi.array().items(Joi.string().valid('milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame')).allow(null),
  may_contain_allergens: Joi.array().items(Joi.string()).allow(null),
  physical_properties: Joi.object({
    texture: Joi.string().allow(null, ''),
    color: Joi.string().allow(null, ''),
    ph_level: Joi.number().min(0).max(14).allow(null, ''),
    water_activity: Joi.number().min(0).max(1).allow(null, ''),
    viscosity: Joi.string().allow(null, '')
  }).allow(null),
  shelf_life: Joi.object({
    duration_days: Joi.number().min(0).allow(null, ''),
    storage_temperature: Joi.string().allow(null, ''),
    storage_conditions: Joi.string().allow(null, ''),
    opened_shelf_life_days: Joi.number().min(0).allow(null, '')
  }).allow(null),
  packaging_info: Joi.object({
    primary_packaging: Joi.string().allow(null, ''),
    secondary_packaging: Joi.string().allow(null, ''),
    packaging_material: Joi.string().allow(null, ''),
    label_compliance: Joi.boolean().allow(null),
    net_weight: Joi.string().allow(null, '')
  }).allow(null),
  quality_control: Joi.object({
    test_frequency: Joi.string().allow(null, ''),
    acceptance_criteria: Joi.string().allow(null, ''),
    sampling_plan: Joi.string().allow(null, ''),
    corrective_actions: Joi.string().allow(null, '')
  }).allow(null),
  regulatory_compliance: Joi.object({
    fda_approved: Joi.boolean().allow(null),
    organic_certified: Joi.boolean().allow(null),
    kosher_certified: Joi.boolean().allow(null),
    halal_certified: Joi.boolean().allow(null),
    gmp_compliant: Joi.boolean().allow(null),
    haccp_plan: Joi.boolean().allow(null)
  }).allow(null),
  current_stock: Joi.number().min(0).allow(null, ''),
  wizard_metadata: Joi.object().allow(null),
  status: Joi.string().valid('draft', 'active', 'inactive').default('active')
});

// Draft schema - only requires name, everything else optional
export const createItemDraftSchema = Joi.object({
  name: Joi.string().min(1).max(255).required().messages({
    'string.min': 'Name must be at least 1 character',
    'string.max': 'Name must not exceed 255 characters',
    'any.required': 'Name is required'
  }),
  sku_code: Joi.string().min(1).max(50).allow(null, '').messages({
    'string.min': 'SKU code must be at least 1 character',
    'string.max': 'SKU code must not exceed 50 characters'
  }),
  category: Joi.string().valid('raw_material', 'packaging', 'product', 'supplies').allow(null, '').messages({
    'any.only': 'Category must be one of: raw_material, packaging, product, supplies'
  }),
  product_type: Joi.string().valid('work_in_progress', 'finished_goods').allow(null, '').when('category', {
    is: 'product',
    then: Joi.string().valid('work_in_progress', 'finished_goods'),
    otherwise: Joi.valid(null, '')
  }),
  product_folder: Joi.string().max(100).allow(null, ''),
  description: Joi.string().allow(null, ''),
  max_capacity: Joi.number().positive().allow(null, '').messages({
    'number.positive': 'Max capacity must be a positive number'
  }),
  min_threshold: Joi.number().min(0).allow(null, ''),
  purchase_allowance: Joi.number().min(0).allow(null, ''),
  unit_of_measure: Joi.string().min(1).max(50).allow(null, ''),
  cost_per_unit: Joi.number().min(0).allow(null, ''),
  labor_cost: Joi.number().min(0).allow(null, ''),
  overhead_cost: Joi.number().min(0).allow(null, ''),
  additional_packaging_cost: Joi.number().min(0).allow(null, ''),
  fifo_enabled: Joi.boolean().default(false),
  batch_size: Joi.number().positive().allow(null, ''),
  yield_percentage: Joi.number().min(0).max(100).allow(null, ''),
  processing_loss: Joi.number().min(0).max(100).allow(null, ''),
  production_notes: Joi.string().allow(null, ''),
  packaging_specs: Joi.object({
    height: Joi.string().allow(null, ''),
    width: Joi.string().allow(null, ''),
    thickness: Joi.string().allow(null, ''),
    material: Joi.string().allow(null, ''),
    design: Joi.string().allow(null, ''),
    contents: Joi.string().allow(null, '')
  }).allow(null),
  ingredients: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().positive().allow(null, ''),
    item_name: Joi.string().allow(null, ''),
    quantity: Joi.number().min(0).allow(null, '')
  })).allow(null),
  packaging_items: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().positive().allow(null, ''),
    item_name: Joi.string().allow(null, ''),
    quantity: Joi.number().min(0).allow(null, '')
  })).allow(null),
  nutritional_info: Joi.object({
    serving_size: Joi.string().allow(null, ''),
    calories: Joi.number().min(0).allow(null, ''),
    total_fat: Joi.number().min(0).allow(null, ''),
    saturated_fat: Joi.number().min(0).allow(null, ''),
    cholesterol: Joi.number().min(0).allow(null, ''),
    sodium: Joi.number().min(0).allow(null, ''),
    total_carbohydrates: Joi.number().min(0).allow(null, ''),
    dietary_fiber: Joi.number().min(0).allow(null, ''),
    sugars: Joi.number().min(0).allow(null, ''),
    protein: Joi.number().min(0).allow(null, '')
  }).allow(null),
  allergens: Joi.array().items(Joi.string().valid('milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame')).allow(null),
  may_contain_allergens: Joi.array().items(Joi.string()).allow(null),
  physical_properties: Joi.object({
    texture: Joi.string().allow(null, ''),
    color: Joi.string().allow(null, ''),
    ph_level: Joi.number().min(0).max(14).allow(null, ''),
    water_activity: Joi.number().min(0).max(1).allow(null, ''),
    viscosity: Joi.string().allow(null, '')
  }).allow(null),
  shelf_life: Joi.object({
    duration_days: Joi.number().min(0).allow(null, ''),
    storage_temperature: Joi.string().allow(null, ''),
    storage_conditions: Joi.string().allow(null, ''),
    opened_shelf_life_days: Joi.number().min(0).allow(null, '')
  }).allow(null),
  packaging_info: Joi.object({
    primary_packaging: Joi.string().allow(null, ''),
    secondary_packaging: Joi.string().allow(null, ''),
    packaging_material: Joi.string().allow(null, ''),
    label_compliance: Joi.boolean().allow(null),
    net_weight: Joi.string().allow(null, '')
  }).allow(null),
  quality_control: Joi.object({
    test_frequency: Joi.string().allow(null, ''),
    acceptance_criteria: Joi.string().allow(null, ''),
    sampling_plan: Joi.string().allow(null, ''),
    corrective_actions: Joi.string().allow(null, '')
  }).allow(null),
  regulatory_compliance: Joi.object({
    fda_approved: Joi.boolean().allow(null),
    organic_certified: Joi.boolean().allow(null),
    kosher_certified: Joi.boolean().allow(null),
    halal_certified: Joi.boolean().allow(null),
    gmp_compliant: Joi.boolean().allow(null),
    haccp_plan: Joi.boolean().allow(null)
  }).allow(null),
  current_stock: Joi.number().min(0).allow(null, ''),
  wizard_metadata: Joi.object().allow(null),
  status: Joi.string().valid('draft').default('draft')
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
  category: Joi.string().valid('raw_material', 'packaging', 'product', 'supplies').messages({
    'any.only': 'Category must be one of: raw_material, packaging, product, supplies'
  }),
  product_type: Joi.string().valid('work_in_progress', 'finished_goods').allow(null, '').when('category', {
    is: 'product',
    then: Joi.string().valid('work_in_progress', 'finished_goods'),
    otherwise: Joi.valid(null, '')
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
  labor_cost: Joi.number().min(0).allow(null, ''),
  overhead_cost: Joi.number().min(0).allow(null, ''),
  additional_packaging_cost: Joi.number().min(0).allow(null, ''),
  fifo_enabled: Joi.boolean(),
  batch_size: Joi.number().positive().allow(null),
  yield_percentage: Joi.number().min(0).max(100).allow(null),
  processing_loss: Joi.number().min(0).max(100).allow(null),
  production_notes: Joi.string().allow(null, ''),
  packaging_specs: Joi.object({
    height: Joi.string().allow(null, ''),
    width: Joi.string().allow(null, ''),
    thickness: Joi.string().allow(null, ''),
    material: Joi.string().allow(null, ''),
    design: Joi.string().allow(null, ''),
    contents: Joi.string().allow(null, '')
  }).allow(null),
  ingredients: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().positive().allow(null, ''),
    item_name: Joi.string().allow(null, ''),
    quantity: Joi.number().min(0).allow(null, '')
  })).allow(null),
  packaging_items: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().positive().allow(null, ''),
    item_name: Joi.string().allow(null, ''),
    quantity: Joi.number().min(0).allow(null, '')
  })).allow(null),
  nutritional_info: Joi.object({
    serving_size: Joi.string().allow(null, ''),
    calories: Joi.number().min(0).allow(null, ''),
    total_fat: Joi.number().min(0).allow(null, ''),
    saturated_fat: Joi.number().min(0).allow(null, ''),
    cholesterol: Joi.number().min(0).allow(null, ''),
    sodium: Joi.number().min(0).allow(null, ''),
    total_carbohydrates: Joi.number().min(0).allow(null, ''),
    dietary_fiber: Joi.number().min(0).allow(null, ''),
    sugars: Joi.number().min(0).allow(null, ''),
    protein: Joi.number().min(0).allow(null, '')
  }).allow(null),
  allergens: Joi.array().items(Joi.string().valid('milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame')).allow(null),
  may_contain_allergens: Joi.array().items(Joi.string()).allow(null),
  physical_properties: Joi.object({
    texture: Joi.string().allow(null, ''),
    color: Joi.string().allow(null, ''),
    ph_level: Joi.number().min(0).max(14).allow(null, ''),
    water_activity: Joi.number().min(0).max(1).allow(null, ''),
    viscosity: Joi.string().allow(null, '')
  }).allow(null),
  shelf_life: Joi.object({
    duration_days: Joi.number().min(0).allow(null, ''),
    storage_temperature: Joi.string().allow(null, ''),
    storage_conditions: Joi.string().allow(null, ''),
    opened_shelf_life_days: Joi.number().min(0).allow(null, '')
  }).allow(null),
  packaging_info: Joi.object({
    primary_packaging: Joi.string().allow(null, ''),
    secondary_packaging: Joi.string().allow(null, ''),
    packaging_material: Joi.string().allow(null, ''),
    label_compliance: Joi.boolean().allow(null),
    net_weight: Joi.string().allow(null, '')
  }).allow(null),
  quality_control: Joi.object({
    test_frequency: Joi.string().allow(null, ''),
    acceptance_criteria: Joi.string().allow(null, ''),
    sampling_plan: Joi.string().allow(null, ''),
    corrective_actions: Joi.string().allow(null, '')
  }).allow(null),
  regulatory_compliance: Joi.object({
    fda_approved: Joi.boolean().allow(null),
    organic_certified: Joi.boolean().allow(null),
    kosher_certified: Joi.boolean().allow(null),
    halal_certified: Joi.boolean().allow(null),
    gmp_compliant: Joi.boolean().allow(null),
    haccp_plan: Joi.boolean().allow(null)
  }).allow(null),
  current_stock: Joi.number().min(0).allow(null, ''),
  wizard_metadata: Joi.object().allow(null),
  status: Joi.string().valid('draft', 'active', 'inactive')
}).unknown(true); // Allow unknown properties (e.g., from getItemById associations)

export const validateCreateItem = (req, res, next) => {
  const { error, value } = createItemSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

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
  const { error, value } = updateItemSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    console.log('❌ VALIDATION ERROR - Request Body:', JSON.stringify(req.body, null, 2));
    console.log('❌ VALIDATION ERROR - Details:', error.details);

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

export const validateCreateItemDraft = (req, res, next) => {
  const { error, value } = createItemDraftSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

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

