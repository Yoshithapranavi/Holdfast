import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dailyCommitments } from "@/lib/db/schema";

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    const rows = await db
        .select()
        .from(dailyCommitments)
        .where(eq(dailyCommitments.userId, session.user.id))
        .orderBy(desc(dailyCommitments.commitmentDate));

    return NextResponse.json(rows);
}

export async function POST(request: Request) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const status = body?.status === "INJURED" ? "INJURED" : body?.status === "MOVED" ? "MOVED" : "PENDING";
    const commitmentDate = new Date(body?.commitmentDate ?? Date.now());

    if (Number.isNaN(commitmentDate.getTime())) {
        return NextResponse.json({ error: { message: "Invalid commitment date." } }, { status: 400 });
    }

    const [commitment] = await db
        .insert(dailyCommitments)
        .values({
            userId: session.user.id,
            commitmentDate,
            status,
        })
        .returning();

    return NextResponse.json(commitment, { status: 201 });
}