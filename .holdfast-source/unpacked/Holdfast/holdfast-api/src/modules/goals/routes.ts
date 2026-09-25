import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/errors";
import { canView } from "../../utils/visibility";

const createGoalSchema = z.object({
  title: z.string().min(1).max(140),
  metric: z.enum(["DISTANCE", "DURATION", "FREQUENCY", "HABIT", "CUSTOM"]),
  targetValue: z.number().positive(),
  unit: z.string().min(1).max(20),
  deadline: z.string().datetime().optional(),
  visibility: z.enum(["PUBLIC", "PARTNERS", "PRIVATE"]).default("PARTNERS"),
  witnessUserIds: z.array(z.string()).max(10).optional(),
});

const updateGoalSchema = createGoalSchema.partial().extend({
  status: z.enum(["ACTIVE", "FINISHED", "ARCHIVED"]).optional(),
});

const milestoneSchema = z.object({
  title: z.string().min(1).max(140),
});

const MAX_ACTIVE_GOALS = 3; // "Room for one more" — the limit shown on the Goals screen

async function loadGoalOr404(goalId: string) {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { milestones: true, witnesses: { include: { user: true } } },
  });
  if (!goal) throw ApiError.notFound("That goal doesn't exist.");
  return goal;
}

export default async function goalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post("/goals", async (req, reply) => {
    const body = createGoalSchema.parse(req.body);

    const activeCount = await prisma.goal.count({
      where: { userId: req.userId, status: "ACTIVE" },
    });
    if (activeCount >= MAX_ACTIVE_GOALS) {
      throw ApiError.conflict(
        `You already have ${MAX_ACTIVE_GOALS} active goals. Finish or archive one before starting another — it keeps the week honest.`,
        "goal_limit_reached"
      );
    }

    const goal = await prisma.goal.create({
      data: {
        userId: req.userId!,
        title: body.title,
        metric: body.metric,
        targetValue: body.targetValue,
        unit: body.unit,
        deadline: body.deadline ? new Date(body.deadline) : undefined,
        visibility: body.visibility,
        witnesses: body.witnessUserIds
          ? { create: body.witnessUserIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: { milestones: true, witnesses: { include: { user: true } } },
    });
    reply.code(201).send(goal);
  });

  // Goals belonging to the current user, grouped the way the Goals screen's
  // tabs expect (Active / Finished / Archived).
  app.get("/goals/mine", async (req) => {
    const status = (req.query as { status?: string }).status?.toUpperCase();
    const goals = await prisma.goal.findMany({
      where: {
        userId: req.userId,
        ...(status && ["ACTIVE", "FINISHED", "ARCHIVED"].includes(status)
          ? { status: status as "ACTIVE" | "FINISHED" | "ARCHIVED" }
          : {}),
      },
      include: { milestones: true, witnesses: { include: { user: true } } },
      orderBy: [{ status: "asc" }, { deadline: "asc" }],
    });
    return goals;
  });

  // A partner or the public viewing someone else's goals — visibility rules apply.
  app.get("/users/:userId/goals", async (req) => {
    const { userId: ownerId } = req.params as { userId: string };
    const goals = await prisma.goal.findMany({
      where: { userId: ownerId, status: "ACTIVE" },
      include: { milestones: true },
      orderBy: { deadline: "asc" },
    });
    const visible = [];
    for (const goal of goals) {
      if (await canView(req.userId, ownerId, goal.visibility)) visible.push(goal);
    }
    return visible;
  });

  app.get("/goals/:goalId", async (req) => {
    const { goalId } = req.params as { goalId: string };
    const goal = await loadGoalOr404(goalId);
    if (!(await canView(req.userId, goal.userId, goal.visibility))) {
      throw ApiError.notFound("That goal doesn't exist.");
    }
    return goal;
  });

  app.patch("/goals/:goalId", async (req) => {
    const { goalId } = req.params as { goalId: string };
    const body = updateGoalSchema.parse(req.body);
    const goal = await loadGoalOr404(goalId);
    if (goal.userId !== req.userId) throw ApiError.forbidden();

    // "Lowering a target tells your witnesses" — surfaced here as a flag in
    // the response so the client can show the warning and, in a fuller
    // build, trigger a notification job.
    const loweringTarget =
      body.targetValue !== undefined && body.targetValue < goal.targetValue;

    const updated = await prisma.goal.update({
      where: { id: goalId },
      data: {
        title: body.title,
        metric: body.metric,
        targetValue: body.targetValue,
        unit: body.unit,
        deadline: body.deadline ? new Date(body.deadline) : undefined,
        visibility: body.visibility,
        status: body.status,
      },
      include: { milestones: true, witnesses: { include: { user: true } } },
    });

    return { goal: updated, witnessesNotified: loweringTarget };
  });

  app.delete("/goals/:goalId", async (req) => {
    const { goalId } = req.params as { goalId: string };
    const goal = await loadGoalOr404(goalId);
    if (goal.userId !== req.userId) throw ApiError.forbidden();
    await prisma.goal.update({ where: { id: goalId }, data: { status: "ARCHIVED" } });
    return { ok: true };
  });

  app.post("/goals/:goalId/milestones", async (req, reply) => {
    const { goalId } = req.params as { goalId: string };
    const body = milestoneSchema.parse(req.body);
    const goal = await loadGoalOr404(goalId);
    if (goal.userId !== req.userId) throw ApiError.forbidden();

    const milestone = await prisma.milestone.create({
      data: { goalId, title: body.title },
    });
    reply.code(201).send(milestone);
  });

  app.post("/goals/:goalId/milestones/:milestoneId/achieve", async (req) => {
    const { goalId, milestoneId } = req.params as { goalId: string; milestoneId: string };
    const goal = await loadGoalOr404(goalId);
    if (goal.userId !== req.userId) throw ApiError.forbidden();

    return prisma.milestone.update({
      where: { id: milestoneId },
      data: { achievedAt: new Date() },
    });
  });

  app.post("/goals/:goalId/witnesses", async (req, reply) => {
    const { goalId } = req.params as { goalId: string };
    const { userId: witnessId } = z.object({ userId: z.string() }).parse(req.body);
    const goal = await loadGoalOr404(goalId);
    if (goal.userId !== req.userId) throw ApiError.forbidden();

    const witness = await prisma.goalWitness.upsert({
      where: { goalId_userId: { goalId, userId: witnessId } },
      create: { goalId, userId: witnessId },
      update: {},
    });
    reply.code(201).send(witness);
  });
}
