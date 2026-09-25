import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/errors";
import { toPublicUser } from "../../utils/serialize";
import { arePartners } from "../../utils/visibility";

const updateProfileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(280).optional(),
  city: z.string().max(80).optional(),
  avatarColor: z.string().max(20).optional(),
});

export default async function userRoutes(app: FastifyInstance) {
  app.get("/users/handle/:handle", { preHandler: app.authenticate }, async (req) => {
    const { handle } = req.params as { handle: string };
    const user = await prisma.user.findUnique({ where: { handle } });
    if (!user) throw ApiError.notFound("No one uses that handle.");
    return {
      ...toPublicUser(user),
      isPartner: await arePartners(req.userId!, user.id),
    };
  });

  app.patch("/users/me", { preHandler: app.authenticate }, async (req) => {
    const body = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.userId }, data: body });
    return toPublicUser(user, { includeEmail: true });
  });

  // The profile screen's reliability bar: weeks on target, streaks, median
  // reply time to a witness request, challenges finished. Computed on read
  // rather than stored, since this is a showcase-scale dataset.
  app.get("/users/:userId/stats", { preHandler: app.authenticate }, async (req) => {
    const { userId: ownerId } = req.params as { userId: string };

    const [sessions, finishedChallenges, withdrawnChallenges, respondedWitnesses] =
      await Promise.all([
        prisma.workoutSession.findMany({
          where: { userId: ownerId },
          select: { occurredAt: true },
        }),
        prisma.challengeMember.count({ where: { userId: ownerId, status: "FINISHED" } }),
        prisma.challengeMember.count({ where: { userId: ownerId, status: "WITHDRAWN" } }),
        prisma.witness.findMany({
          where: { userId: ownerId, status: { not: "PENDING" }, respondedAt: { not: null } },
          select: { createdAt: true, respondedAt: true },
        }),
      ]);

    // Longest run of consecutive days with at least one session.
    const days = new Set(
      sessions.map((s) => s.occurredAt.toISOString().slice(0, 10))
    );
    let longestStreak = 0;
    let current = 0;
    const sorted = [...days].sort();
    let prevDate: Date | null = null;
    for (const d of sorted) {
      const date = new Date(d + "T00:00:00Z");
      if (prevDate && date.getTime() - prevDate.getTime() === 86400000) {
        current += 1;
      } else {
        current = 1;
      }
      longestStreak = Math.max(longestStreak, current);
      prevDate = date;
    }

    const replyTimesMs = respondedWitnesses
      .filter((w) => w.respondedAt)
      .map((w) => w.respondedAt!.getTime() - w.createdAt.getTime())
      .sort((a, b) => a - b);
    const medianReplyMs = replyTimesMs.length
      ? replyTimesMs[Math.floor(replyTimesMs.length / 2)]
      : null;

    return {
      totalSessions: sessions.length,
      longestStreak,
      challengesFinished: finishedChallenges,
      challengesWithdrawn: withdrawnChallenges,
      medianWitnessReplyMinutes: medianReplyMs ? Math.round(medianReplyMs / 60000) : null,
    };
  });
}
