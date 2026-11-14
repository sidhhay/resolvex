/**
 * Declarative request validation.
 *
 * Hand-rolled rather than pulled from a package: the rule set the API needs is
 * small, and this keeps validation errors in the same shape as every other
 * error the client handles.
 *
 * Validated output lands on `req.validated` — controllers read that, never the
 * raw `req.body`, so an unvalidated field cannot reach the database by
 * accident. (Express 5 also makes `req.query` read-only, so writing results to
 * a separate object is required rather than merely tidy.)
 */
import { BadRequestError } from '../domain/errors.js';

/**
 * @typedef {Object} FieldRule
 * @property {'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'array' | 'date'} type
 * @property {boolean} [required]
 * @property {unknown} [default]
 * @property {number} [min]      Min length for strings/arrays, min value for numbers.
 * @property {number} [max]
 * @property {ReadonlyArray<unknown>} [values]  Allowed values for `enum`.
 * @property {RegExp} [pattern]
 * @property {boolean} [trim]    Defaults to true for strings.
 * @property {boolean} [lowercase]
 * @property {string} [message]  Overrides the generated message.
 * @property {(value: any) => unknown} [transform]
 */

/** @typedef {Record<string, FieldRule>} Schema */

/**
 * @param {unknown} value
 * @param {string} field
 * @param {FieldRule} rule
 * @param {Record<string, string>} errors
 * @returns {unknown}
 */
function coerce(value, field, rule, errors) {
  const fail = (/** @type {string} */ msg) => {
    errors[field] = rule.message ?? msg;
    return undefined;
  };

  switch (rule.type) {
    case 'string': {
      if (typeof value !== 'string') return fail(`${field} must be text`);
      let text = rule.trim === false ? value : value.trim();
      if (rule.lowercase) text = text.toLowerCase();
      if (rule.min !== undefined && text.length < rule.min) {
        return fail(`${field} must be at least ${rule.min} characters`);
      }
      if (rule.max !== undefined && text.length > rule.max) {
        return fail(`${field} must be at most ${rule.max} characters`);
      }
      if (rule.pattern && !rule.pattern.test(text)) return fail(`${field} is not in the expected format`);
      return text;
    }
    case 'number':
    case 'integer': {
      const num = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(num)) return fail(`${field} must be a number`);
      if (rule.type === 'integer' && !Number.isInteger(num)) {
        return fail(`${field} must be a whole number`);
      }
      if (rule.min !== undefined && num < rule.min) return fail(`${field} must be at least ${rule.min}`);
      if (rule.max !== undefined && num > rule.max) return fail(`${field} must be at most ${rule.max}`);
      return num;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const text = String(value).toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(text)) return true;
      if (['false', '0', 'no', 'off'].includes(text)) return false;
      return fail(`${field} must be true or false`);
    }
    case 'enum': {
      const text = String(value).trim();
      if (!rule.values?.includes(text)) {
        return fail(`${field} must be one of: ${(rule.values ?? []).join(', ')}`);
      }
      return text;
    }
    case 'array': {
      // Query strings deliver repeated params as arrays and single ones as
      // scalars; comma-separated is also accepted for hand-written URLs.
      const items = Array.isArray(value)
        ? value
        : String(value)
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
      if (rule.values) {
        const invalid = items.filter((item) => !rule.values?.includes(item));
        if (invalid.length > 0) {
          return fail(`${field} contains unsupported values: ${invalid.join(', ')}`);
        }
      }
      if (rule.max !== undefined && items.length > rule.max) {
        return fail(`${field} accepts at most ${rule.max} values`);
      }
      return items;
    }
    case 'date': {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return fail(`${field} must be a valid date`);
      return date.toISOString();
    }
    default:
      return value;
  }
}

/**
 * @param {Schema} schema
 * @param {'body' | 'query' | 'params'} source
 * @returns {import('express').RequestHandler}
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    /** @type {Record<string, string>} */
    const errors = {};
    /** @type {Record<string, unknown>} */
    const output = {};
    const input = /** @type {Record<string, unknown>} */ (req[source] ?? {});

    for (const [field, rule] of Object.entries(schema)) {
      const raw = input[field];
      const missing = raw === undefined || raw === null || raw === '';

      if (missing) {
        if (rule.required) {
          errors[field] = rule.message ?? `${field} is required`;
        } else if (rule.default !== undefined) {
          output[field] = rule.default;
        }
        continue;
      }

      const value = coerce(raw, field, rule, errors);
      if (value !== undefined) output[field] = rule.transform ? rule.transform(value) : value;
    }

    if (Object.keys(errors).length > 0) {
      return next(new BadRequestError('Some fields need attention', errors));
    }

    // Merge so a route can validate params and body in sequence.
    req.validated = { ...(req.validated ?? {}), ...output };
    return next();
  };
}

/**
 * Validates a numeric path parameter, e.g. `/complaints/:id`.
 * @param {string} name
 * @returns {import('express').RequestHandler}
 */
export function validateIdParam(name = 'id') {
  return (req, _res, next) => {
    const value = Number(req.params[name]);
    if (!Number.isInteger(value) || value <= 0) {
      return next(new BadRequestError(`${name} must be a positive integer`, { [name]: 'invalid id' }));
    }
    req.validated = { ...(req.validated ?? {}), [name]: value };
    return next();
  };
}
