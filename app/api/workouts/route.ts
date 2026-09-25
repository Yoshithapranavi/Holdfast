import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workoutSessions } from "@/lib/db/schema";
import { incrementGoalProgress } from "@/lib/staking";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, session.user.id))
    .orderBy(desc(workoutSessions.occurredAt));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const type = typeof body?.type === "string" ? body.type.trim() : "";
  const durationMinutes = Number(body?.durationMinutes);

  if (!type || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
    return NextResponse.json({ error: { message: "Workout type and a valid duration are required." } }, { status: 400 });
  }

  const isUuid = (val: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  const targetGoalId =
    typeof body?.goalId === "string" && isUuid(body.goalId) ? body.goalId : null;

  const [workout] = await db.insert(workoutSessions).values({
    userId: session.user.id,
    goalId: targetGoalId,
    type,
    durationMinutes,
    distanceKm: body?.distanceKm == null || body.distanceKm === "" ? null : Number(body.distanceKm),
    effort: typeof body?.effort === "string" ? body.effort : null,
    notes: typeof body?.notes === "string" ? body.notes.trim() : null,
  }).returning();

  await incrementGoalProgress(session.user.id, targetGoalId);

  return NextResponse.json(workout, { status: 201 });
}
