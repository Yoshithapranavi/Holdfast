import { put } from "@vercel/blob";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stakes, verificationProofs } from "@/lib/db/schema";
import { findActiveStakeForProof, markStakeSubmitted } from "@/lib/staking";


const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const isUuid = (val: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export async function POST(request: Request) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("video");
    const stakeIdValue = formData.get("stakeId");
    const goalIdValue = formData.get("goalId");

    const stakeId =
        typeof stakeIdValue === "string" && stakeIdValue ? stakeIdValue : undefined;
    const goalId =
        typeof goalIdValue === "string" && goalIdValue ? goalIdValue : undefined;

    if ((stakeId && !isUuid(stakeId)) || (goalId && !isUuid(goalId))) {
        return NextResponse.json({ error: "Invalid stake reference." }, { status: 400 });
    }

    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Video file is required." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Use an MP4, MOV, or WebM video." }, { status: 400 });
    }

    if (file.size > MAX_VIDEO_SIZE) {
        return NextResponse.json({ error: "Video must be 100 MB or smaller." }, { status: 400 });
    }

    // Resolve the exact ACTIVE video stake before inserting any proof
    const targetStake = await findActiveStakeForProof(session.user.id, "video", {
        stakeId,
        goalId,
    });

    if (!targetStake) {
        return NextResponse.json(
            { error: "No active video stake found to submit proof for." },
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
            { error: "A video proof is already submitted and awaiting admin review." },
            { status: 409 }
        );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    let pathname = "";

    if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
            const blob = await put(
                `verification/${session.user.id}/${crypto.randomUUID()}-${safeName}`,
                file,
                { access: "public", addRandomSuffix: false }
            );
            pathname = blob.url ?? blob.pathname;
        } catch {
            // Fall back to local if blob fails
            pathname = "";
        }
    }

    if (!pathname) {
        const fs = await import("fs/promises");
        const path = await import("path");
        const uploadDir = path.join(process.cwd(), "public", "uploads", "videos");
        await fs.mkdir(uploadDir, { recursive: true });
        const filename = `${session.user.id}-${Date.now()}-${safeName}`;
        const filePath = path.join(uploadDir, filename);
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(filePath, buffer);
        pathname = `/uploads/videos/${filename}`;
    }

    // Transition the exact ACTIVE stake before creating the proof so a
    // submit race cannot leave a SUBMITTED proof attached to a stake
    // that never left ACTIVE.
    const submitted = await markStakeSubmitted(session.user.id, "video", {
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
                pathname,
                proofMethod: "video",
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
            { error: "Unable to submit video proof. Please try again." },
            { status: 500 }
        );
    }

    return NextResponse.json({
        id: proof.id,
        pathname: proof.pathname,
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
