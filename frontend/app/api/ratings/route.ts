import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/stellar/verify";
import { kv } from "@vercel/kv";
import { withCors, handleOptions } from "@/lib/api/cors";

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
  const respond = (body: unknown, init?: ResponseInit) =>
    withCors(request, NextResponse.json(body, init));

  try {
    const data: RatingSubmission = await request.json();
    const { productId, walletAddress, stars, comment, message, signature } = data;

    if (!productId || !walletAddress || !stars || !message || !signature) {
      return respond({ error: "Missing required fields" }, { status: 400 });
    }

    if (stars < 1 || stars > 5 || !Number.isInteger(stars)) {
      return respond({ error: "Stars must be an integer between 1 and 5" }, { status: 400 });
    }

    if (comment && comment.length > 500) {
      return respond({ error: "Comment must be 500 characters or less" }, { status: 400 });
    }

    const isValid = await verifySignature(walletAddress, message, signature);
    if (!isValid) {
      return respond({ error: "Invalid signature" }, { status: 401 });
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
    console.error("Rating submission error:", error);
    return respond({ error: "Failed to submit rating" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const respond = (body: unknown, init?: ResponseInit) =>
    withCors(request, NextResponse.json(body, init));

  try {
    const productId = request.nextUrl.searchParams.get("productId");

    if (!productId) {
      return respond({ error: "Missing productId parameter" }, { status: 400 });
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
    console.error("Fetch ratings error:", error);
    return respond({ error: "Failed to fetch ratings" }, { status: 500 });
  }
}
