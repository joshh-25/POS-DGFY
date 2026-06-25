import Joi from 'joi';
import { WORKFLOW_MODE_VALUES } from '../modules/shared/constants/workflowModes.js';
import {
  CUSTOMER_ACCESS_MODES,
  INVENTORY_DISPLAY_MODES
} from '../modules/shared/utils/customerAccessPolicy.js';

const ORDER_METHODS = ['dine_in', 'takeout', 'pickup', 'delivery', 'online'];
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const TERMINAL_REGISTRY_MODES = ['warn', 'enforce'];
const STOREFRONT_ASSET_TYPES = new Set(['cover', 'profile']);
const PLATFORM_CONTROLLED_POS_SOFTWARE_KEYS = new Set([
  'pos_software_name',
  'pos_software_version',
  'pos_software_serial_number'
]);
const PLATFORM_CONTROLLED_POS_SOFTWARE_MESSAGE = 'Software name, software version, and software serial number are configured by platform admin for DGFY POS.';

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

const posTerminalRegistryEntrySchema = Joi.object({
  terminal_id: Joi.string().trim().uppercase().pattern(TERMINAL_ID_PATTERN).required().messages({
    'any.required': 'Terminal ID is required',
    'string.pattern.base': 'Terminal ID may only contain letters, numbers, dot, underscore, or hyphen'
  }),
  location_id: Joi.number().integer().positive().allow(null).optional(),
  label: Joi.string().trim().max(80).allow('', null).optional(),
  is_active: Joi.boolean().default(true),
  is_default: Joi.boolean().default(false),
  terminal_password: Joi.string().trim().min(4).max(64).allow('', null).optional().messages({
    'string.min': 'Terminal password must be at least 4 characters',
    'string.max': 'Terminal password must be 64 characters or less'
  }),
  clear_terminal_password: Joi.boolean().default(false),
  terminal_password_hash: Joi.string().trim().max(255).allow('', null).optional(),
  has_password: Joi.boolean().optional()
});

const posTerminalRegistrySchema = Joi.array()
  .items(posTerminalRegistryEntrySchema)
  .max(40)
  .custom((entries, helpers) => {
    if (!Array.isArray(entries)) {
      return helpers.error('any.invalid', { message: 'Terminal registry must be an array' });
    }

    const seenIds = new Set();
    const activeLocationIds = new Set();
    let defaultCount = 0;
    let activeCount = 0;

    for (const entry of entries) {
      const terminalId = String(entry?.terminal_id || '').trim().toUpperCase();
      if (!terminalId) continue;

      if (seenIds.has(terminalId)) {
        return helpers.error('any.invalid', {
          message: `Duplicate terminal ID: ${terminalId}`
        });
      }
      seenIds.add(terminalId);

      const isActive = entry?.is_active !== false;
      if (isActive) {
        activeCount += 1;
        const locationId = Number.isInteger(Number(entry?.location_id)) ? Number(entry.location_id) : null;
        if (locationId) {
          if (activeLocationIds.has(locationId)) {
            return helpers.error('any.invalid', {
              message: `Only one active terminal is allowed for location ${locationId}`
            });
          }
          activeLocationIds.add(locationId);
        }
      }
      if (entry?.is_default === true) {
        defaultCount += 1;
        if (!isActive) {
          return helpers.error('any.invalid', {
            message: `Default terminal must be active: ${terminalId}`
          });
        }
      }
    }

    if (defaultCount > 1) {
      return helpers.error('any.invalid', {
        message: 'Only one default terminal is allowed'
      });
    }
    if (entries.length > 0 && activeCount === 0) {
      return helpers.error('any.invalid', {
        message: 'At least one terminal must be active'
      });
    }

    return entries;
  })
  .messages({
    'array.max': 'A maximum of 40 terminal registry entries is allowed',
    'any.invalid': '{{#message}}'
  });
const storefrontAssetUrlSchema = Joi.string().trim().max(500).pattern(/^$|^\/uploads\/storefront-assets\/[A-Za-z0-9/_\-.]+$/).optional().messages({
  'string.pattern.base': 'Storefront asset URL must be empty or a backend-relative /uploads/storefront-assets path'
});
const storefrontAssetPathSchema = Joi.string().trim().max(500).pattern(/^$|^storefront-assets\/[A-Za-z0-9/_\-.]+$/).optional().messages({
  'string.pattern.base': 'Storefront asset path must be empty or a storefront-assets relative path'
});
const storefrontWhyChooseUsSchema = Joi.array().items(Joi.string().trim().min(1).max(120)).max(6).optional();
const storefrontReviewHighlightsSchema = Joi.array().items(
  Joi.object({
    reviewer_name: Joi.string().trim().max(80).allow('', null).optional(),
    rating: Joi.number().min(1).max(5).precision(1).allow(null).optional(),
    comment: Joi.string().trim().max(280).required()
  })
).max(8).optional();
const storefrontSocialLinksSchema = Joi.object({
  messenger: Joi.string().trim().max(255).allow('', null).optional(),
  facebook: Joi.string().trim().max(255).allow('', null).optional(),
  instagram: Joi.string().trim().max(255).allow('', null).optional()
}).optional();
const storefrontPromoSchema = Joi.object({
  title: Joi.string().trim().max(100).allow('', null).optional(),
  subtitle: Joi.string().trim().max(160).allow('', null).optional(),
  badge: Joi.string().trim().max(60).allow('', null).optional(),
  validity_text: Joi.string().trim().max(120).allow('', null).optional(),
  active: Joi.boolean().default(false)
}).optional();
const businessHoursDaySchema = Joi.object({
  enabled: Joi.boolean().required(),
  open: Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required().messages({
    'string.pattern.base': 'Business hours opening time must use HH:mm format'
  }),
  close: Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required().messages({
    'string.pattern.base': 'Business hours closing time must use HH:mm format'
  })
});
const storefrontBusinessHoursSchema = Joi.alternatives().try(
  Joi.string().trim().max(120).allow(''),
  Joi.object({
    mode: Joi.string().valid('weekly').default('weekly'),
    timezone: Joi.string().trim().max(80).default('Asia/Manila'),
    weekly: Joi.object({
      sun: businessHoursDaySchema.required(),
      mon: businessHoursDaySchema.required(),
      tue: businessHoursDaySchema.required(),
      wed: businessHoursDaySchema.required(),
      thu: businessHoursDaySchema.required(),
      fri: businessHoursDaySchema.required(),
      sat: businessHoursDaySchema.required()
    }).required(),
    display: Joi.string().trim().max(120).allow('').optional()
  })
);
const storefrontCategoriesSchema = Joi.array().items(Joi.string().trim().min(1).max(60)).max(12).optional();
const storefrontGalleryUrlSchema = Joi.string().trim().max(500).uri({ scheme: ['http', 'https'] }).allow('', null).optional();
const storefrontGalleryPathSchema = Joi.string().trim().max(500).pattern(/^$|^storefront-assets\/[A-Za-z0-9/_\-.]+$/).allow(null).optional().messages({
  'string.pattern.base': 'Storefront gallery path must be empty or a storefront-assets relative path'
});
const storefrontGalleryImageSchema = Joi.object({
  url: storefrontGalleryUrlSchema,
  path: storefrontGalleryPathSchema,
  caption: Joi.string().trim().max(140).allow('', null).optional(),
  alt: Joi.string().trim().max(140).allow('', null).optional(),
  sort_order: Joi.number().integer().min(0).max(9999).optional()
}).custom((value, helpers) => {
  const hasUrl = Boolean(String(value?.url || '').trim());
  const hasPath = Boolean(String(value?.path || '').trim());
  if (!hasUrl && !hasPath) {
    return helpers.error('any.invalid', {
      message: 'Each storefront gallery image must include a url or path'
    });
  }
  return value;
}).messages({
  'any.invalid': '{{#message}}'
});
const storefrontGalleryImagesSchema = Joi.array().items(storefrontGalleryImageSchema).max(24).optional();
const storefrontDeliveryPartnerSchema = Joi.alternatives().try(
  Joi.string().trim().lowercase().valid('grab', 'foodpanda', 'lalamove'),
  Joi.object({
    partner: Joi.string().trim().lowercase().valid('grab', 'foodpanda', 'lalamove', 'custom').required(),
    label: Joi.string().trim().max(60).allow('', null).optional(),
    url: Joi.string().trim().max(255).uri({ scheme: ['http', 'https'] }).allow('', null).optional()
  })
);
const storefrontDeliveryPartnersSchema = Joi.array().items(storefrontDeliveryPartnerSchema).max(8).optional();
const storefrontReviewSummarySchema = Joi.object({
  score: Joi.number().min(0).max(5).precision(2).allow(null).optional(),
  total_count: Joi.number().integer().min(0).max(1000000).allow(null).optional(),
  star_distribution: Joi.object({
    1: Joi.number().integer().min(0).max(1000000).optional(),
    2: Joi.number().integer().min(0).max(1000000).optional(),
    3: Joi.number().integer().min(0).max(1000000).optional(),
    4: Joi.number().integer().min(0).max(1000000).optional(),
    5: Joi.number().integer().min(0).max(1000000).optional()
  }).optional()
}).optional();
const customerAccessModeSchema = Joi.string().trim().lowercase().valid(...CUSTOMER_ACCESS_MODES).messages({
  'any.only': `Customer access mode must be one of: ${CUSTOMER_ACCESS_MODES.join(', ')}`
});
const inventoryDisplayModeSchema = Joi.string().trim().lowercase().valid(...INVENTORY_DISPLAY_MODES).messages({
  'any.only': `Inventory display mode must be one of: ${INVENTORY_DISPLAY_MODES.join(', ')}`
});
const inventoryLowStockDisplayThresholdSchema = Joi.number().integer().min(1).max(9999);

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
  pos_registered_name: Joi.string().trim().min(2).max(150).allow('').optional(),
  pos_business_name: Joi.string().trim().min(2).max(150).allow('').optional(),
  pos_business_style: Joi.string().trim().max(150).allow('').optional(),
  pos_taxpayer_type: Joi.string().trim().max(40).allow('').optional(),
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
  pos_software_name: Joi.any().forbidden().messages({
    'any.unknown': PLATFORM_CONTROLLED_POS_SOFTWARE_MESSAGE
  }),
  pos_software_version: Joi.any().forbidden().messages({
    'any.unknown': PLATFORM_CONTROLLED_POS_SOFTWARE_MESSAGE
  }),
  pos_software_serial_number: Joi.any().forbidden().messages({
    'any.unknown': PLATFORM_CONTROLLED_POS_SOFTWARE_MESSAGE
  }),
  pos_fiscal_buyer_details_required: Joi.boolean().optional(),
  pos_receipt_footer_message: Joi.string().trim().max(300).allow('').optional(),
  pos_discount_profiles: posDiscountProfilesSchema.optional(),
  pos_order_method_fees: posOrderMethodFeesSchema.optional(),
  pos_terminal_registry: posTerminalRegistrySchema.optional(),
  pos_terminal_registry_mode: Joi.string().trim().lowercase().valid(...TERMINAL_REGISTRY_MODES).optional().messages({
    'any.only': 'Terminal registry mode must be warn or enforce'
  }),
  pos_terminal_location_binding_enforced: Joi.boolean().optional(),
  pos_petty_cash_symbol: Joi.string().trim().max(12).allow('').optional(),
  pos_petty_cash_amount: Joi.number().min(0).precision(4).optional(),
  store_delivery_fee: Joi.number().min(0).precision(4).optional(),
  store_tenant_slug: Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9-]*$/).allow('').optional().messages({
    'string.pattern.base': 'Store tenant slug may only contain lowercase letters, numbers, and hyphens'
  }),
  storefront_cover_image_url: storefrontAssetUrlSchema,
  storefront_cover_image_path: storefrontAssetPathSchema,
  storefront_profile_image_url: storefrontAssetUrlSchema,
  storefront_profile_image_path: storefrontAssetPathSchema,
  storefront_tagline: Joi.string().trim().max(120).allow('').optional(),
  storefront_about: Joi.string().trim().max(1000).allow('').optional(),
  storefront_phone: Joi.string().trim().max(50).allow('').optional(),
  storefront_email: Joi.string().trim().email({ tlds: { allow: false } }).max(120).allow('').optional(),
  storefront_hours: storefrontBusinessHoursSchema.optional(),
  storefront_why_choose_us: storefrontWhyChooseUsSchema,
  storefront_social_links: storefrontSocialLinksSchema,
  storefront_review_highlights: storefrontReviewHighlightsSchema,
  storefront_review_summary: storefrontReviewSummarySchema,
  storefront_promo: storefrontPromoSchema,
  storefront_ui_v2_enabled: Joi.boolean().optional(),
  storefront_categories: storefrontCategoriesSchema,
  storefront_gallery_images: storefrontGalleryImagesSchema,
  storefront_delivery_partners: storefrontDeliveryPartnersSchema,
  storefront_follow_enabled: Joi.boolean().optional(),
  storefront_share_enabled: Joi.boolean().optional(),
  customer_access_mode: customerAccessModeSchema.optional(),
  inventory_display_mode: inventoryDisplayModeSchema.optional(),
  inventory_low_stock_display_threshold: inventoryLowStockDisplayThresholdSchema.optional(),
  store_is_visible: Joi.boolean().optional(),
  store_has_no_location: Joi.boolean().optional(),
  pos_open_status: Joi.boolean().optional(),
  pos_wait_time_minutes: Joi.number().integer().min(0).max(720).optional(),
  ops_workflow_mode: Joi.string().trim().lowercase().valid(...WORKFLOW_MODE_VALUES).optional().messages({
    'any.only': `Workflow mode must be one of: ${WORKFLOW_MODE_VALUES.join(', ')}`
  })
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
  if (PLATFORM_CONTROLLED_POS_SOFTWARE_KEYS.has(settingKey)) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: [{
        field: 'key',
        message: PLATFORM_CONTROLLED_POS_SOFTWARE_MESSAGE
      }],
      timestamp: new Date().toISOString()
    });
  }

  const singleSettingSchemaByKey = {
    pos_registered_name: Joi.string().trim().min(2).max(150).allow(''),
    pos_business_name: Joi.string().trim().min(2).max(150).allow(''),
    pos_business_style: Joi.string().trim().max(150).allow(''),
    pos_taxpayer_type: Joi.string().trim().max(40).allow(''),
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
    pos_fiscal_buyer_details_required: Joi.boolean(),
    pos_receipt_footer_message: Joi.string().trim().max(300).allow(''),
    pos_discount_profiles: posDiscountProfilesSchema,
    pos_order_method_fees: posOrderMethodFeesSchema,
    pos_terminal_registry: posTerminalRegistrySchema,
    pos_terminal_registry_mode: Joi.string().trim().lowercase().valid(...TERMINAL_REGISTRY_MODES).messages({
      'any.only': 'Terminal registry mode must be warn or enforce'
    }),
    pos_terminal_location_binding_enforced: Joi.boolean(),
    pos_petty_cash_symbol: Joi.string().trim().max(12).allow(''),
    pos_petty_cash_amount: Joi.number().min(0).precision(4),
    store_delivery_fee: Joi.number().min(0).precision(4),
    store_tenant_slug: Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9-]*$/).allow('').messages({
      'string.pattern.base': 'Store tenant slug may only contain lowercase letters, numbers, and hyphens'
    }),
    storefront_cover_image_url: storefrontAssetUrlSchema,
    storefront_cover_image_path: storefrontAssetPathSchema,
    storefront_profile_image_url: storefrontAssetUrlSchema,
    storefront_profile_image_path: storefrontAssetPathSchema,
    storefront_tagline: Joi.string().trim().max(120).allow(''),
    storefront_about: Joi.string().trim().max(1000).allow(''),
    storefront_phone: Joi.string().trim().max(50).allow(''),
    storefront_email: Joi.string().trim().email({ tlds: { allow: false } }).max(120).allow(''),
    storefront_hours: storefrontBusinessHoursSchema,
    storefront_why_choose_us: storefrontWhyChooseUsSchema,
    storefront_social_links: storefrontSocialLinksSchema,
    storefront_review_highlights: storefrontReviewHighlightsSchema,
    storefront_review_summary: storefrontReviewSummarySchema,
    storefront_promo: storefrontPromoSchema,
    storefront_ui_v2_enabled: Joi.boolean(),
    storefront_categories: storefrontCategoriesSchema,
    storefront_gallery_images: storefrontGalleryImagesSchema,
    storefront_delivery_partners: storefrontDeliveryPartnersSchema,
    storefront_follow_enabled: Joi.boolean(),
    storefront_share_enabled: Joi.boolean(),
    customer_access_mode: customerAccessModeSchema,
    inventory_display_mode: inventoryDisplayModeSchema,
    inventory_low_stock_display_threshold: inventoryLowStockDisplayThresholdSchema,
    store_is_visible: Joi.boolean(),
    store_has_no_location: Joi.boolean(),
    pos_open_status: Joi.boolean(),
    pos_wait_time_minutes: Joi.number().integer().min(0).max(720),
    ops_workflow_mode: Joi.string().trim().lowercase().valid(...WORKFLOW_MODE_VALUES).messages({
      'any.only': `Workflow mode must be one of: ${WORKFLOW_MODE_VALUES.join(', ')}`
    })
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

export const validateStorefrontAssetTypeParam = (req, res, next) => {
  const assetType = String(req?.params?.asset_type || '').trim().toLowerCase();
  if (!STOREFRONT_ASSET_TYPES.has(assetType)) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: [{
        field: 'asset_type',
        message: 'asset_type must be one of: cover, profile'
      }],
      timestamp: new Date().toISOString()
    });
  }

  req.params.asset_type = assetType;
  next();
};
