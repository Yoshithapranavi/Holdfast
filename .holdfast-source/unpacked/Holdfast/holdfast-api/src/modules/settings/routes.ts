import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";

const PRIVACY_FIELDS = [
  "sessions",
  "proof_media",
  "missed_days",
  "notes",
  "measurements",
  "location",
] as const;

const updatePrivacySchema = z.object({
  field: z.enum(PRIVACY_FIELDS),
  visibleTo: z.enum(["PUBLIC", "PARTNERS", "PRIVATE"]),
});

const updateNotificationSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
  channel: z.enum(["push", "email", "digest"]).optional(),
});

export default async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Renders directly as the settings screen's visibility table.
  app.get("/settings/privacy", async (req) => {
    return prisma.privacySetting.findMany({ where: { userId: req.userId } });
  });

  app.put("/settings/privacy", async (req) => {
    const body = updatePrivacySchema.parse(req.body);
    return prisma.privacySetting.upsert({
      where: { userId_field: { userId: req.userId!, field: body.field } },
      create: { userId: req.userId!, field: body.field, visibleTo: body.visibleTo },
      update: { visibleTo: body.visibleTo },
    });
  });

  app.get("/settings/notifications", async (req) => {
    return prisma.notificationSetting.findMany({ where: { userId: req.userId } });
  });

  app.put("/settings/notifications", async (req) => {
    const body = updateNotificationSchema.parse(req.body);
    return prisma.notificationSetting.upsert({
      where: { userId_key: { userId: req.userId!, key: body.key } },
      create: {
        userId: req.userId!,
        key: body.key,
        enabled: body.enabled,
        channel: body.channel ?? "push",
      },
      update: { enabled: body.enabled, ...(body.channel ? { channel: body.channel } : {}) },
    });
  });
}
