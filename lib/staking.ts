import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { goals, stakes } from "@/lib/db/schema";

export type StakeStatus =
  | "ACTIVE"
  | "SUBMITTED"
  | "VERIFIED"
  | "COMPLETED"
  | "FORFEITED";

export type StakeRow = typeof stakes.$inferSelect;

export async function userHasHitGoal(userId: string) {
  const rows = await db.select().from(goals).where(eq(goals.userId, userId));

  return rows.some(
    (goal) =>
      goal.active &&
      goal.targetSessions > 0 &&
      goal.completedSessions >= goal.targetSessions
  );
}

export async function recordPaidStake(input: {
  userId: string;
  goalId: string;
  stripeCheckoutSessionId: string;
  amountCents: number;
  proofMethod: string;
}) {
  const [stake] = await db
    .insert(stakes)
    .values({
      userId: input.userId,
      goalId: input.goalId,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      amountCents: input.amountCents,
      proofMethod: input.proofMethod,
      status: "ACTIVE",
    })
    .onConflictDoNothing({ target: stakes.stripeCheckoutSessionId })
    .returning();

  if (stake) {
    return stake;
  }

  const [existing] = await db
    .select()
    .from(stakes)
    .where(eq(stakes.stripeCheckoutSessionId, input.stripeCheckoutSessionId))
    .limit(1);

  return existing ?? null;
}

export async function recordPaidCheckout(
  checkoutSession: Stripe.Checkout.Session
) {
  const userId = checkoutSession.metadata?.userId;
  const goalId = checkoutSession.metadata?.goalId;
  const amountCents = Number(checkoutSession.metadata?.amountCents);
  const proofMethod = checkoutSession.metadata?.proofMethod;

  if (
    checkoutSession.payment_status !== "paid" ||
    !userId ||
    !goalId ||
    !Number.isInteger(amountCents) ||
    !proofMethod
  ) {
    return null;
  }

  // Validate that the goal belongs to the current user
  // Validate that the goal belongs to the user and is active
  const [goal] = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.id, goalId),
        eq(goals.userId, userId),
        eq(goals.active, true)
      )
    )
    .limit(1);

  if (!goal) {
    return null;
  }

  // Validate that the goalId matches the metadata goalId
  if (goalId && goalId !== checkoutSession.metadata?.goalId) {
    return null;
  }

  // Validate that the amount is within allowed range ($1-$1,000 in cents)
  if (amountCents < 100 || amountCents > 100000) {
    return null;
  }

  if (proofMethod && !["video", "watch"].includes(proofMethod)) {
    return null;
  }

  return recordPaidStake({
    userId,
    goalId,
    stripeCheckoutSessionId: checkoutSession.id,
    amountCents,
    proofMethod,
  });
}

/**
 * Resolve the exact ACTIVE stake a proof should be linked to.
 * Matches on userId + proofMethod so a "watch" proof can never submit
 * a "video" stake (or vice versa). Optional stakeId/goalId narrow the
 * match when the client supplies them.
 */
export async function findActiveStakeForProof(
  userId: string,
  proofMethod: string,
  opts?: { stakeId?: string; goalId?: string }
): Promise<StakeRow | null> {
  const filters = [
    eq(stakes.userId, userId),
    eq(stakes.status, "ACTIVE"),
    eq(stakes.proofMethod, proofMethod),
  ];

  if (opts?.stakeId) {
    filters.push(eq(stakes.id, opts.stakeId));
  }

  if (opts?.goalId) {
    filters.push(eq(stakes.goalId, opts.goalId));
  }

  const [target] = await db
    .select()
    .from(stakes)
    .where(and(...filters))
    .orderBy(desc(stakes.createdAt))
    .limit(1);

  return target ?? null;
}

/**
 * Transition the exact ACTIVE stake for a proof to SUBMITTED.
 * Returns the matched stake, or null when no ACTIVE stake matches.
 */
export async function markStakeSubmitted(
  userId: string,
  proofMethod: string,
  opts?: { stakeId?: string; goalId?: string }
): Promise<StakeRow | null> {
  const target = await findActiveStakeForProof(userId, proofMethod, opts);

  if (!target) {
    return null;
  }

  const [updated] = await db
    .update(stakes)
    .set({
      status: "SUBMITTED",
      updatedAt: new Date(),
    })
    .where(and(eq(stakes.id, target.id), eq(stakes.status, "ACTIVE")))
    .returning();

  return updated ?? null;
}

/**
 * Check whether a specific goal has been completed.
 */
async function goalHasHitGoal(userId: string, goalId: string) {
  const [goal] = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.id, goalId),
        eq(goals.userId, userId)
      )
    )
    .limit(1);

  return Boolean(
    goal &&
    goal.active &&
    goal.targetSessions > 0 &&
    goal.completedSessions >= goal.targetSessions
  );
}

/**
 * Complete only the VERIFIED stake associated with the goal
 * that has actually reached its target.
 */
export async function promoteVerifiedStakesIfGoalHit(
  userId: string,
  goalId?: string | null
) {
  if (!goalId) {
    return;
  }

  if (!(await goalHasHitGoal(userId, goalId))) {
    return;
  }

  await db
    .update(stakes)
    .set({
      status: "COMPLETED",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stakes.userId, userId),
        eq(stakes.goalId, goalId),
        eq(stakes.status, "VERIFIED")
      )
    );
}

/**
 * Apply admin review to the exact stake linked to the reviewed proof.
 * Requires the stake to belong to the proof's user and be SUBMITTED;
 * returns the updated stake, or null when nothing was applied
 * (missing stakeId, wrong owner/state, or already reviewed).
 */
export async function applyProofReview(
  userId: string,
  status: "APPROVED" | "REJECTED",
  opts?: { stakeId?: string | null }
): Promise<StakeRow | null> {
  if (!opts?.stakeId) {
    return null;
  }

  const [submittedStake] = await db
    .select()
    .from(stakes)
    .where(
      and(
        eq(stakes.id, opts.stakeId),
        eq(stakes.userId, userId),
        eq(stakes.status, "SUBMITTED")
      )
    )
    .limit(1);

  if (!submittedStake) {
    return null;
  }

  if (status === "REJECTED") {
    const [updated] = await db
      .update(stakes)
      .set({
        status: "FORFEITED",
        updatedAt: new Date(),
      })
      .where(
        and(eq(stakes.id, submittedStake.id), eq(stakes.status, "SUBMITTED"))
      )
      .returning();

    return updated ?? null;
  }

  const completed =
    submittedStake.goalId
      ? await goalHasHitGoal(userId, submittedStake.goalId)
      : false;

  const [updated] = await db
    .update(stakes)
    .set({
      status: completed ? "COMPLETED" : "VERIFIED",
      updatedAt: new Date(),
    })
    .where(and(eq(stakes.id, submittedStake.id), eq(stakes.status, "SUBMITTED")))
    .returning();

  return updated ?? null;
}

export function redistributionShareCents(
  forfeitedCents: number,
  winnerCount: number
) {
  if (winnerCount <= 0 || forfeitedCents <= 0) {
    return 0;
  }

  return Math.floor(forfeitedCents / winnerCount);
}

export async function getStakingSnapshot(userId: string) {
  const rows = await db.select().from(stakes);

  const mine = rows
    .filter((row) => row.userId === userId)
    .sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

  const forfeitedCents = rows
    .filter((row) => row.status === "FORFEITED")
    .reduce((sum, row) => sum + row.amountCents, 0);

  const completed = rows.filter(
    (row) => row.status === "COMPLETED"
  );

  const verified = rows.filter(
    (row) => row.status === "VERIFIED"
  );

  const active = rows.filter(
    (row) =>
      row.status === "ACTIVE" ||
      row.status === "SUBMITTED"
  );

  const settled =
    completed.length +
    rows.filter((row) => row.status === "FORFEITED").length;

  const shareCents = redistributionShareCents(
    forfeitedCents,
    completed.length
  );

  const myStake =
    mine.find(
      (r) =>
        r.status === "ACTIVE" ||
        r.status === "SUBMITTED" ||
        r.status === "VERIFIED"
    ) ?? mine[0] ?? null;

  const myShareCents =
    myStake?.status === "COMPLETED"
      ? shareCents + myStake.amountCents
      : 0;

  const totalStakedCents = rows.reduce(
    (sum, row) => sum + row.amountCents,
    0
  );

  return {
    poolCents: totalStakedCents,
    forfeitedCents,
    completedCount: completed.length,
    verifiedCount: verified.length,
    activeCount: active.length,
    memberCount: new Set(rows.map((row) => row.userId)).size,
    hitRate:
      settled > 0
        ? Math.round((completed.length / settled) * 100)
        : 0,
    shareCents,
    myShareCents,
    myStake: myStake
      ? {
        id: myStake.id,
        amountCents: myStake.amountCents,
        goalId: myStake.goalId,
        proofMethod: myStake.proofMethod as "watch" | "video",
        status: myStake.status as StakeStatus,
        createdAt: myStake.createdAt.toISOString(),
      }
      : null,
  };
}

export async function incrementGoalProgress(
  userId: string,
  goalId?: string | null
) {
  let targetId: string | null | undefined = goalId || null;

  if (!targetId) {
    const [recentStake] = await db
      .select({ goalId: stakes.goalId })
      .from(stakes)
      .where(
        and(
          eq(stakes.userId, userId),
          inArray(stakes.status, ["ACTIVE", "SUBMITTED", "VERIFIED"])
        )
      )
      .orderBy(desc(stakes.createdAt))
      .limit(1);

    if (recentStake?.goalId) {
      const [stakeGoal] = await db
        .select({ id: goals.id })
        .from(goals)
        .where(
          and(
            eq(goals.id, recentStake.goalId),
            eq(goals.userId, userId),
            eq(goals.active, true)
          )
        )
        .limit(1);

      if (stakeGoal) {
        targetId = stakeGoal.id;
      }
    }
  }

  if (!targetId) {
    targetId =
      (
        await db
          .select({ id: goals.id })
          .from(goals)
          .where(
            and(
              eq(goals.userId, userId),
              eq(goals.active, true)
            )
          )
          .orderBy(desc(goals.createdAt))
          .limit(1)
      )[0]?.id ?? null;
  }

  if (!targetId) {
    return;
  }

  await db
    .update(goals)
    .set({
      completedSessions: sql`${goals.completedSessions} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(goals.id, targetId),
        eq(goals.userId, userId)
      )
    );

  await promoteVerifiedStakesIfGoalHit(userId, targetId);
}