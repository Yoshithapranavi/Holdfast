import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { goals } from "@/lib/db/schema";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const targetSessions = Number(body?.targetSessions ?? 1);

  if (!title || title.length > 160) {
    return NextResponse.json({ error: { message: "A valid goal title is required." } }, { status: 400 });
  }

  if (!Number.isInteger(targetSessions) || targetSessions < 1 || targetSessions > 365) {
    return NextResponse.json({ error: { message: "Target sessions must be between 1 and 365." } }, { status: 400 });
  }

  const [goal] = await db.insert(goals).values({
    userId: session.user.id,
    title,
    targetSessions,
  }).returning();

  return NextResponse.json({
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
  }, { status: 201 });
}
