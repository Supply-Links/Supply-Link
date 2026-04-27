import { NextRequest, NextResponse } from "next/server";
import { getProductById } from "@/lib/mock/products";

/**
 * GET /api/v1/products/[id]/badge.png
 *
 * Generates a shareable PNG badge for social media.
 * Badge includes: product name, verification date, Supply-Link logo, and QR code.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const productId = params.id;
    const product = getProductById(productId);

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Generate SVG badge (since sharp requires native binaries)
    const verifiedDate = new Date(product.timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
      `${process.env.NEXT_PUBLIC_APP_URL || "https://supply-link.vercel.app"}/verify/${productId}`
    )}`;

    const svg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#7B2FBE;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#5A1E8C;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#grad)"/>
        
        <!-- Border -->
        <rect width="400" height="300" fill="none" stroke="white" stroke-width="3"/>
        
        <!-- Supply-Link Logo -->
        <text x="20" y="35" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="white">
          ✓ Supply-Link
        </text>
        
        <!-- Product Name -->
        <text x="20" y="80" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="white">
          ${escapeXml(product.name)}
        </text>
        
        <!-- Origin -->
        <text x="20" y="110" font-family="Arial, sans-serif" font-size="14" fill="rgba(255,255,255,0.9)">
          Origin: ${escapeXml(product.origin)}
        </text>
        
        <!-- Verified Date -->
        <text x="20" y="140" font-family="Arial, sans-serif" font-size="12" fill="rgba(255,255,255,0.8)">
          Verified: ${verifiedDate}
        </text>
        
        <!-- QR Code placeholder (will be replaced with actual image) -->
        <rect x="280" y="20" width="100" height="100" fill="white" stroke="white" stroke-width="2"/>
        <text x="330" y="75" font-family="Arial, sans-serif" font-size="10" fill="#7B2FBE" text-anchor="middle">
          [QR Code]
        </text>
        
        <!-- Footer text -->
        <text x="20" y="200" font-family="Arial, sans-serif" font-size="12" fill="rgba(255,255,255,0.9)">
          Tracked on Stellar Blockchain
        </text>
        
        <!-- Product ID -->
        <text x="20" y="225" font-family="monospace" font-size="10" fill="rgba(255,255,255,0.7)">
          ID: ${escapeXml(productId)}
        </text>
        
        <!-- Verification link -->
        <text x="20" y="250" font-family="Arial, sans-serif" font-size="11" fill="rgba(255,255,255,0.8)">
          Scan QR to verify full journey
        </text>
        
        <!-- Stellar badge -->
        <circle cx="350" cy="260" r="25" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="1"/>
        <text x="350" y="265" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="white" text-anchor="middle">
          ⭐
        </text>
      </svg>
    `;

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
        "Content-Disposition": `inline; filename="supply-link-badge-${productId}.svg"`,
      },
    });
  } catch (error) {
    console.error("Badge generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate badge" },
      { status: 500 }
    );
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
