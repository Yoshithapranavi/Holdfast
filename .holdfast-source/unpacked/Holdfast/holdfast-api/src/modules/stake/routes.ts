import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/errors";
import { arePartners } from "../../utils/visibility";

// ---------------------------------------------------------------------------
// DEMO-ONLY MODULE
//
// Everything here operates on simulated "credits" from StakeAccount /
// LedgerEntry. There is no payment provider integration, no real currency,
// and no code path that could accidentally move real money — that's a
// deliberate constraint of this module, not just this comment. If real-money
// staking is ever built, it should be a new module with its own compliance
// review, not an extension of this one.
// ---------------------------------------------------------------------------

const createStakeSchema = z
  .object({
    amount: z.number().int().positive().max(100_000),
    ruleSummary: z.string().min(1).max(200),
    goalId: z.string().optional(),
    challengeId: z.string().optional(),
  })
  .refine((v) => Boolean(v.goalId) !== Boolean(v.challengeId), {
    message: "A stake must be attached to exactly one of goalId or challengeId.",
  });

const resolveSchema = z.object({
  outcome: z.enum(["WON", "LOST"]),
});

const releaseSchema = z.object({
  note: z.string().max(300).optional(),
});

async function ensureAccount(userId: string) {
  return prisma.stakeAccount.upsert({
    where: { userId },
    create: { userId, balance: 0 },
    update: {},
  });
}

export default async function stakeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // The staking screen's headline numbers: free balance, credits currently
  // at stake, and credits returned in the last quarter.
  app.get("/stake/account", async (req) => {
    const account = await ensureAccount(req.userId!);

    const [activeStakes, quarterReturns] = await Promise.all([
      prisma.stake.findMany({ where: { userId: req.userId, status: "ACTIVE" } }),
      prisma.ledgerEntry.aggregate({
        where: {
          userId: req.userId,
          reason: "STAKE_RETURNED",
          createdAt: { gte: new Date(Date.now() - 90 * 86400000) },
        },
        _sum: { amount: true },
      }),
    ]);

    const atStake = activeStakes.reduce((sum, s) => sum + s.amount, 0);

    return {
      freeBalance: account.balance,
      atStake,
      totalBalance: account.balance + atStake,
      returnedLast90Days: quarterReturns._sum.amount ?? 0,
      isDemo: true,
    };
  });

  app.get("/stake", async (req) => {
    const status = (req.query as { status?: string }).status?.toUpperCase();
    return prisma.stake.findMany({
      where: {
        userId: req.userId,
        ...(status ? { status: status as any } : {}),
      },
      include: { goal: true, challenge: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get("/stake/ledger", async (req) => {
    const take = Math.min(Number((req.query as { limit?: string }).limit ?? 30), 100);
    return prisma.ledgerEntry.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take,
    });
  });

  // "Stake 25 demo credits" — moves credits from free balance into an
  // active stake tied to one goal or challenge.
  app.post("/stake", async (req, reply) => {
    const body = createStakeSchema.parse(req.body);

    if (body.goalId) {
      const goal = await prisma.goal.findUnique({ where: { id: body.goalId } });
      if (!goal || goal.userId !== req.userId) {
        throw ApiError.badRequest("That goal isn't yours to stake on.");
      }
    }
    if (body.challengeId) {
      const membership = await prisma.challengeMember.findUnique({
        where: { challengeId_userId: { challengeId: body.challengeId, userId: req.userId! } },
      });
      if (!membership) {
        throw ApiError.badRequest("Join the challenge before staking on it.");
      }
      const challenge = await prisma.challenge.findUnique({ where: { id: body.challengeId } });
      if (!challenge?.allowsDemoStaking) {
        throw ApiError.badRequest("This challenge doesn't have demo staking turned on.");
      }
    }

    const account = await ensureAccount(req.userId!);
    if (account.balance < body.amount) {
      throw ApiError.conflict(
        "Not enough free demo credits for that stake.",
        "insufficient_balance"
      );
    }

    const [stake] = await prisma.$transaction([
      prisma.stake.create({
        data: {
          userId: req.userId!,
          amount: body.amount,
          ruleSummary: body.ruleSummary,
          goalId: body.goalId,
          challengeId: body.challengeId,
        },
      }),
      prisma.stakeAccount.update({
        where: { userId: req.userId },
        data: { balance: { decrement: body.amount } },
      }),
    ]);

    await prisma.ledgerEntry.create({
      data: {
        userId: req.userId!,
        amount: -body.amount,
        reason: "STAKE_HELD",
        memo: `Staked on: ${body.ruleSummary}`,
        stakeId: stake.id,
      },
    });

    reply.code(201).send(stake);
  });

  // Demo-only resolution trigger. In a real product this would be computed
  // automatically from logged sessions against the goal/challenge rule, not
  // called directly — exposed as an endpoint here so the mechanic is
  // demonstrable without building that automation.
  app.post("/stake/:stakeId/resolve", async (req) => {
    const { stakeId } = req.params as { stakeId: string };
    const body = resolveSchema.parse(req.body);

    const stake = await prisma.stake.findUnique({ where: { id: stakeId } });
    if (!stake || stake.userId !== req.userId) throw ApiError.notFound();
    if (stake.status !== "ACTIVE") throw ApiError.conflict("This stake was already resolved.");

    await prisma.stake.update({
      where: { id: stakeId },
      data: { status: body.outcome, resolvedAt: new Date() },
    });

    if (body.outcome === "WON") {
      await prisma.$transaction([
        prisma.stakeAccount.update({
          where: { userId: req.userId },
          data: { balance: { increment: stake.amount } },
        }),
        prisma.ledgerEntry.create({
          data: {
            userId: req.userId!,
            amount: stake.amount,
            reason: "STAKE_RETURNED",
            memo: `Won: ${stake.ruleSummary}`,
            stakeId: stake.id,
          },
        }),
      ]);
    } else {
      // Forfeited credits are already out of the free balance from the
      // STAKE_HELD entry; this just records the forfeiture for the ledger.
      // A fuller build would fan the amount out to a group pot here.
      await prisma.ledgerEntry.create({
        data: {
          userId: req.userId!,
          amount: 0,
          reason: "STAKE_FORFEITED",
          memo: `Forfeited: ${stake.ruleSummary}`,
          stakeId: stake.id,
        },
      });
    }

    return prisma.stake.findUnique({ where: { id: stakeId } });
  });

  // "Injured or ill? Tomas or June can release the stake with one tap."
  app.post("/stake/:stakeId/release", async (req) => {
    const { stakeId } = req.params as { stakeId: string };
    const body = releaseSchema.parse(req.body);

    const stake = await prisma.stake.findUnique({ where: { id: stakeId } });
    if (!stake) throw ApiError.notFound();
    if (stake.status !== "ACTIVE") throw ApiError.conflict("This stake was already resolved.");
    if (!(await arePartners(req.userId!, stake.userId))) {
      throw ApiError.forbidden("Only a partner of the stake's owner can release it.");
    }

    await prisma.$transaction([
      prisma.stake.update({
        where: { id: stakeId },
        data: { status: "RELEASED", resolvedAt: new Date(), resolvedBy: req.userId },
      }),
      prisma.stakeAccount.update({
        where: { userId: stake.userId },
        data: { balance: { increment: stake.amount } },
      }),
      prisma.ledgerEntry.create({
        data: {
          userId: stake.userId,
          amount: stake.amount,
          reason: "STAKE_RETURNED",
          memo: body.note ? `Released early by a partner: ${body.note}` : "Released early by a partner",
          stakeId: stake.id,
        },
      }),
    ]);

    return prisma.stake.findUnique({ where: { id: stakeId } });
  });

  app.post("/stake/:stakeId/withdraw", async (req) => {
    const { stakeId } = req.params as { stakeId: string };
    const stake = await prisma.stake.findUnique({ where: { id: stakeId } });
    if (!stake || stake.userId !== req.userId) throw ApiError.notFound();
    if (stake.status !== "ACTIVE") throw ApiError.conflict("This stake was already resolved.");

    await prisma.$transaction([
      prisma.stake.update({
        where: { id: stakeId },
        data: { status: "WITHDRAWN", resolvedAt: new Date() },
      }),
      prisma.stakeAccount.update({
        where: { userId: req.userId },
        data: { balance: { increment: stake.amount } },
      }),
      prisma.ledgerEntry.create({
        data: {
          userId: req.userId!,
          amount: stake.amount,
          reason: "STAKE_RETURNED",
          memo: `Withdrawn before resolution: ${stake.ruleSummary}`,
          stakeId: stake.id,
        },
      }),
    ]);

    return { ok: true };
  });
}
