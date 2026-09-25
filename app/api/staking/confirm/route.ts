import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { recordPaidCheckout } from "@/lib/staking";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";

  if (!sessionId) {
    return NextResponse.json(
      { error: { message: "Checkout session is required." } },
      { status: 400 }
    );
  }

  const checkout = await getStripe().checkout.sessions.retrieve(sessionId);

  if (checkout.metadata?.userId !== session.user.id) {
    return NextResponse.json({ error: { message: "Forbidden" } }, { status: 403 });
  }

  const stake = await recordPaidCheckout(checkout);

  if (!stake) {
    return NextResponse.json(
      { error: { message: "Payment is not complete yet." } },
      { status: 409 }
    );
  }

  return NextResponse.json({
    id: stake.id,
    amountCents: stake.amountCents,
    proofMethod: stake.proofMethod,
    status: stake.status,
  });
}
