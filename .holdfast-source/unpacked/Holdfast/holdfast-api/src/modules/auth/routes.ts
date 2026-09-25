import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { ApiError } from "../../utils/errors";
import { toPublicUser } from "../../utils/serialize";

const registerSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8, "Password needs at least 8 characters."),
  handle: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/, "Handle can only use lowercase letters, numbers and underscores."),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Sets up a brand-new account with the defaults every other module assumes
// already exist: a demo stake account with a starting grant, and a sensible
// set of privacy + notification defaults matching what the settings screen
// shows for a fresh member.
async function provisionNewAccount(userId: string) {
  const SIGNUP_GRANT = 240; // matches the "240 credits" shown in the staking screen's design reference

  await prisma.$transaction([
    prisma.stakeAccount.create({
      data: { userId, balance: SIGNUP_GRANT },
    }),
    prisma.ledgerEntry.create({
      data: {
        userId,
        amount: SIGNUP_GRANT,
        reason: "SIGNUP_GRANT",
        memo: "Starting demo balance",
      },
    }),
    prisma.privacySetting.createMany({
      data: [
        { userId, field: "sessions", visibleTo: "PARTNERS" },
        { userId, field: "proof_media", visibleTo: "PARTNERS" },
        { userId, field: "missed_days", visibleTo: "PARTNERS" },
        { userId, field: "notes", visibleTo: "PARTNERS" },
        { userId, field: "measurements", visibleTo: "PRIVATE" },
        { userId, field: "location", visibleTo: "PARTNERS" },
      ],
    }),
    prisma.notificationSetting.createMany({
      data: [
        { userId, key: "proof_requested", enabled: true, channel: "push" },
        { userId, key: "session_witnessed", enabled: true, channel: "digest" },
        { userId, key: "streak_ending", enabled: true, channel: "push" },
        { userId, key: "partner_missed_day", enabled: false, channel: "push" },
        { userId, key: "new_challenges", enabled: false, channel: "email" },
      ],
    }),
  ]);
}

export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (req, reply) => {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: body.email }, { handle: body.handle }] },
    });
    if (existing) {
      throw ApiError.conflict(
        existing.email === body.email
          ? "An account with that email already exists."
          : "That handle is taken. Try another.",
        "already_exists"
      );
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        handle: body.handle,
        passwordHash,
      },
    });

    await provisionNewAccount(user.id);

    const token = app.jwt.sign({ userId: user.id }, { expiresIn: "30d" });
    reply.code(201).send({ token, user: toPublicUser(user, { includeEmail: true }) });
  });

  app.post("/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw ApiError.unauthorized("Email or password is incorrect.");
    }

    const token = app.jwt.sign({ userId: user.id }, { expiresIn: "30d" });
    reply.send({ token, user: toPublicUser(user, { includeEmail: true }) });
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (req) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
    return toPublicUser(user, { includeEmail: true });
  });
}
