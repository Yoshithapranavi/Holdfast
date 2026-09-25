import { FastifyInstance } from "fastify";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/errors";
import { canView } from "../../utils/visibility";

const createSessionSchema = z.object({
  type: z.enum(["RUN", "STRENGTH", "SWIM", "CYCLE", "MOBILITY", "OTHER"]),
  occurredAt: z.string().datetime(),
  durationSeconds: z.number().int().positive(),
  distanceMeters: z.number().positive().optional(),
  effort: z.enum(["EASY", "STEADY", "HARD"]).optional(),
  notes: z.string().max(2000).optional(),
  visibility: z.enum(["PUBLIC", "PARTNERS", "PRIVATE"]).default("PARTNERS"),
  goalId: z.string().optional(),
  challengeMemberId: z.string().optional(),
  // if true, a feed Post is generated for this session immediately
  shareToFeed: z.boolean().default(true),
});

const witnessResponseSchema = z.object({
  status: z.enum(["CONFIRMED", "QUERIED"]),
  note: z.string().max(500).optional(),
});

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

async function loadSessionOr404(sessionId: string) {
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    include: { proofs: { include: { witnesses: { include: { user: true } } } } },
  });
  if (!session) throw ApiError.notFound("That session doesn't exist.");
  return session;
}

export default async function sessionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Log a session — the modal's "Log session & submit proof" / "Log without
  // proof" both call this first; proof is attached with a follow-up call.
  app.post("/sessions", async (req, reply) => {
    const body = createSessionSchema.parse(req.body);

    if (body.goalId) {
      const goal = await prisma.goal.findUnique({ where: { id: body.goalId } });
      if (!goal || goal.userId !== req.userId) {
        throw ApiError.badRequest("That goal isn't yours to log against.");
      }
    }

    const session = await prisma.workoutSession.create({
      data: {
        userId: req.userId!,
        type: body.type,
        occurredAt: new Date(body.occurredAt),
        durationSeconds: body.durationSeconds,
        distanceMeters: body.distanceMeters,
        effort: body.effort,
        notes: body.notes,
        visibility: body.visibility,
        goalId: body.goalId,
        challengeMemberId: body.challengeMemberId,
      },
    });

    // Update goal progress according to the goal's metric.
    if (body.goalId) {
      const goal = await prisma.goal.findUnique({
        where: { id: body.goalId },
      });

      if (goal) {
        let progress = 0;

        switch (goal.metric) {
          case "DISTANCE":
            if (body.distanceMeters) {
              progress = body.distanceMeters / 1000;
            }
            break;

          case "DURATION":
            progress = body.durationSeconds / 60;
            break;

          case "FREQUENCY":
            progress = 1;
            break;

          case "HABIT":
          case "CUSTOM":
            // These metrics require explicit progress input.
            progress = 0;
            break;
        }

        if (progress > 0) {
          await prisma.goal.update({
            where: { id: goal.id },
            data: {
              currentValue: {
                increment: progress,
              },
            },
          });
        }
      }
    }

    if (body.shareToFeed && body.visibility !== "PRIVATE") {
      await prisma.post.create({
        data: {
          userId: req.userId!,
          type: "SESSION",
          sessionId: session.id,
          visibility: body.visibility,
        },
      });
    }

    reply.code(201).send(session);
  });

  app.get("/sessions/mine", async (req) => {
    const limit = Number((req.query as { limit?: string }).limit ?? 20);
    return prisma.workoutSession.findMany({
      where: { userId: req.userId },
      include: { proofs: true },
      orderBy: { occurredAt: "desc" },
      take: Math.min(limit, 100),
    });
  });

  app.get("/sessions/:sessionId", async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await loadSessionOr404(sessionId);
    if (!(await canView(req.userId, session.userId, session.visibility))) {
      throw ApiError.notFound("That session doesn't exist.");
    }
    return session;
  });

  app.get("/users/:userId/sessions", async (req) => {
    const { userId: ownerId } = req.params as { userId: string };
    const limit = Number((req.query as { limit?: string }).limit ?? 20);
    const sessions = await prisma.workoutSession.findMany({
      where: { userId: ownerId },
      orderBy: { occurredAt: "desc" },
      take: Math.min(limit, 100),
    });
    const visible = [];
    for (const s of sessions) {
      if (await canView(req.userId, ownerId, s.visibility)) visible.push(s);
    }
    return visible;
  });

  // Weekly session counts for the tally chart on Progress / Dashboard / Profile.
  app.get("/users/:userId/consistency", async (req) => {
    const { userId: ownerId } = req.params as { userId: string };
    const weeks = Math.min(Number((req.query as { weeks?: string }).weeks ?? 16), 52);

    const since = startOfWeek(new Date());
    since.setUTCDate(since.getUTCDate() - (weeks - 1) * 7);

    const sessions = await prisma.workoutSession.findMany({
      where: { userId: ownerId, occurredAt: { gte: since }, visibility: { not: "PRIVATE" } },
      select: { occurredAt: true },
    });

    const buckets = new Array(weeks).fill(0);
    for (const s of sessions) {
      const weekIndex = Math.floor(
        (startOfWeek(s.occurredAt).getTime() - since.getTime()) / (7 * 86400000)
      );
      if (weekIndex >= 0 && weekIndex < weeks) buckets[weekIndex]++;
    }
    return { since: since.toISOString(), weeks: buckets };
  });

  // ---- Proof -------------------------------------------------------------
  //
  // Accepts multipart/form-data with fields: kind, capturedAt, checkInLabel
  // (optional), witnessUserIds (comma-separated, optional — defaults to the
  // session owner's partners), and a `file` part for photo/video kinds.
  app.post("/sessions/:sessionId/proof", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await loadSessionOr404(sessionId);
    if (session.userId !== req.userId) throw ApiError.forbidden();

    if (!req.isMultipart()) {
      throw ApiError.badRequest("Send proof as multipart/form-data.");
    }

    let kind: "PHOTO" | "VIDEO" | "CHECK_IN" | undefined;
    let capturedAt: Date | undefined;
    let checkInLabel: string | undefined;
    let witnessUserIds: string[] = [];
    let fileUrl: string | undefined;

    for await (const part of req.parts()) {
      if (part.type === "file") {
        const ext = path.extname(part.filename || "") || "";
        const storedName = `${randomUUID()}${ext}`;
        const dest = path.join(UPLOAD_DIR, storedName);
        await pipeline(part.file, fs.createWriteStream(dest));
        fileUrl = `/uploads/${storedName}`;
      } else if (part.type === "field") {
        const value = String(part.value);
        if (part.fieldname === "kind") kind = value as typeof kind;
        if (part.fieldname === "capturedAt") capturedAt = new Date(value);
        if (part.fieldname === "checkInLabel") checkInLabel = value;
        if (part.fieldname === "witnessUserIds") {
          witnessUserIds = value.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }
    }

    if (!kind || !capturedAt || isNaN(capturedAt.getTime())) {
      throw ApiError.badRequest("kind and a valid capturedAt are required.");
    }
    if (kind !== "CHECK_IN" && !fileUrl) {
      throw ApiError.badRequest("A photo or video file is required for this proof kind.");
    }

    // Mirrors the UI's rejection example: proof must come from the day of the session.
    const timestampVerified = isSameDay(capturedAt, session.occurredAt);

    const proof = await prisma.proof.create({
      data: {
        sessionId,
        kind,
        fileUrl,
        checkInLabel,
        capturedAt,
        timestampVerified,
        witnesses: witnessUserIds.length
          ? { create: witnessUserIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: { witnesses: { include: { user: true } } },
    });

    reply.code(201).send({
      proof,
      warning: timestampVerified
        ? undefined
        : "This file wasn't taken on the day of the session. It's saved, but flagged for your witnesses.",
    });
  });

  // The dashboard/feed "waiting on you" queue: proof assigned to me, still pending.
  app.get("/witness-queue", async (req) => {
    const rows = await prisma.witness.findMany({
      where: { userId: req.userId, status: "PENDING" },
      include: {
        proof: { include: { session: { include: { user: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows;
  });

  app.post("/witness/:witnessId/respond", async (req) => {
    const { witnessId } = req.params as { witnessId: string };
    const body = witnessResponseSchema.parse(req.body);

    const witness = await prisma.witness.findUnique({ where: { id: witnessId } });
    if (!witness || witness.userId !== req.userId) throw ApiError.notFound();
    if (witness.status !== "PENDING") throw ApiError.conflict("Already responded to.");

    return prisma.witness.update({
      where: { id: witnessId },
      data: { status: body.status, note: body.note, respondedAt: new Date() },
    });
  });
}
