/**
 * GET  /api/v1/products/[id]/delegations  – list active delegations
 * POST /api/v1/products/[id]/delegations  – create a delegation
 *
 * Authentication: x-api-key (partner or internal)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { getProductRepository } from '@/lib/data';
import { recordApprovalEvent } from '@/lib/api/approvalLog';
import { delegationStore } from '@/lib/services/delegationStore';
import { delegationCreateBodySchema } from '@/lib/api/schemas';
import type { Delegation } from '@/lib/types';

export const { GET, POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    params: z.object({ id: z.string() }),
    body: delegationCreateBodySchema,
  },
  {
    GET: async (ctx) => {
      const { id } = ctx.params;

      if (!(await getProductRepository().getById(id))) {
        return apiError(ctx.req, 404, ErrorCode.VALIDATION_ERROR, `Product not found: ${id}`);
      }

      const now = Math.floor(Date.now() / 1000);
      const active = delegationStore.list(id).filter((d) => !d.revoked && d.expiresAt > now);
      return NextResponse.json(active, { status: 200 });
    },
    POST: async (ctx) => {
      const { id } = ctx.params;

      if (!(await getProductRepository().getById(id))) {
        return apiError(ctx.req, 404, ErrorCode.VALIDATION_ERROR, `Product not found: ${id}`);
      }

      if (ctx.body.expiresAt <= Math.floor(Date.now() / 1000)) {
        return apiError(
          ctx.req,
          400,
          ErrorCode.VALIDATION_ERROR,
          'expiresAt must be a future timestamp',
        );
      }

      const delegation: Delegation = {
        delegationId: Date.now(),
        productId: id,
        delegator: ctx.apiKey ?? 'unknown',
        delegatee: ctx.body.delegatee,
        expiresAt: ctx.body.expiresAt,
        revoked: false,
        createdAt: Math.floor(Date.now() / 1000),
      };

      delegationStore.add(delegation);

      recordApprovalEvent({
        action: 'delegate_actor_authority',
        productId: id,
        actor: delegation.delegator,
        target: delegation.delegatee,
        success: true,
      });

      return NextResponse.json(delegation, { status: 201 });
    },
  },
);
