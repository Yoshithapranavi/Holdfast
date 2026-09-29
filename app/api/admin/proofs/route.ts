import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { verificationProofs } from "@/lib/db/schema";
import { applyProofReview, getStakingSnapshot } from "@/lib/staking";

async function requireAdmin() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        return null;
    }
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

    // Grant admin only if ADMIN_EMAILS is defined and user email is listed
    if (adminEmails.length > 0 && adminEmails.includes(session.user.email.toLowerCase())) {
        return session;
    }

    return null;
}

export async function GET() {
    const session = await requireAdmin();
    if (!session) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const proofs = await db
        .select()
        .from(verificationProofs)
        .where(eq(verificationProofs.status, "SUBMITTED"))
        .orderBy(desc(verificationProofs.createdAt));

    const snapshot = await getStakingSnapshot(session.user.id);

    return NextResponse.json({ proofs, snapshot });
}

export async function PATCH(request: Request) {
    if (!(await requireAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const proofId = typeof body?.proofId === "string" ? body.proofId : "";
    const status =
        body?.status === "APPROVED"
            ? "APPROVED"
            : body?.status === "REJECTED"
                ? "REJECTED"
                : "";

    if (!proofId || !status) {
        return NextResponse.json({ error: "Invalid proof update" }, { status: 400 });
    }

    const [proof] = await db
        .update(verificationProofs)
        .set({ status, updatedAt: new Date() })
        .where(
            and(
                eq(verificationProofs.id, proofId),
                eq(verificationProofs.status, "SUBMITTED")
            )
        )
        .returning();

    if (!proof) {
        return NextResponse.json({ error: "Proof not found or already reviewed" }, { status: 409 });
    }

    // Apply the review only to the exact stake linked to this proof.
    // Legacy proofs without a stakeId are left untouched (no guessing).
    if (proof.stakeId) {
        const updatedStake = await applyProofReview(proof.userId, status, { stakeId: proof.stakeId });
        if (!updatedStake) {
            return NextResponse.json({ error: "Stake is no longer available for review." }, { status: 409 });
        }
    }

    return NextResponse.json(proof);
}
