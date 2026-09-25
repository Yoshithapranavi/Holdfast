import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createDirectStake, getStakingSnapshot } from "@/lib/staking";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const snapshot = await getStakingSnapshot(session.user.id);
  return NextResponse.json(snapshot);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const amountDollars = Number(body?.amount);
  const proofMethod = body?.proofMethod === "video" ? "video" : "watch";

  if (!Number.isInteger(amountDollars) || amountDollars < 1 || amountDollars > 1000) {
    return NextResponse.json(
      { error: { message: "Stake amount must be between $1 and $1,000." } },
      { status: 400 }
    );
  }

  const amountCents = amountDollars * 100;
  const stake = await createDirectStake({
    userId: session.user.id,
    amountCents,
    proofMethod,
  });

  const snapshot = await getStakingSnapshot(session.user.id);
  return NextResponse.json({ stake, snapshot });
}

