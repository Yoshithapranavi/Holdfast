import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { goals, stakes } from "@/lib/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/goals/:id/cancel -> soft-cancel (active = false).
// Keeps the goal row so stakes.goalId / workout_sessions.goalId history
// stays intact. Blocked while an open stake references the goal.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const params = await context.params;
  const goalId = typeof params?.id === "string" ? params.id : "";

  if (!goalId || !UUID_RE.test(goalId)) {
    return NextResponse.json({ error: { message: "Invalid goal id." } }, { status: 400 });
  }

  const [goal] = await db
    .select({ id: goals.id, active: goals.active })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, session.user.id)))
    .limit(1);

  if (!goal) {
    return NextResponse.json({ error: { message: "Goal not found." } }, { status: 404 });
  }

  if (!goal.active) {
    return NextResponse.json(
      { error: { message: "Goal is already cancelled." } },
      { status: 409 },
    );
  }

  const [openStake] = await db
    .select({ id: stakes.id })
    .from(stakes)
    .where(
      and(
        eq(stakes.goalId, goalId),
        inArray(stakes.status, ["ACTIVE", "SUBMITTED", "VERIFIED"]),
      ),
    )
    .limit(1);

  if (openStake) {
    return NextResponse.json(
      {
        error: {
          message:
            "This goal has an active stake and cannot be cancelled while funds are at risk.",
        },
      },
      { status: 409 },
    );
  }

  const [cancelled] = await db
    .update(goals)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(goals.id, goalId),
        eq(goals.userId, session.user.id),
        eq(goals.active, true),
      ),
    )
    .returning({ id: goals.id });

  if (!cancelled) {
    return NextResponse.json(
      { error: { message: "Goal is already cancelled." } },
      { status: 409 },
    );
  }

  return NextResponse.json({ id: cancelled.id, active: false });
}
