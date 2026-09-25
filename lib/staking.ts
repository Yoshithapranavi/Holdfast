import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
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
  stripeCheckoutSessionId: string;
  amountCents: number;
  proofMethod: string;
}) {
  const [stake] = await db
    .insert(stakes)
    .values({
      userId: input.userId,
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

export async function createDirectStake(input: {
  userId: string;
  amountCents: number;
  proofMethod: string;
}) {
  const syntheticSessionId = `direct_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const [stake] = await db
    .insert(stakes)
    .values({
      userId: input.userId,
      stripeCheckoutSessionId: syntheticSessionId,
      amountCents: input.amountCents,
      proofMethod: input.proofMethod,
      status: "ACTIVE",
    })
    .returning();
  return stake;
}

export async function recordPaidCheckout(checkoutSession: Stripe.Checkout.Session) {
  const userId = checkoutSession.metadata?.userId;
  const amountCents = Number(checkoutSession.metadata?.amountCents);
  const proofMethod = checkoutSession.metadata?.proofMethod;

  if (
    checkoutSession.payment_status !== "paid" ||
    !userId ||
    !Number.isInteger(amountCents) ||
    !proofMethod
  ) {
    return null;
  }

  return recordPaidStake({
    userId,
    stripeCheckoutSessionId: checkoutSession.id,
    amountCents,
    proofMethod,
  });
}

export async function markStakeSubmitted(userId: string) {
  await db
    .update(stakes)
    .set({ status: "SUBMITTED", updatedAt: new Date() })
    .where(and(eq(stakes.userId, userId), inArray(stakes.status, ["ACTIVE"])));
}

export async function promoteVerifiedStakesIfGoalHit(userId: string) {
  if (!(await userHasHitGoal(userId))) {
    return;
  }

  await db
    .update(stakes)
    .set({ status: "COMPLETED", updatedAt: new Date() })
    .where(and(eq(stakes.userId, userId), eq(stakes.status, "VERIFIED")));
}

export async function applyProofReview(
  userId: string,
  status: "APPROVED" | "REJECTED"
) {
  if (status === "REJECTED") {
    await db
      .update(stakes)
      .set({ status: "FORFEITED", updatedAt: new Date() })
      .where(
        and(
          eq(stakes.userId, userId),
          inArray(stakes.status, ["ACTIVE", "SUBMITTED", "VERIFIED"])
        )
      );
    return;
  }

  const completed = await userHasHitGoal(userId);

  await db
    .update(stakes)
    .set({
      status: completed ? "COMPLETED" : "VERIFIED",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stakes.userId, userId),
        inArray(stakes.status, ["ACTIVE", "SUBMITTED"])
      )
    );
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
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const forfeitedCents = rows
    .filter((row) => row.status === "FORFEITED")
    .reduce((sum, row) => sum + row.amountCents, 0);
  const completed = rows.filter((row) => row.status === "COMPLETED");
  const verified = rows.filter((row) => row.status === "VERIFIED");
  const active = rows.filter(
    (row) => row.status === "ACTIVE" || row.status === "SUBMITTED"
  );
  const settled = completed.length + rows.filter((row) => row.status === "FORFEITED").length;
  const shareCents = redistributionShareCents(forfeitedCents, completed.length);
  const myStake = mine[0] ?? null;
  const myShareCents =
    myStake?.status === "COMPLETED" ? shareCents + myStake.amountCents : 0;
  const totalStakedCents = rows.reduce((sum, row) => sum + row.amountCents, 0);

  return {
    poolCents: totalStakedCents,
    forfeitedCents,
    completedCount: completed.length,
    verifiedCount: verified.length,
    activeCount: active.length,
    memberCount: new Set(rows.map((row) => row.userId)).size,
    hitRate: settled > 0 ? Math.round((completed.length / settled) * 100) : 0,
    shareCents,
    myShareCents,
    myStake: myStake
      ? {
          id: myStake.id,
          amountCents: myStake.amountCents,
          proofMethod: myStake.proofMethod as "watch" | "video",
          status: myStake.status as StakeStatus,
          createdAt: myStake.createdAt.toISOString(),
        }
      : null,
  };
}

export async function incrementGoalProgress(userId: string, goalId?: string | null) {
  const targetId = goalId || (
    await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.active, true)))
      .limit(1)
  )[0]?.id;

  if (!targetId) {
    return;
  }

  await db
    .update(goals)
    .set({
      completedSessions: sql`${goals.completedSessions} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(goals.id, targetId), eq(goals.userId, userId)));

  await promoteVerifiedStakesIfGoalHit(userId);
}
