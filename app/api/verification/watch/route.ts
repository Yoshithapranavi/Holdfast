import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stakes, verificationProofs } from "@/lib/db/schema";
import { findActiveStakeForProof, markStakeSubmitted } from "@/lib/staking";

const ALLOWED_DEVICES = new Set(["Apple Watch", "Garmin", "Fitbit", "WHOOP"]);

const isUuid = (val: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

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
    const stakeId =
        typeof body?.stakeId === "string" && body.stakeId ? body.stakeId : undefined;
    const goalId =
        typeof body?.goalId === "string" && body.goalId ? body.goalId : undefined;

    if ((stakeId && !isUuid(stakeId)) || (goalId && !isUuid(goalId))) {
        return NextResponse.json({ error: "Invalid stake reference." }, { status: 400 });
    }

    // Resolve the exact ACTIVE watch stake before inserting any proof
    const targetStake = await findActiveStakeForProof(session.user.id, "watch", {
        stakeId,
        goalId,
    });

    if (!targetStake) {
        return NextResponse.json(
            { error: "No active watch stake found to submit proof for." },
            { status: 400 }
        );
    }

    const [pendingProof] = await db
        .select()
        .from(verificationProofs)
        .where(
            and(
                eq(verificationProofs.userId, session.user.id),
                eq(verificationProofs.stakeId, targetStake.id),
                eq(verificationProofs.status, "SUBMITTED")
            )
        )
        .limit(1);

    if (pendingProof) {
        return NextResponse.json(
            { error: "A watch proof is already submitted and awaiting admin review." },
            { status: 409 }
        );
    }

    // Transition the exact ACTIVE stake before creating the proof so a
    // submit race cannot leave a SUBMITTED proof attached to a stake
    // that never left ACTIVE.
    const submitted = await markStakeSubmitted(session.user.id, "watch", {
        stakeId: targetStake.id,
    });

    if (!submitted) {
        return NextResponse.json(
            { error: "The stake is no longer active." },
            { status: 409 }
        );
    }

    let proof;
    try {
        [proof] = await db
            .insert(verificationProofs)
            .values({
                userId: session.user.id,
                stakeId: targetStake.id,
                pathname: `watch/${session.user.id}/${device.replace(/\s+/g, "-").toLowerCase()}-${crypto.randomUUID()}`,
                proofMethod: "watch",
                status: "SUBMITTED",
            })
            .returning();
    } catch {
        proof = undefined;
    }

    if (!proof) {
        // The proof was not created: safely restore that exact stake to
        // ACTIVE only while it is still SUBMITTED.
        await db
            .update(stakes)
            .set({ status: "ACTIVE", updatedAt: new Date() })
            .where(
                and(
                    eq(stakes.id, targetStake.id),
                    eq(stakes.status, "SUBMITTED")
                )
            );
        return NextResponse.json(
            { error: "Unable to submit smartwatch proof. Please try again." },
            { status: 500 }
        );
    }

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
