import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { verificationProofs } from "@/lib/db/schema";
import { markStakeSubmitted } from "@/lib/staking";

const ALLOWED_DEVICES = new Set(["Apple Watch", "Garmin", "Fitbit", "WHOOP"]);

export async function POST(request: Request) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const device =
        typeof body?.device === "string" && ALLOWED_DEVICES.has(body.device)
            ? body.device
            : "Apple Watch";

    const [proof] = await db
        .insert(verificationProofs)
        .values({
            userId: session.user.id,
            pathname: `watch/${session.user.id}/${device.replace(/\s+/g, "-").toLowerCase()}-${crypto.randomUUID()}`,
            proofMethod: "watch",
            status: "SUBMITTED",
        })
        .returning();

    await markStakeSubmitted(session.user.id);

    return NextResponse.json({
        id: proof.id,
        pathname: proof.pathname,
        proofMethod: proof.proofMethod,
        status: proof.status,
    });
}

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [proof] = await db
        .select()
        .from(verificationProofs)
        .where(eq(verificationProofs.userId, session.user.id))
        .orderBy(desc(verificationProofs.createdAt))
        .limit(1);

    return NextResponse.json(proof ?? null);
}
