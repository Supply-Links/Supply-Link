import { NextRequest, NextResponse } from 'next/server';

export const subscriptions = new Set<PushSubscription>();

export async function POST(req: NextRequest) {
  const subscription = (await req.json()) as PushSubscription;
  subscriptions.add(subscription);
  return NextResponse.json({ ok: true }, { status: 201 });
}
