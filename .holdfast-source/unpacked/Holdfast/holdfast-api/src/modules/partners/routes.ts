import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/errors";
import { toPublicUser } from "../../utils/serialize";
import { listPartnerIds } from "../../utils/visibility";

const inviteSchema = z.object({
  // Accepts either a handle or a raw user id, matching the onboarding
  // screen's "search by name, handle or email" box.
  handle: z.string().min(1),
});

const respondSchema = z.object({
  accept: z.boolean(),
});

export default async function partnerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // "Who should notice if you skip?" — the onboarding step, and the
  // profile's "Ask to be partners" button, both land here.
  app.post("/partners/invite", async (req) => {
    const body = inviteSchema.parse(req.body);
    const recipient = await prisma.user.findUnique({ where: { handle: body.handle } });
    if (!recipient) throw ApiError.notFound("No one uses that handle.");
    if (recipient.id === req.userId) throw ApiError.badRequest("You can't partner with yourself.");

    const existing = await prisma.partnership.findFirst({
      where: {
        OR: [
          { requesterId: req.userId, recipientId: recipient.id },
          { requesterId: recipient.id, recipientId: req.userId },
        ],
      },
    });
    if (existing) {
      if (existing.status === "ACCEPTED") {
        throw ApiError.conflict("You're already partners.", "already_partners");
      }
      if (existing.status === "PENDING") {
        throw ApiError.conflict("An invite is already pending.", "already_pending");
      }
    }

    const partnership = await prisma.partnership.create({
      data: { requesterId: req.userId!, recipientId: recipient.id, status: "PENDING" },
    });
    return partnership;
  });

  // Accept or decline an invite sent to you.
  app.post("/partners/:partnershipId/respond", async (req) => {
    const { partnershipId } = req.params as { partnershipId: string };
    const body = respondSchema.parse(req.body);

    const partnership = await prisma.partnership.findUnique({ where: { id: partnershipId } });
    if (!partnership || partnership.recipientId !== req.userId) {
      throw ApiError.notFound("No pending invite found.");
    }
    if (partnership.status !== "PENDING") {
      throw ApiError.conflict("This invite was already answered.");
    }

    return prisma.partnership.update({
      where: { id: partnershipId },
      data: { status: body.accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
    });
  });

  // Your accepted partners, with a lightweight streak figure — the list
  // shown in onboarding, the feed sidebar, and the profile's partner grid.
  app.get("/partners", async (req) => {
    const partnerIds = await listPartnerIds(req.userId!);
    const users = await prisma.user.findMany({ where: { id: { in: partnerIds } } });
    return users.map((u) => toPublicUser(u));
  });

  // Invites you've sent that are still awaiting a reply.
  app.get("/partners/pending/sent", async (req) => {
    const rows = await prisma.partnership.findMany({
      where: { requesterId: req.userId, status: "PENDING" },
      include: { recipient: true },
    });
    return rows.map((r) => ({ partnershipId: r.id, user: toPublicUser(r.recipient) }));
  });

  // Invites sent to you, still awaiting your reply.
  app.get("/partners/pending/received", async (req) => {
    const rows = await prisma.partnership.findMany({
      where: { recipientId: req.userId, status: "PENDING" },
      include: { requester: true },
    });
    return rows.map((r) => ({ partnershipId: r.id, user: toPublicUser(r.requester) }));
  });

  app.delete("/partners/:userId", async (req) => {
    const { userId: otherId } = req.params as { userId: string };
    await prisma.partnership.updateMany({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: req.userId, recipientId: otherId },
          { requesterId: otherId, recipientId: req.userId },
        ],
      },
      data: { status: "ENDED" },
    });
    return { ok: true };
  });
}
