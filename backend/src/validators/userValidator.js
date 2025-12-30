import Joi from 'joi';

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
  role: Joi.string().valid('admin', 'manager', 'staff').required().messages({
    'any.only': 'Role must be one of: admin, manager, staff',
    'any.required': 'Role is required'
  })
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
