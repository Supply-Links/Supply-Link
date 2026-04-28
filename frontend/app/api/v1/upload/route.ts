import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api/rateLimit';
import { requirePolicy } from '@/lib/api/policy';
import { AuditEmitter } from '@/lib/api/audit';
import { enqueue } from '@/lib/jobs/queue';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

async function handler(req: NextRequest) {
  const limited = applyRateLimit(req, 'upload', RATE_LIMIT_PRESETS.upload);
  if (limited) return limited;

  const respond = (body: unknown, init?: ResponseInit) =>
    withCors(req, withCorrelationId(req, NextResponse.json(body, init)));

  let resultStatus = 200;
  let resultBody: any;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const productId = formData.get('productId') as string | null;

    if (!file) {
      resultStatus = 400;
      resultBody = { error: ErrorCode.MISSING_FIELDS, message: 'No file provided' };
      return withCors(req, apiError(req, resultStatus, resultBody.error, resultBody.message));
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      resultStatus = 400;
      resultBody = {
        error: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF',
      };
      return withCors(req, apiError(req, resultStatus, resultBody.error, resultBody.message));
    }

    if (file.size > MAX_SIZE_BYTES) {
      resultStatus = 400;
      resultBody = {
        error: ErrorCode.VALIDATION_ERROR,
        message: 'File too large. Maximum size is 5 MB',
      };
      return withCors(req, apiError(req, resultStatus, resultBody.error, resultBody.message));
    }

    const blob = await put(`products/${Date.now()}-${file.name}`, file, {
      access: 'public',
    });

    // Offload heavy post-upload work to background jobs
    const [scanJob, processJob] = await Promise.all([
      enqueue('scan.malware', { url: blob.url, jobId: blob.url }),
      enqueue('image.process', { url: blob.url, productId }),
    ]);

    resultBody = { url: blob.url, jobs: { scan: scanJob.id, process: processJob.id } };
    resultStatus = 200;
    return respond(resultBody);
  } catch (error) {
    console.error('[upload POST]', error);
    resultStatus = 500;
    resultBody = { error: ErrorCode.INTERNAL_ERROR, message: 'Failed to upload file' };
    return withCors(req, apiError(req, resultStatus, resultBody.error, resultBody.message));
  } finally {
    // Audit log the upload operation
    AuditEmitter.emit(req, 'file.upload', resultStatus, undefined, resultBody, {
      filename: resultBody?.url ? resultBody.url.split('/').pop() : undefined,
    });
  }
}

export const POST = requirePolicy('partner', handler);

