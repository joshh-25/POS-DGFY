const buildValidationErrorResponse = (error) => ({
  success: false,
  data: null,
  message: 'Validation failed',
  errors: error.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message
  })),
  timestamp: new Date().toISOString()
});

const validateSchema = (schema, source = 'body', target = 'validatedData', options = {}) => {
  const joiOptions = {
    abortEarly: false,
    stripUnknown: true,
    ...options
  };

  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], joiOptions);

    if (error) {
      return res.status(422).json(buildValidationErrorResponse(error));
    }

    req[target] = value;
    return next();
  };
};

export default validateSchema;
