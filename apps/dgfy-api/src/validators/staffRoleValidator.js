import Joi from 'joi';

const validate = (schema, source, target) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
  if (error) return res.status(422).json({ success: false, data: null, message: 'Validation failed', errors: error.details.map((detail) => ({ field: detail.path.join('.'), message: detail.message })), timestamp: new Date().toISOString() });
  req[target] = value; return next();
};
const id = Joi.number().integer().positive();
const capabilityList = Joi.array().items(Joi.string().trim().min(1)).unique().max(200);
const roleBody = Joi.object({ name: Joi.string().trim().min(1).max(120), capabilities: capabilityList, is_active: Joi.boolean() }).min(1);
export const validateStaffRoleBody = validate(roleBody, 'body', 'validatedData');
export const validateStaffRoleStatus = validate(Joi.object({ is_active: Joi.boolean().required() }), 'body', 'validatedData');
export const validateStaffRoleId = validate(Joi.object({ staffRoleId: id.required() }), 'params', 'validatedParams');
export const validateStaffUserId = validate(Joi.object({ userId: id.required() }), 'params', 'validatedParams');
export const validateStaffRoleAssignment = validate(Joi.object({ staff_role_id: id.allow(null, '') }), 'body', 'validatedData');
export const validateStaffRoleQuery = validate(Joi.object({ include_inactive: Joi.boolean().truthy('true').falsy('false').default(false) }), 'query', 'validatedQuery');
export const validateStaffAssignmentsQuery = validate(Joi.object({ location_id: id.allow(null, '') }), 'query', 'validatedQuery');
export const __testables = Object.freeze({ roleBody, capabilityList });
