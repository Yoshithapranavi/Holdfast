import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getStakingSnapshot } from "@/lib/staking";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const snapshot = await getStakingSnapshot(session.user.id);
  return NextResponse.json(snapshot);
}

