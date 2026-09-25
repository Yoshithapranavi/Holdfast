import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
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
      amountCents: String(amountCents),
      proofMethod,
      kind: "holdfast_stake",
    },
    integration_identifier: `holdfast_stake_${Math.random().toString(36).slice(2, 10)}`,
  });

  return NextResponse.json({ url: checkout.url });
}
