import {
    boolean,
    integer,
    pgTable,
    real,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId").notNull(),
});

export const account = pgTable("account", {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId").notNull(),
    password: text("password"),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
    scope: text("scope"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const goals = pgTable("goals", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("userId").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    targetSessions: integer("targetSessions").notNull().default(1),
    completedSessions: integer("completedSessions").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const workoutSessions = pgTable("workout_sessions", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("userId").notNull(),
    goalId: uuid("goalId"),
    type: text("type").notNull(),
    durationMinutes: integer("durationMinutes").notNull(),
    distanceKm: real("distanceKm"),
    effort: text("effort"),
    notes: text("notes"),
    occurredAt: timestamp("occurredAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export const dailyCommitments = pgTable("daily_commitments", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("userId").notNull(),
    commitmentDate: timestamp("commitmentDate").notNull(),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const stakes = pgTable("stakes", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("userId").notNull(),
    stripeCheckoutSessionId: text("stripeCheckoutSessionId").notNull().unique(),
    amountCents: integer("amountCents").notNull(),
    proofMethod: text("proofMethod").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verificationProofs = pgTable("verification_proofs", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("userId").notNull(),
    pathname: text("pathname").notNull(),
    proofMethod: text("proofMethod").notNull().default("video"),
    status: text("status").notNull().default("SUBMITTED"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});