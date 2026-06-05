import Joi from 'joi';
import { PHONE_NUMBER_PATTERN } from '../utils/phoneNumber.js';
import { isEmailOtpEnforcementEnabled } from '../config/emailOtp.js';

const requiredEmailOtpCodeSchema = () => {
  const base = Joi.string().pattern(/^\d{6}$/).messages({
    'string.pattern.base': 'Email verification code must be 6 digits',
    'any.required': 'Email verification code is required'
  });
  return isEmailOtpEnforcementEnabled() ? base.required() : base.optional();
};

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

export const registerSchema = Joi.object({
  username: Joi.string().min(3).max(50).required().messages({
    'string.min': 'Username must be at least 3 characters',
    'string.max': 'Username must not exceed 50 characters',
    'any.required': 'Username is required'
  }),
  // Joi version compatibility issue with TLD options, falling back to simple validation
  email: Joi.string().pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).required().messages({
    'string.pattern.base': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  phone_number: phoneNumberSchema.required().messages({
    'any.required': 'Phone number is required'
  }),
  password: Joi.string().min(8).required().messages({
    'string.min': 'Password must be at least 8 characters',
    'any.required': 'Password is required'
  }),
  email_otp_code: requiredEmailOtpCodeSchema()
  // role is NOT allowed during registration - always defaults to 'staff'
  // Only admins can change roles via User Management
});

export const loginSchema = Joi.object({
  email: Joi.string().pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).required().messages({
    'string.pattern.base': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().optional().allow('').messages({
    'string.base': 'Refresh token must be a string'
  })
});

export const emailLookupSchema = Joi.object({
  email: Joi.string().pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).required().messages({
    'string.pattern.base': 'Please provide a valid email address',
    'any.required': 'Email is required'
  })
});

export const acceptInviteSchema = Joi.object({
  token: Joi.string().length(64).required().messages({
    'string.length': 'Invalid invitation token',
    'any.required': 'Invitation token is required'
  }),
  username: Joi.string().min(3).max(50).required().messages({
    'string.min': 'Username must be at least 3 characters',
    'string.max': 'Username must not exceed 50 characters',
    'any.required': 'Username is required'
  }),
  phone_number: phoneNumberSchema.required().messages({
    'any.required': 'Phone number is required'
  }),
  password: Joi.string().min(8).required().messages({
    'string.min': 'Password must be at least 8 characters',
    'any.required': 'Password is required'
  }),
  email_otp_code: requiredEmailOtpCodeSchema()
});

export const validateInviteTokenSchema = Joi.object({
  token: Joi.string().length(64).required().messages({
    'string.length': 'Invalid invitation token',
    'any.required': 'Invitation token is required'
  })
});

export const emailOtpRequestSchema = Joi.object({
  purpose: Joi.string()
    .valid('company_registration', 'tenant_user_registration', 'invitation_acceptance')
    .required()
    .messages({
      'any.only': 'purpose must be one of: company_registration, tenant_user_registration, invitation_acceptance',
      'any.required': 'purpose is required'
    }),
  email: Joi.string().pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).when('purpose', {
    is: Joi.valid('company_registration', 'tenant_user_registration'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }).messages({
    'string.pattern.base': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  invitation_token: Joi.string().length(64).when('purpose', {
    is: 'invitation_acceptance',
    then: Joi.required(),
    otherwise: Joi.optional()
  }).messages({
    'string.length': 'Invalid invitation token',
    'any.required': 'Invitation token is required'
  })
});

export const validateRegister = (req, res, next) => {
  const { error, value } = registerSchema.validate(req.body, { abortEarly: false });

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

export const validateLogin = (req, res, next) => {
  const { error, value } = loginSchema.validate(req.body, { abortEarly: false });

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

export const validateRefreshToken = (req, res, next) => {
  const { error, value } = refreshTokenSchema.validate(req.body, { abortEarly: false });

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

export const validateEmailLookup = (req, res, next) => {
  const { error, value } = emailLookupSchema.validate(req.body, { abortEarly: false });

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

export const validateAcceptInvite = (req, res, next) => {
  const { error, value } = acceptInviteSchema.validate(req.body, { abortEarly: false });

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

export const validateInviteToken = (req, res, next) => {
  // Token comes from URL param
  const { error, value } = validateInviteTokenSchema.validate({ token: req.params.token }, { abortEarly: false });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path[0],
      message: detail.message
    }));

    return res.status(422).json({
      success: false,
      data: null,
      message: 'Invalid invitation token',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  req.validatedData = value;
  next();
};

export const validateEmailOtpRequest = (req, res, next) => {
  const { error, value } = emailOtpRequestSchema.validate(req.body, { abortEarly: false });

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
