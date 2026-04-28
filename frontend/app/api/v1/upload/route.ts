/**
 * Hardened file upload route.
 *
 * Hardening layers (closes #305):
 *  1. MIME type allowlist (unchanged)
 *  2. File size limit (unchanged)
 *  3. Magic-byte content verification (new)
 *  4. Safe filename / path normalization (new)
 *  5. Per-actor upload quota (new)
 *  6. Rejection audit log (new)
 *  7. Async malware scan + image processing via job queue (pre-existing, wired correctly)
 */

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';
import { applyRateLimit, RATE_LIMIT_PRESETS, getClientIp } from '@/lib/api/rateLimit';
import { uploadFieldsSchema } from '@/lib/api/schemas';
import { handleValidationError, parseMultipartForm } from '@/lib/api/validation';
import {
  verifyMagicBytes,
  safePath,
  checkAndIncrementQuota,
  logUploadRejection,
} from '@/lib/api/uploadHardening';
import { enqueue } from '@/lib/jobs/queue';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, 'upload', RATE_LIMIT_PRESETS.upload);
  if (limited) return limited;

  const respond = (body: unknown, init?: ResponseInit) =>
    withCors(req, withCorrelationId(req, NextResponse.json(body, init)));

  const actorId = getClientIp(req);

  try {
    const { formData, fields } = await parseMultipartForm(req, uploadFieldsSchema);
    const file = formData.get('file');
    const productId = fields.productId ?? '';

    if (!(file instanceof File)) {
      return withCors(req, apiError(req, 400, ErrorCode.VALIDATION_ERROR, 'Request validation failed', {
        details: [
          {
            field: 'file',
            location: 'body',
            message: 'file is required',
            code: 'custom',
          },
        ],
      }));
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      await logUploadRejection({ ts: Date.now(), actorId, filename: file.name, reason: 'invalid_mime' });
      return withCors(
        req,
        apiError(req, 400, ErrorCode.VALIDATION_ERROR, 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF'),
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      await logUploadRejection({ ts: Date.now(), actorId, filename: file.name, reason: 'too_large' });
      return withCors(
        req,
        apiError(req, 400, ErrorCode.VALIDATION_ERROR, 'File too large. Maximum size is 5 MB'),
      );
    }

    const headerBytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (!verifyMagicBytes(headerBytes, file.type)) {
      await logUploadRejection({ ts: Date.now(), actorId, filename: file.name, reason: 'magic_mismatch' });
      return withCors(
        req,
        apiError(req, 400, ErrorCode.VALIDATION_ERROR, 'File content does not match declared type'),
      );
    }

    const quota = await checkAndIncrementQuota(actorId);
    if (!quota.allowed) {
      await logUploadRejection({ ts: Date.now(), actorId, filename: file.name, reason: 'quota_exceeded' });
      return withCors(
        req,
        apiError(req, 429, ErrorCode.RATE_LIMITED, 'Upload quota exceeded. Try again later.'),
      );
    }

    const storagePath = safePath(actorId, file.name);
    const blob = await put(storagePath, file, { access: 'public' });

    const [scanJob, processJob] = await Promise.all([
      enqueue('scan.malware', { url: blob.url }),
      enqueue('image.process', { url: blob.url, productId }),
    ]);

    return respond(
      { url: blob.url, jobs: { scan: scanJob.id, process: processJob.id } },
      { status: 201 },
    );
  } catch (error) {
    const validation = handleValidationError(req, error);
    if (validation) {
      const reason = validation.status === 415 ? 'unsupported_content_type' : 'malformed_multipart';
      await logUploadRejection({ ts: Date.now(), actorId, filename: '', reason });
      return withCors(req, validation);
    }

    console.error('[upload POST]', error);
    return withCors(req, apiError(req, 500, ErrorCode.INTERNAL_ERROR, 'Failed to upload file'));
  }
}
