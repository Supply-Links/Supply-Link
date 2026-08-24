/**
 * GET  /api/v1/auditors        – list all registered auditors
 * POST /api/v1/auditors        – register a new auditor (admin-only)
 *
 * Authentication: x-api-key (internal for POST, partner for GET)
 * Rate limiting: default tier
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { auditorCreateBodySchema, auditorListQuerySchema } from '@/lib/api/schemas';
import { handleValidationError, parseJsonBody, parseQuery } from '@/lib/api/validation';
import { getAuditorRepository, RepositoryUnsupportedError } from '@/lib/data';
import type { Auditor, PaginatedResponse } from '@/lib/types';

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

async function listAuditors(req: NextRequest): Promise<NextResponse> {
  const { offset, limit, active: activeOnly } = parseQuery(req, auditorListQuerySchema);

  const all = await getAuditorRepository().list({ activeOnly });
  const items = all.slice(offset, offset + limit);

  const response: PaginatedResponse<Auditor> = {
    items,
    total: all.length,
    offset,
    limit,
  };

  return withCors(req, withCorrelationId(req, NextResponse.json(response, { status: 200 })));
}

async function registerAuditor(req: NextRequest, rawBody: string): Promise<NextResponse> {
  try {
    const body = parseJsonBody(req, rawBody, auditorCreateBodySchema);

    const repo = getAuditorRepository();

    const existing = await repo.getByAddress(body.address);
    if (existing) {
      return apiError(req, 409, ErrorCode.VALIDATION_ERROR, 'Auditor already registered');
    }

    const newAuditor: Auditor = {
      address: body.address,
      name: body.name,
      active: true,
      registeredAt: Math.floor(Date.now() / 1000),
    };

    await repo.create(newAuditor);

    return withCors(req, withCorrelationId(req, NextResponse.json(newAuditor, { status: 201 })));
  } catch (error) {
    if (error instanceof RepositoryUnsupportedError) {
      return apiError(req, 503, ErrorCode.DEPENDENCY_UNAVAILABLE, error.message);
    }
    return (
      handleValidationError(req, error) ??
      apiError(req, 500, ErrorCode.INTERNAL_ERROR, 'Failed to register auditor')
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  const limited = applyRateLimit(request, 'GET /api/v1/auditors', RATE_LIMIT_PRESETS.publicRead);
  if (limited) {
    recordRequest('GET /api/v1/auditors', 429, Date.now() - start);
    return limited;
  }

  const auth = await authenticateApiRequest(request, 'partner');
  if (auth.error) {
    recordRequest('GET /api/v1/auditors', 401, Date.now() - start);
    return auth.error;
  }

  let response: NextResponse;
  try {
    response = await listAuditors(request);
  } catch (error) {
    if (error instanceof RepositoryUnsupportedError) {
      response = apiError(request, 503, ErrorCode.DEPENDENCY_UNAVAILABLE, error.message);
    } else {
      response =
        handleValidationError(request, error) ??
        apiError(request, 500, ErrorCode.INTERNAL_ERROR, 'Failed to list auditors');
    }
  }
  recordRequest('GET /api/v1/auditors', response.status, Date.now() - start);
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  const limited = applyRateLimit(request, 'POST /api/v1/auditors', RATE_LIMIT_PRESETS.default);
  if (limited) {
    recordRequest('POST /api/v1/auditors', 429, Date.now() - start);
    return limited;
  }

  // Auditor registration is admin-only
  const auth = await authenticateApiRequest(request, 'internal');
  if (auth.error) {
    recordRequest('POST /api/v1/auditors', 401, Date.now() - start);
    return auth.error;
  }

  const rawBody = await request.text();
  const response = await registerAuditor(request, rawBody);
  recordRequest('POST /api/v1/auditors', response.status, Date.now() - start);
  return response;
}
