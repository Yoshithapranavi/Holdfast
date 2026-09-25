import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { goals } from "@/lib/db/schema";

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    const rows = await db
        .select()
        .from(goals)
        .where(and(eq(goals.userId, session.user.id), eq(goals.active, true)))
        .orderBy(desc(goals.createdAt));

    const response = rows.map((goal) => ({
        id: goal.id,
        title: goal.title,
        metric: "FREQUENCY",
        currentValue: goal.completedSessions,
        targetValue: goal.targetSessions,
        unit: "sessions",
        deadline: null,
        visibility: "PRIVATE",
        status: "ACTIVE",
        createdAt: goal.createdAt.toISOString(),
        updatedAt: goal.updatedAt.toISOString(),
        milestones: [],
    }));

    return NextResponse.json(response);
}