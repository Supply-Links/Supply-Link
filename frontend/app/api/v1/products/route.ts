/**
 * GET  /api/v1/products     – list all products (paginated)
 * POST /api/v1/products     – register a new product
 *
 * Authentication: partner tier (registry-based API key)
 * Rate limiting: default preset
 * Idempotency: POST requests via Idempotency-Key header
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { getProductRepository } from '@/lib/data';
import { productCreateBodySchema, productListQuerySchema } from '@/lib/api/schemas';
import type { Product, PaginatedResponse } from '@/lib/types';
import { MOCK_PRODUCTS } from '@/lib/mock/products';

export const { GET, POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    idempotent: true,
    body: productCreateBodySchema,
    query: productListQuerySchema,
  },
  {
    GET: async (ctx) => {
      const { offset, limit } = ctx.query;
      const page = await getProductRepository().list({ offset, limit });

      const response: PaginatedResponse<Product> = {
        items: page.items,
        total: page.total,
        offset,
        limit,
      };

      return NextResponse.json(response, { status: 200 });
    },
    POST: async (ctx) => {
      // Create new product
      const newProduct: Product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: ctx.body.name,
        origin: ctx.body.origin,
        owner: ctx.body.owner,
        timestamp: Date.now(),
        active: true,
        authorizedActors: ctx.body.authorizedActors,
        requiredSignatures: ctx.body.requiredSignatures,
        imageUrl: ctx.body.imageUrl,
        ownershipHistory: [
          {
            owner: ctx.body.owner,
            transferredAt: Date.now(),
          },
        ],
      };

      // TODO: Persist to database instead of mock
      MOCK_PRODUCTS.push(newProduct);

      // Notify webhooks of the new product registration
      try {
        const { notifyWebhooksOfProductEvent } = await import('@/lib/webhooks/processor');
        await notifyWebhooksOfProductEvent('product_registered', newProduct.id, {
          product: newProduct,
        });
      } catch (err) {
        console.error('Failed to notify webhooks of product registration:', err);
        // Don't fail the request if webhook notification fails
      }

      return NextResponse.json(newProduct, { status: 201 });
    },
  },
);
