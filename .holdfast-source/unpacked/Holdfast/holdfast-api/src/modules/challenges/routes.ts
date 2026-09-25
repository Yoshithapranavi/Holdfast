import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/errors";
import { listPartnerIds } from "../../utils/visibility";

const listQuerySchema = z.object({
  category: z.string().optional(),
  proofRequired: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  take: z.coerce.number().int().positive().max(50).default(20),
});

const createChallengeSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().min(1).max(4000),
  category: z.string().min(1).max(40),
  hostName: z.string().min(1).max(80),
  durationWeeks: z.number().int().positive().max(52),
  startDate: z.string().datetime(),
  proofRequirement: z
    .enum(["NONE", "CHECK_IN", "PHOTO_OR_VIDEO", "GPS_SCREENSHOT"])
    .default("NONE"),
  proofFrequencyPerWeek: z.number().int().min(0).max(14).default(0),
  capacity: z.number().int().positive().optional(),
  visibility: z.enum(["PUBLIC", "PARTNERS", "PRIVATE"]).default("PUBLIC"),
  allowsDemoStaking: z.boolean().default(false),
  weeks: z
    .array(
      z.object({
        weekNumber: z.number().int().positive(),
        focus: z.string().min(1),
        targetValue: z.number().optional(),
        targetUnit: z.string().optional(),
      })
    )
    .optional(),
});

export default async function challengeRoutes(app: FastifyInstance) {
  // Discovery is readable without auth (a public landing-style browse), but
  // "your partners in this" and join actions need it — so auth is optional
  // here and required on the mutating routes below.
  app.get("/challenges", async (req) => {
    const q = listQuerySchema.parse(req.query);

    const challenges = await prisma.challenge.findMany({
      where: {
        visibility: "PUBLIC",
        ...(q.category ? { category: { equals: q.category, mode: "insensitive" } } : {}),
        ...(q.proofRequired === "true" ? { proofRequirement: { not: "NONE" } } : {}),
        ...(q.proofRequired === "false" ? { proofRequirement: "NONE" } : {}),
        ...(q.search
          ? { title: { contains: q.search, mode: "insensitive" } }
          : {}),
      },
      include: { _count: { select: { members: true } } },
      orderBy: { startDate: "asc" },
      take: q.take,
    });

    return challenges.map((c) => ({
      ...c,
      memberCount: c._count.members,
      _count: undefined,
    }));
  });

  app.get("/challenges/:challengeId", async (req) => {
    const { challengeId } = req.params as { challengeId: string };
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        host: true,
        weeks: { orderBy: { weekNumber: "asc" } },
        _count: { select: { members: true } },
      },
    });
    if (!challenge) throw ApiError.notFound("That challenge doesn't exist.");

    let partnersIn: string[] = [];
    if (req.userId) {
      const partnerIds = await listPartnerIds(req.userId);
      const members = await prisma.challengeMember.findMany({
        where: { challengeId, userId: { in: partnerIds } },
        select: { userId: true },
      });
      partnersIn = members.map((m) => m.userId);
    }

    return { ...challenge, memberCount: challenge._count.members, partnersIn };
  });

  app.get("/challenges/:challengeId/standings", async (req) => {
    const { challengeId } = req.params as { challengeId: string };
    const members = await prisma.challengeMember.findMany({
      where: { challengeId },
      include: {
        user: true,
        sessions: { include: { proofs: true } },
      },
    });

    const standings = members
      .map((m) => {
        const sessionCount = m.sessions.length;
        const distanceKm =
          m.sessions.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0) / 1000;
        const proofCount = m.sessions.reduce((sum, s) => sum + s.proofs.length, 0);
        return {
          userId: m.userId,
          user: { id: m.user.id, name: m.user.name, handle: m.user.handle, avatarColor: m.user.avatarColor },
          status: m.status,
          sessionCount,
          distanceKm: Math.round(distanceKm * 10) / 10,
          proofCount,
        };
      })
      .sort((a, b) => b.sessionCount - a.sessionCount || b.distanceKm - a.distanceKm);

    return standings;
  });

  app.post("/challenges", { preHandler: app.authenticate }, async (req, reply) => {
    const body = createChallengeSchema.parse(req.body);
    const challenge = await prisma.challenge.create({
      data: {
        title: body.title,
        description: body.description,
        category: body.category,
        hostId: req.userId!,
        hostName: body.hostName,
        durationWeeks: body.durationWeeks,
        startDate: new Date(body.startDate),
        proofRequirement: body.proofRequirement,
        proofFrequencyPerWeek: body.proofFrequencyPerWeek,
        capacity: body.capacity,
        visibility: body.visibility,
        allowsDemoStaking: body.allowsDemoStaking,
        weeks: body.weeks ? { create: body.weeks } : undefined,
      },
    });
    reply.code(201).send(challenge);
  });

  app.post("/challenges/:challengeId/join", { preHandler: app.authenticate }, async (req, reply) => {
    const { challengeId } = req.params as { challengeId: string };
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: { _count: { select: { members: true } } },
    });
    if (!challenge) throw ApiError.notFound("That challenge doesn't exist.");

    if (challenge.capacity && challenge._count.members >= challenge.capacity) {
      throw ApiError.conflict("This challenge is full.", "challenge_full");
    }

    const existing = await prisma.challengeMember.findUnique({
      where: { challengeId_userId: { challengeId, userId: req.userId! } },
    });
    if (existing) throw ApiError.conflict("You've already joined this challenge.");

    const member = await prisma.challengeMember.create({
      data: { challengeId, userId: req.userId! },
    });
    reply.code(201).send(member);
  });

  app.post("/challenges/:challengeId/leave", { preHandler: app.authenticate }, async (req) => {
    const { challengeId } = req.params as { challengeId: string };
    await prisma.challengeMember.updateMany({
      where: { challengeId, userId: req.userId },
      data: { status: "WITHDRAWN" },
    });
    return { ok: true };
  });

  app.get("/challenges/mine", { preHandler: app.authenticate }, async (req) => {
    const memberships = await prisma.challengeMember.findMany({
      where: { userId: req.userId },
      include: { challenge: true },
      orderBy: { joinedAt: "desc" },
    });
    return memberships;
  });
}
