import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

if (!connectionString) {
    throw new Error(
        "Missing DATABASE_URL. Add DATABASE_URL to your local .env.local file."
    );
}

export const pool = new Pool({
    connectionString,
});

export const db = drizzle(pool);