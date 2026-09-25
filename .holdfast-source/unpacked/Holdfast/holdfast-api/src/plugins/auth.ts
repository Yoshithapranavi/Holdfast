import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "../utils/errors";

export interface AuthTokenPayload {
  userId: string;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

// Registers @fastify/jwt and a request.userId-populating `authenticate`
// decorator that route groups call as a preHandler. Kept as one small
// plugin so every module imports the same auth behaviour rather than
// re-implementing token verification.
export default fp(async (app) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Copy .env.example to .env and set one.");
  }

  app.register(fastifyJwt, { secret });

  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await req.jwtVerify<AuthTokenPayload>();
      req.userId = payload.userId;
    } catch {
      throw ApiError.unauthorized("Your session has expired or is invalid. Log in again.");
    }
  });
});
