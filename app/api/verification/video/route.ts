import { put } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { verificationProofs } from "@/lib/db/schema";


const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export async function POST(request: Request) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("video");

    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Video file is required." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Use an MP4, MOV, or WebM video." }, { status: 400 });
    }

    if (file.size > MAX_VIDEO_SIZE) {
        return NextResponse.json({ error: "Video must be 100 MB or smaller." }, { status: 400 });
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
            pathname = blob.pathname;
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

    const [proof] = await db
        .insert(verificationProofs)
        .values({
            userId: session.user.id,
            pathname,
            proofMethod: "video",
            status: "SUBMITTED",
        })
        .returning();

    // Mark user's active stake as submitted
    const { markStakeSubmitted } = await import("@/lib/staking");
    await markStakeSubmitted(session.user.id);

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
