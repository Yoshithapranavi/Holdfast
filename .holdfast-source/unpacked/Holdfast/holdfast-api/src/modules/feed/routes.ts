import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/errors";
import { listPartnerIds } from "../../utils/visibility";

const createPostSchema = z.object({
  content: z.string().min(1).max(2000),
  visibility: z.enum(["PUBLIC", "PARTNERS", "PRIVATE"]).default("PARTNERS"),
});

const commentSchema = z.object({
  content: z.string().min(1).max(1000),
});

const feedQuerySchema = z.object({
  scope: z.enum(["partners", "everyone"]).default("partners"),
  take: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
});

const postInclude = {
  user: true,
  session: { include: { proofs: { include: { witnesses: true } } } },
  comments: { include: { user: true }, orderBy: { createdAt: "asc" as const } },
  reactions: true,
} as const;

export default async function feedRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // "Partners" scope mirrors the feed's default tab: your own posts plus
  // your accepted partners'. "Everyone" mirrors the public-discovery tab.
  app.get("/feed", async (req) => {
    const q = feedQuerySchema.parse(req.query);
    const partnerIds = await listPartnerIds(req.userId!);
    const authorIds = [req.userId!, ...partnerIds];

    const posts = await prisma.post.findMany({
      where: {
        AND: [
          q.scope === "partners"
            ? { userId: { in: authorIds } }
            : {},
          {
            OR: [
              { visibility: "PUBLIC" },
              { AND: [{ visibility: "PARTNERS" }, { userId: { in: authorIds } }] },
              { userId: req.userId },
            ],
          },
        ],
      },
      include: postInclude,
      orderBy: { createdAt: "desc" },
      take: q.take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    return {
      posts,
      nextCursor: posts.length === q.take ? posts[posts.length - 1].id : null,
    };
  });

  app.post("/feed/posts", async (req, reply) => {
    const body = createPostSchema.parse(req.body);
    const post = await prisma.post.create({
      data: {
        userId: req.userId!,
        type: "TEXT",
        content: body.content,
        visibility: body.visibility,
      },
      include: postInclude,
    });
    reply.code(201).send(post);
  });

  app.get("/feed/posts/:postId", async (req) => {
    const { postId } = req.params as { postId: string };
    const post = await prisma.post.findUnique({ where: { id: postId }, include: postInclude });
    if (!post) throw ApiError.notFound();
    return post;
  });

  app.post("/feed/posts/:postId/comments", async (req, reply) => {
    const { postId } = req.params as { postId: string };
    const body = commentSchema.parse(req.body);
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw ApiError.notFound();

    const comment = await prisma.comment.create({
      data: { postId, userId: req.userId!, content: body.content },
      include: { user: true },
    });
    reply.code(201).send(comment);
  });

  // The feed's one reaction — "encourage", standing in for showing up
  // rather than a generic like count.
  app.post("/feed/posts/:postId/react", async (req, reply) => {
    const { postId } = req.params as { postId: string };
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw ApiError.notFound();

    const reaction = await prisma.reaction.upsert({
      where: { postId_userId: { postId, userId: req.userId! } },
      create: { postId, userId: req.userId! },
      update: {},
    });
    reply.code(201).send(reaction);
  });

  app.delete("/feed/posts/:postId/react", async (req) => {
    const { postId } = req.params as { postId: string };
    await prisma.reaction.deleteMany({ where: { postId, userId: req.userId } });
    return { ok: true };
  });

  // Generates a milestone post — called by the goals module in a fuller
  // build whenever `achieve` fires; exposed directly here so it's testable
  // and so a client can create one manually (matches June's "40 sessions"
  // system-generated post in the design).
  app.post("/feed/posts/milestone", async (req, reply) => {
    const body = z.object({ content: z.string().min(1).max(500) }).parse(req.body);
    const post = await prisma.post.create({
      data: { userId: req.userId!, type: "MILESTONE", content: body.content, visibility: "PARTNERS" },
      include: postInclude,
    });
    reply.code(201).send(post);
  });

  // "Second miss this week and I'd rather say it than have it show up as a
  // gap" — an honest, explicit missed-day post rather than a passive stat.
  app.post("/feed/posts/missed-day", async (req, reply) => {
    const body = z.object({ content: z.string().min(1).max(1000) }).parse(req.body);
    const post = await prisma.post.create({
      data: { userId: req.userId!, type: "MISSED_DAY", content: body.content, visibility: "PARTNERS" },
      include: postInclude,
    });
    reply.code(201).send(post);
  });
}
