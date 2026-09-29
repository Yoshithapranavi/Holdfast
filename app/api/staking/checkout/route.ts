import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

const MIN_STAKE_CENTS = 100;
const MAX_STAKE_CENTS = 100_000;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json(
      { error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const amountDollars = Number(body?.amount);
  const proofMethod = body?.proofMethod === "watch" ? "watch" : "video";
  const goalId = typeof body?.goalId === "string" ? body.goalId : "";

  if (
    !Number.isInteger(amountDollars) ||
    amountDollars < 1 ||
    amountDollars > 1000
  ) {
    return NextResponse.json(
      {
        error: {
          message:
            "Stake amount must be a whole dollar amount from $1 to $1,000.",
        },
      },
      { status: 400 }
    );
  }

  const amountCents = amountDollars * 100;

  if (amountCents < MIN_STAKE_CENTS || amountCents > MAX_STAKE_CENTS) {
    return NextResponse.json(
      { error: { message: "Stake amount is outside the permitted range." } },
      { status: 400 }
    );
  }

  if (
    !goalId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      goalId
    )
  ) {
    return NextResponse.json(
      { error: { message: "A valid goal is required." } },
      { status: 400 }
    );
  }

  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(
      and(
        eq(goals.id, goalId),
        eq(goals.userId, session.user.id),
        eq(goals.active, true)
      )
    )
    .limit(1);

  if (!goal) {
    return NextResponse.json(
      { error: { message: "Goal not found or is no longer active." } },
      { status: 404 }
    );
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const checkout = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Holdfast ${proofMethod === "watch" ? "smartwatch" : "video"} stake`,
            description: "Refundable commitment stake for a verified goal.",
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/dashboard?staking=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard?staking=cancelled`,
    client_reference_id: session.user.id,
    metadata: {
      userId: session.user.id,
      goalId,
      amountCents: String(amountCents),
      proofMethod,
      kind: "holdfast_stake",
    },
  });

  return NextResponse.json({ url: checkout.url });
}
