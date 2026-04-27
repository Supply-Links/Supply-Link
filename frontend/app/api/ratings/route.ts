import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '@/lib/stellar/verify';
import { kv } from '@vercel/kv';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api/rateLimit';
import { withIdempotency } from '@/lib/api/idempotency';

interface RatingSubmission {
  productId: string;
  walletAddress: string;
  stars: number;
  comment?: string;
  message: string;
  signature: string;
}

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, 'ratings', RATE_LIMIT_PRESETS.ratings);
  if (limited) return limited;

  return withIdempotency(request, async (req, rawBody) => {
    const respond = (body: unknown, init?: ResponseInit) =>
      withCors(req, withCorrelationId(req, NextResponse.json(body, init)));

    try {
      const data: RatingSubmission = JSON.parse(rawBody);
      const { productId, walletAddress, stars, comment, message, signature } = data;

      if (!productId || !walletAddress || !stars || !message || !signature) {
        return withCors(
          req,
          apiError(req, 400, ErrorCode.MISSING_FIELDS, 'Missing required fields'),
        );
      }

      if (stars < 1 || stars > 5 || !Number.isInteger(stars)) {
        return withCors(
          req,
          apiError(
            req,
            400,
            ErrorCode.VALIDATION_ERROR,
            'Stars must be an integer between 1 and 5',
          ),
        );
      }

      if (comment && comment.length > 500) {
        return withCors(
          req,
          apiError(req, 400, ErrorCode.VALIDATION_ERROR, 'Comment must be 500 characters or less'),
        );
      }

      const isValid = await verifySignature(walletAddress, message, signature);
      if (!isValid) {
        return withCors(req, apiError(req, 401, ErrorCode.INVALID_SIGNATURE, 'Invalid signature'));
      }

      const rating = {
        id: `${productId}_${walletAddress}_${Date.now()}`,
        productId,
        walletAddress,
        stars,
        comment: comment || null,
        timestamp: Date.now(),
      };

      const key = `ratings:${productId}`;
      const existing = await kv.get<any[]>(key);
      const ratings = existing || [];
      ratings.push(rating);
      await kv.set(key, ratings);

      return respond(rating, { status: 201 });
    } catch (error) {
      console.error('[ratings POST]', error);
      return withCors(req, apiError(req, 500, ErrorCode.INTERNAL_ERROR, 'Failed to submit rating'));
    }
  });
}

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, 'ratings', RATE_LIMIT_PRESETS.default);
  if (limited) return limited;

  const respond = (body: unknown, init?: ResponseInit) =>
    withCors(request, withCorrelationId(request, NextResponse.json(body, init)));

  try {
    const productId = request.nextUrl.searchParams.get('productId');

    if (!productId) {
      return withCors(
        request,
        apiError(request, 400, ErrorCode.MISSING_FIELDS, 'Missing productId parameter'),
      );
    }

    const key = `ratings:${productId}`;
    const allRatings = (await kv.get<any[]>(key)) ?? [];
    const sortedRatings = [...allRatings].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
    const avgStars =
      allRatings.length > 0
        ? (allRatings.reduce((sum, r) => sum + r.stars, 0) / allRatings.length).toFixed(1)
        : 0;

    return respond({
      productId,
      averageRating: parseFloat(avgStars as string),
      totalRatings: allRatings.length,
      recentRatings: sortedRatings,
    });
  } catch (error) {
    console.error('[ratings GET]', error);
    return withCors(
      request,
      apiError(request, 500, ErrorCode.INTERNAL_ERROR, 'Failed to fetch ratings'),
    );
  }
}
