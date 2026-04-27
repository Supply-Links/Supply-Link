import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api/rateLimit';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, 'upload', RATE_LIMIT_PRESETS.upload);
  if (limited) return limited;

  const respond = (body: unknown, init?: ResponseInit) =>
    withCors(req, withCorrelationId(req, NextResponse.json(body, init)));

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return withCors(req, apiError(req, 400, ErrorCode.MISSING_FIELDS, 'No file provided'));
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return withCors(
      req,
      apiError(
        req,
        400,
        ErrorCode.VALIDATION_ERROR,
        'Invalid file type. Allowed: JPEG, PNG, WebP, GIF',
      ),
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return withCors(
      req,
      apiError(req, 400, ErrorCode.VALIDATION_ERROR, 'File too large. Maximum size is 5 MB'),
    );
  }

  const blob = await put(`products/${Date.now()}-${file.name}`, file, {
    access: 'public',
  });

  // Offload heavy post-upload work to background jobs
  const [scanJob, processJob] = await Promise.all([
    enqueue("scan.malware", { url: blob.url, jobId: blob.url }),
    enqueue("image.process", { url: blob.url, productId }),
  ]);

  return respond({ url: blob.url, jobs: { scan: scanJob.id, process: processJob.id } });
}
