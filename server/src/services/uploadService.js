/**
 * Attachment storage.
 *
 * Cloudinary when configured, local disk otherwise, behind one function so the
 * controller never branches on deployment topology.
 *
 * Every upload is checked against its magic bytes before it is stored. A
 * grievance system accepts files from unauthenticated-adjacent users; trusting
 * the browser-supplied `Content-Type` would let a caller store an executable or
 * an SVG (a script-execution vector) with a `image/png` label.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { BadRequestError, ServiceUnavailableError } from '../domain/errors.js';

let cloudinaryConfigured = false;

/**
 * True on platforms whose filesystem does not survive the request (Vercel,
 * Lambda, Cloud Run and friends all set one of these).
 * @returns {boolean}
 */
export function isEphemeralFilesystem() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.K_SERVICE);
}

/** @returns {boolean} */
export function isCloudinaryEnabled() {
  return Boolean(
    config.uploads.cloudinaryCloudName &&
      config.uploads.cloudinaryApiKey &&
      config.uploads.cloudinaryApiSecret,
  );
}

function ensureCloudinary() {
  if (cloudinaryConfigured) return;
  cloudinary.config({
    cloud_name: config.uploads.cloudinaryCloudName,
    api_key: config.uploads.cloudinaryApiKey,
    api_secret: config.uploads.cloudinaryApiSecret,
    secure: true,
  });
  cloudinaryConfigured = true;
}

/**
 * Magic-byte signatures for the formats we accept.
 * @type {ReadonlyArray<{ mime: string, ext: string, test: (b: Buffer) => boolean }>}
 */
const SIGNATURES = Object.freeze([
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mime: 'image/gif', ext: 'gif', test: (b) => b.subarray(0, 3).toString('latin1') === 'GIF' },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
]);

/**
 * @param {Buffer} buffer
 * @returns {{ mime: string, ext: string } | null}
 */
export function sniffFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const match = SIGNATURES.find((signature) => signature.test(buffer));
  return match ? { mime: match.mime, ext: match.ext } : null;
}

/**
 * Validates and stores one attachment.
 *
 * @param {Express.Multer.File} file
 * @returns {Promise<{ url: string, provider: 'cloudinary' | 'local', bytes: number }>}
 */
export async function storeAttachment(file) {
  if (!file?.buffer?.length) throw new BadRequestError('The uploaded file is empty');

  const sniffed = sniffFileType(file.buffer);
  if (!sniffed) {
    throw new BadRequestError(
      'That file type is not supported. Attach a JPEG, PNG, WebP, GIF or PDF.',
      { field: 'attachment' },
    );
  }
  if (!config.uploads.allowedMimeTypes.includes(sniffed.mime)) {
    throw new BadRequestError(`Attachments of type ${sniffed.mime} are not permitted`, {
      field: 'attachment',
    });
  }
  // The declared type disagreeing with the real one is a red flag worth logging
  // even though we proceed on the sniffed (authoritative) type.
  if (sniffed.mime !== file.mimetype) {
    logger.warn('Upload content type did not match its signature', {
      declared: file.mimetype,
      detected: sniffed.mime,
    });
  }

  if (isCloudinaryEnabled()) {
    const url = await uploadToCloudinary(file.buffer, sniffed.mime);
    return { url, provider: 'cloudinary', bytes: file.buffer.length };
  }

  // On a serverless platform the only writable path is /tmp, and it is discarded
  // when the instance is recycled — a complaint would end up pointing at an
  // attachment that no longer exists. Refuse rather than lose the evidence.
  if (isEphemeralFilesystem()) {
    throw new ServiceUnavailableError(
      'Attachment storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
    );
  }

  const url = await writeToDisk(file.buffer, sniffed.ext);
  return { url, provider: 'local', bytes: file.buffer.length };
}

/**
 * @param {Buffer} buffer
 * @param {string} mime
 * @returns {Promise<string>}
 */
function uploadToCloudinary(buffer, mime) {
  ensureCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: config.uploads.cloudinaryFolder,
        // PDFs are not images; "auto" lets Cloudinary pick the right pipeline.
        resource_type: mime === 'application/pdf' ? 'auto' : 'image',
        // Evidence must not be silently re-encoded or resized.
        transformation: undefined,
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result?.secure_url) {
          logger.error('Cloudinary upload failed', { error });
          reject(new ServiceUnavailableError('Could not store the attachment; please retry'));
          return;
        }
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

/**
 * @param {Buffer} buffer
 * @param {string} ext
 * @returns {Promise<string>} a path served by the static middleware.
 */
async function writeToDisk(buffer, ext) {
  const directory = path.resolve(process.cwd(), config.uploads.localDir);
  await mkdir(directory, { recursive: true });
  // A random name: the original filename is attacker-controlled and would open
  // the door to traversal and overwrite games.
  const filename = `${randomUUID()}.${ext}`;
  await writeFile(path.join(directory, filename), buffer);
  return `/uploads/${filename}`;
}
