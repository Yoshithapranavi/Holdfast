import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { ZodError } from "zod";
import authPlugin from "./plugins/auth";
import { ApiError } from "./utils/errors";

import authRoutes from "./modules/auth/routes";
import userRoutes from "./modules/users/routes";
import partnerRoutes from "./modules/partners/routes";
import goalRoutes from "./modules/goals/routes";
import challengeRoutes from "./modules/challenges/routes";
import sessionRoutes from "./modules/sessions/routes";
import feedRoutes from "./modules/feed/routes";
import settingsRoutes from "./modules/settings/routes";
import stakeRoutes from "./modules/stake/routes";

export async function buildApp() {
  const app = Fastify({ logger: true });

  const corsOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  await app.register(cors, {
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB, matching the proof-upload copy in the UI
  });

  await app.register(fastifyStatic, {
    root: path.resolve(process.env.UPLOAD_DIR ?? "./uploads"),
    prefix: "/uploads/",
  });

  await app.register(authPlugin);

  app.get("/health", async () => ({ ok: true, service: "holdfast-api" }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(partnerRoutes);
  await app.register(goalRoutes);
  await app.register(challengeRoutes);
  await app.register(sessionRoutes);
  await app.register(feedRoutes);
  await app.register(settingsRoutes);
  await app.register(stakeRoutes);

  // A single place that turns thrown errors into the JSON shape every route
  // above relies on: { error: { code, message } }. Errors get a plain,
  // specific message rather than a generic "something went wrong" — matching
  // the product's own voice guidance for empty and error states.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof ZodError) {
      reply.code(400).send({
        error: {
          code: "validation_error",
          message: err.errors.map((e) => `${e.path.join(".") || "value"}: ${e.message}`).join("; "),
        },
      });
      return;
    }
    // @fastify/jwt and @fastify/multipart throw plain errors with statusCode set.
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode < 500) {
      reply.code(statusCode).send({ error: { code: "request_error", message: err.message } });
      return;
    }
    req.log.error(err);
    reply.code(500).send({
      error: { code: "internal_error", message: "Something went wrong on our end." },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: { code: "not_found", message: `No route ${req.method} ${req.url}` },
    });
  });

  return app;
}
