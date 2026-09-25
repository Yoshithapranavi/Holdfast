import { PrismaClient } from "@prisma/client";

// A single shared Prisma client for the whole process. Re-used across
// requests rather than instantiated per-request, which is what Prisma
// itself recommends for a long-running server.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
