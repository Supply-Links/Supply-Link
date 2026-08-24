/**
 * GET  /api/v1/gas-estimate?operation=<op>[&productId=<id>][&batchSize=<n>]
 * POST /api/v1/gas-estimate
 *
 * Returns CPU-instruction and XLM fee estimates for common contract operations.
 *
 * Supported operations:
 *   register_product      — single product registration
 *   add_tracking_event    — single event (O(1) keyed storage)
 *   batch_register        — register_products_batch (scales linearly, max 50)
 *   batch_add_events      — batch_add_tracking_events (scales linearly, max 20)
 *   get_events_page       — get_tracking_events_page (10 entries)
 *   transfer_ownership    — ownership transfer
 *
 * Accuracy: estimates are within ~5% of measured profiling suite values.
 * All CPU figures are Soroban CPU instruction counts from profiling.rs.
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { fetchBaseFee, stroopsToXlm } from '@/lib/stellar/fees';
import { gasEstimateQuerySchema } from '@/lib/api/schemas';

export const runtime = 'nodejs';

// ── CPU instruction baselines from profiling.rs ──────────────────────────────
// Values are measured medians; multiply by batchSize for batch operations.

const CPU_BASELINES: Record<string, number> = {
  register_product: 1_200_000,
  add_tracking_event: 1_800_000, // O(1) with keyed storage
  get_events_page: 1_200_000, // 10-entry page
  transfer_ownership: 900_000,
};

// Soroban resource-fee multiplier: CPU instructions → stroops (approximate).
// 1M CPU instructions ≈ 0.001 XLM on testnet (subject to network fee schedule).
const CPU_TO_STROOP_RATIO = 0.001 / 1_000_000;

export type Operation =
  | 'register_product'
  | 'add_tracking_event'
  | 'batch_register'
  | 'batch_add_events'
  | 'get_events_page'
  | 'transfer_ownership';

export interface GasEstimate {
  operation: Operation;
  batchSize: number;
  cpuInstructions: number;
  /** Soroban resource fee estimate in stroops. */
  resourceFeeStroops: number;
  resourceFeeXlm: string;
  /** Inclusion fee on top of the resource fee (from current network). */
  inclusionFeeStroops: number;
  inclusionFeeXlm: string;
  totalFeeStroops: number;
  totalFeeXlm: string;
  /** Estimated accuracy band — profiling suite measures within ±5% of real execution. */
  accuracyBand: string;
  note: string;
}

function buildEstimate(operation: Operation, batchSize: number, inclusionFee: number): GasEstimate {
  let baseCpu: number;
  let note: string;

  switch (operation) {
    case 'register_product':
      baseCpu = CPU_BASELINES.register_product;
      note = 'O(1): 2 storage writes + 1 counter RMW';
      break;
    case 'add_tracking_event':
      baseCpu = CPU_BASELINES.add_tracking_event;
      note = 'O(1): per-event keyed storage; cost is constant regardless of event history';
      break;
    case 'batch_register':
      baseCpu = CPU_BASELINES.register_product * batchSize;
      note = `O(n): ${batchSize} product registrations; scales linearly (max 50)`;
      break;
    case 'batch_add_events':
      baseCpu = CPU_BASELINES.add_tracking_event * batchSize;
      note = `O(n): ${batchSize} event writes; each is O(1) so total scales linearly (max 20)`;
      break;
    case 'get_events_page':
      baseCpu = CPU_BASELINES.get_events_page;
      note = 'O(page_size): reads 10 EventEntry keys; independent of total event count';
      break;
    case 'transfer_ownership':
      baseCpu = CPU_BASELINES.transfer_ownership;
      note = 'O(1): 1 read + 1 write';
      break;
  }

  const resourceFeeStroops = Math.ceil(baseCpu * CPU_TO_STROOP_RATIO * 1_000_000);
  const totalFeeStroops = resourceFeeStroops + inclusionFee;

  return {
    operation,
    batchSize,
    cpuInstructions: baseCpu,
    resourceFeeStroops,
    resourceFeeXlm: stroopsToXlm(resourceFeeStroops),
    inclusionFeeStroops: inclusionFee,
    inclusionFeeXlm: stroopsToXlm(inclusionFee),
    totalFeeStroops,
    totalFeeXlm: stroopsToXlm(totalFeeStroops),
    accuracyBand: '±5%',
    note,
  };
}

export const { GET, POST, OPTIONS } = defineRoute(
  {
    auth: 'public',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: gasEstimateQuerySchema,
    query: gasEstimateQuerySchema,
  },
  {
    GET: async (ctx) => {
      const { operation, batchSize } = ctx.query;
      const inclusionFee = await fetchBaseFee();
      const estimate = buildEstimate(operation as Operation, batchSize, inclusionFee);
      return NextResponse.json(estimate, { status: 200 });
    },
    POST: async (ctx) => {
      const { operation, batchSize } = ctx.body;
      const inclusionFee = await fetchBaseFee();
      const estimate = buildEstimate(operation as Operation, batchSize, inclusionFee);
      return NextResponse.json(estimate, { status: 200 });
    },
  },
);
