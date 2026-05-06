import Joi from 'joi';
import { USER_ROLES } from '../config/userRoles.js';

// Schema for updating user profile (username, email)
export const updateProfileSchema = Joi.object({
  username: Joi.string().min(3).max(50).optional().messages({
    'string.min': 'Username must be at least 3 characters',
    'string.max': 'Username must not exceed 50 characters'
  }),
  email: Joi.string().email().optional().messages({
    'string.email': 'Please provide a valid email address'
  })
}).min(1).messages({
  'object.min': 'At least one field (username or email) must be provided'
});

// Schema for changing password
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password is required'
  }),
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
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
