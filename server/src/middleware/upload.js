/**
 * Attachment upload (Multer).
 *
 * Memory storage, because the buffer is streamed straight to Cloudinary; the
 * local-disk path is a development fallback and writes the file itself. A
 * single-file, size-capped, allowlisted upload keeps the attack surface small.
 */
import multer from 'multer';
import { config } from '../config/env.js';
import { BadRequestError } from '../domain/errors.js';

export const ATTACHMENT_FIELD = 'attachment';

const storage = multer.memoryStorage();

export const uploadAttachment = multer({
  storage,
  limits: {
    fileSize: config.uploads.maxBytes,
    files: 1,
    // Bound the multipart envelope itself, not just the file.
    fields: 20,
    fieldSize: 1024 * 1024,
  },
  /**
   * First gate: the client-declared content type. It is trivially spoofable, so
   * `services/uploadService.js` independently sniffs the file's magic bytes
   * before storing it — this check only rejects the obvious cases early.
   */
  fileFilter(_req, file, callback) {
    if (!config.uploads.allowedMimeTypes.includes(file.mimetype)) {
      callback(
        new BadRequestError(
          `Attachments must be one of: ${config.uploads.allowedMimeTypes.join(', ')}`,
          { field: ATTACHMENT_FIELD, received: file.mimetype },
        ),
      );
      return;
    }
    callback(null, true);
  },
}).single(ATTACHMENT_FIELD);
