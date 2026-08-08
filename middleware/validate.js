const { fail } = require('../services/helpers');

function formatZodError(error) {
  const fieldErrors = {};
  const formErrors = [];
  for (const issue of error.issues || []) {
    const path = Array.isArray(issue.path) ? issue.path.filter((p) => p != null).join('.') : '';
    if (path) {
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }
  return { fieldErrors, formErrors };
}

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const raw = source === 'query' ? req.query : source === 'params' ? req.params : req.body;
    const parsed = schema.safeParse(raw ?? {});
    if (!parsed.success) {
      return fail(res, 400, 'Validation failed', 'VALIDATION_ERROR', formatZodError(parsed.error));
    }
    if (source === 'query') req.query = parsed.data;
    else if (source === 'params') req.params = { ...req.params, ...parsed.data };
    else req.body = parsed.data;
    return next();
  };
}

function validateBody(schema) {
  return validate(schema, 'body');
}

function validateQuery(schema) {
  return validate(schema, 'query');
}

function validateParams(schema) {
  return validate(schema, 'params');
}

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  formatZodError,
};
