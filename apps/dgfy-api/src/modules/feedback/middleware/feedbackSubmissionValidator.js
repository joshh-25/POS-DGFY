import Joi from 'joi';
import { FEEDBACK_TYPES } from '../usecases/feedbackSubmissionMapper.js';

const schema = Joi.object({
  type: Joi.string().valid(...FEEDBACK_TYPES).required(),
  description: Joi.string().trim().min(1).max(5000).required(),
  url: Joi.string().max(2048).optional(),
  context: Joi.object().unknown(true).optional(),
  origin: Joi.object({
    surface: Joi.string(), platform: Joi.string(), app_version: Joi.string().max(64)
  }).optional(),
  contact: Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    email: Joi.string().email().max(254).required()
  }).optional()
});

export const feedbackSubmissionValidator = (req, res, next) => {
  const input = req.feedbackIdentity ? { ...req.body, contact: undefined } : req.body;
  const guestSchema = req.feedbackIdentity ? schema : schema.fork('contact', (field) => field.required());
  const { error, value } = guestSchema.validate(input, { abortEarly: false, stripUnknown: true });
  if (error) return res.status(400).json({
    message: 'Invalid feedback submission',
    errors: error.details.map((detail) => ({ field: detail.path.join('.'), message: detail.message }))
  });
  req.body = value;
  return next();
};
