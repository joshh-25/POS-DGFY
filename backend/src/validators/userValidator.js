import Joi from 'joi';
import { USER_ROLES } from '../config/userRoles.js';
import { PHONE_NUMBER_PATTERN } from '../utils/phoneNumber.js';
import { isEmailOtpEnforcementEnabled } from '../config/emailOtp.js';

const phoneNumberSchema = Joi.string()
  .trim()
  .min(7)
  .max(40)
  .pattern(PHONE_NUMBER_PATTERN)
  .messages({
    'string.min': 'Phone number must be at least 7 characters',
    'string.max': 'Phone number must not exceed 40 characters',
    'string.pattern.base': 'Phone number may only contain digits, spaces, +, -, parentheses, and periods'
  });

// Schema for updating user profile (username, email)
export const updateProfileSchema = Joi.object({
  username: Joi.string().min(3).max(50).optional().messages({
    'string.min': 'Username must be at least 3 characters',
    'string.max': 'Username must not exceed 50 characters'
  }),
  email: Joi.string().email().optional().messages({
    'string.email': 'Please provide a valid email address'
  }),
  email_otp_code: Joi.string().pattern(/^\d{6}$/).when('email', {
    is: Joi.exist(),
    then: isEmailOtpEnforcementEnabled() ? Joi.required() : Joi.optional(),
    otherwise: Joi.optional()
  }).messages({
    'string.pattern.base': 'Email verification code must be 6 digits',
    'any.required': 'Email verification code is required when changing email'
  }),
  phone_number: phoneNumberSchema.optional().messages({
    'string.empty': 'Phone number cannot be empty'
  })
}).min(1).messages({
  'object.min': 'At least one profile field must be provided'
});

// Schema for changing password
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password is required'
  }),
  newPassword: Joi.string()
    .min(8)
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters',
      'any.required': 'New password is required'
    })
});

// Schema for updating user role (admin only)
export const updateUserRoleSchema = Joi.object({
  role: Joi.string().valid(...USER_ROLES).optional().messages({
    'any.only': `Role must be one of: ${USER_ROLES.join(', ')}`,
    'any.required': 'Role is required'
  }),
  role_preset_key: Joi.string().trim().max(80).optional().messages({
    'string.max': 'role_preset_key must not exceed 80 characters'
  }),
  location_ids: Joi.array().items(Joi.number().integer().positive()).optional().messages({
    'array.base': 'location_ids must be an array'
  })
}).or('role', 'role_preset_key').messages({
  'object.missing': 'Either role or role_preset_key is required'
});

// Schema for updating user status (admin only)
export const updateUserStatusSchema = Joi.object({
  is_active: Joi.boolean().required().messages({
    'any.required': 'Active status is required',
    'boolean.base': 'Active status must be a boolean value'
  })
});

/**
 * Middleware to validate profile update request
 */
export const validateUpdateProfile = (req, res, next) => {
  const { error, value } = updateProfileSchema.validate(req.body, { abortEarly: false });

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

/**
 * Middleware to validate password change request
 */
export const validateChangePassword = (req, res, next) => {
  const { error, value } = changePasswordSchema.validate(req.body, { abortEarly: false });

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

/**
 * Middleware to validate user role update request (admin only)
 */
export const validateUpdateUserRole = (req, res, next) => {
  const { error, value } = updateUserRoleSchema.validate(req.body, { abortEarly: false });

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

/**
 * Middleware to validate user status update request (admin only)
 */
export const validateUpdateUserStatus = (req, res, next) => {
  const { error, value } = updateUserStatusSchema.validate(req.body, { abortEarly: false });

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

// Schema for updating user permissions (Master Admin only)
export const updateUserPermissionsSchema = Joi.object({
  permissions: Joi.array().items(Joi.string()).required().messages({
    'array.base': 'Permissions must be an array',
    'any.required': 'Permissions array is required',
    'string.base': 'Permission items must be strings'
  }),
  is_master_admin: Joi.boolean().strict().optional().messages({
    'boolean.base': 'is_master_admin must be a boolean'
  })
});

/**
 * Middleware to validate user permission update request (Master Admin only)
 */
export const validateUpdateUserPermissions = (req, res, next) => {
  const { error, value } = updateUserPermissionsSchema.validate(req.body, { abortEarly: false });

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

// Schema for inviting a user (admin only)
export const inviteUserSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  role: Joi.string().valid(...USER_ROLES).optional().messages({
    'any.only': `Role must be one of: ${USER_ROLES.join(', ')}`,
    'any.required': 'Role is required'
  }),
  role_preset_key: Joi.string().trim().max(80).optional().messages({
    'string.max': 'role_preset_key must not exceed 80 characters'
  }),
  location_ids: Joi.array().items(Joi.number().integer().positive()).optional().default([]).messages({
    'array.base': 'location_ids must be an array'
  }),
  delivery_mode: Joi.string().valid('email', 'manual').optional().default('email').messages({
    'any.only': 'delivery_mode must be one of: email, manual'
  })
});

export const emailChangeOtpRequestSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  })
});

/**
 * Middleware to validate user invitation request (admin only)
 */
export const validateInviteUser = (req, res, next) => {
  const { error, value } = inviteUserSchema.validate(req.body, { abortEarly: false });

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

export const validateEmailChangeOtpRequest = (req, res, next) => {
  const { error, value } = emailChangeOtpRequestSchema.validate(req.body, { abortEarly: false });

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

export const updateUserLocationGrantsSchema = Joi.object({
  location_ids: Joi.array()
    .items(
      Joi.number().integer().positive().messages({
        'number.base': 'location_ids entries must be numbers',
        'number.integer': 'location_ids entries must be integers',
        'number.positive': 'location_ids entries must be positive'
      })
    )
    .required()
    .unique()
    .messages({
      'array.base': 'location_ids must be an array',
      'any.required': 'location_ids is required',
      'array.unique': 'location_ids must not contain duplicates'
    })
});

export const validateUpdateUserLocationGrants = (req, res, next) => {
  const { error, value } = updateUserLocationGrantsSchema.validate(req.body, { abortEarly: false });

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
