/**
 * Input-handling edge cases: upload sniffing and request validation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffFileType } from '../src/services/uploadService.js';
import { validate, validateIdParam } from '../src/middleware/validate.js';
import { BadRequestError } from '../src/domain/errors.js';

/**
 * Runs a middleware synchronously and returns whatever it passed to `next`.
 * @param {import('express').RequestHandler} middleware
 * @param {any} req
 */
function run(middleware, req) {
  /** @type {any} */
  let error = null;
  middleware(req, /** @type {any} */ ({}), (err) => {
    error = err ?? null;
  });
  return { error, validated: req.validated };
}

test('file type is decided by magic bytes, not the declared content type', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
  ]);
  assert.deepEqual(sniffFileType(png), { mime: 'image/png', ext: 'png' });

  const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(16)]);
  assert.equal(sniffFileType(pdf)?.mime, 'application/pdf');

  // A script renamed to .png, or an SVG (a script-execution vector), is rejected
  // however it labels itself.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
  assert.equal(sniffFileType(svg), null);
  const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(16)]);
  assert.equal(sniffFileType(elf), null);
  assert.equal(sniffFileType(Buffer.alloc(4)), null);
});

test('validation rejects missing, short and out-of-range fields', () => {
  const middleware = validate({
    title: { type: 'string', required: true, min: 5, max: 20 },
    page: { type: 'integer', min: 1, default: 1 },
  });

  const missing = run(middleware, { body: {} });
  assert.ok(missing.error instanceof BadRequestError);
  assert.equal(/** @type {any} */ (missing.error).details.title, 'title is required');

  const short = run(middleware, { body: { title: 'hi' } });
  assert.match(/** @type {any} */ (short.error).details.title, /at least 5 characters/);

  const bad = run(middleware, { body: { title: 'a valid title', page: 0 } });
  assert.match(/** @type {any} */ (bad.error).details.page, /at least 1/);
});

test('validation trims, coerces and applies defaults', () => {
  const middleware = validate(
    {
      search: { type: 'string' },
      page: { type: 'integer', default: 1 },
      openOnly: { type: 'boolean', default: false },
      status: { type: 'array', values: ['Submitted', 'Closed'] },
    },
    'query',
  );

  const { error, validated } = run(middleware, {
    query: { search: '  wifi  ', openOnly: 'true', status: 'Submitted,Closed' },
  });
  assert.equal(error, null);
  assert.deepEqual(validated, {
    search: 'wifi',
    page: 1,
    openOnly: true,
    status: ['Submitted', 'Closed'],
  });
});

test('array validation rejects values outside the allowed set', () => {
  const middleware = validate({ status: { type: 'array', values: ['Submitted'] } }, 'query');
  const { error } = run(middleware, { query: { status: 'Submitted,DROP TABLE' } });
  assert.match(/** @type {any} */ (error).details.status, /unsupported values: DROP TABLE/);
});

test('unknown fields are dropped rather than passed through to the database', () => {
  const middleware = validate({ title: { type: 'string', required: true, min: 1 } });
  const { validated } = run(middleware, { body: { title: 'ok', role: 'admin', id: 999 } });
  assert.deepEqual(validated, { title: 'ok' });
});

test('id params must be positive integers', () => {
  for (const bad of ['abc', '-1', '0', '1.5', '1 OR 1=1']) {
    const { error } = run(validateIdParam('id'), { params: { id: bad } });
    assert.ok(error instanceof BadRequestError, `${bad} should be rejected`);
  }
  const { error, validated } = run(validateIdParam('id'), { params: { id: '42' } });
  assert.equal(error, null);
  assert.equal(validated.id, 42);
});
