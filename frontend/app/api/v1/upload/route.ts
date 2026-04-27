import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { withCors, handleOptions } from "@/lib/api/cors";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(req: NextRequest) {
  const respond = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return respond({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return respond(
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return respond({ error: "File too large. Maximum size is 5 MB" }, { status: 400 });
  }

  const blob = await put(`products/${Date.now()}-${file.name}`, file, {
    access: "public",
  });

  return respond({ url: blob.url });
}
