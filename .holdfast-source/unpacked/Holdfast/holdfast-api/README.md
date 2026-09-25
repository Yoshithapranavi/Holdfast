# Holdfast API

Backend for **Holdfast**, a social fitness accountability network: personal
goals, challenges, workout logging with proof, partner witnessing, a
community feed, privacy/notification settings, and a **conceptual, demo-only
staking mechanic** (simulated credits — no real money, no payment
integration, anywhere in this codebase).

Built with **Fastify + TypeScript + Prisma + PostgreSQL**, matching the
Holdfast UI showcase screen-for-screen — the data model was written from the
screens, not the other way round.

## Stack

- **Fastify** for the HTTP layer (routes grouped into modules under `src/modules`)
- **Prisma** as the ORM, targeting **PostgreSQL**
- **@fastify/jwt** for auth (bearer tokens, 30-day expiry)
- **@fastify/multipart** for proof photo/video uploads (stored on local disk for this demo — see note below)
- **zod** for request validation

## Quick start

```bash
# 1. Bring up Postgres (or point DATABASE_URL at your own instance)
docker compose up -d

# 2. Configure environment
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Create the database schema
npm run prisma:migrate

# 5. Seed sample data (same people/goals/challenge as the UI showcase)
npm run seed

# 6. Run the API
npm run dev
```

The API listens on `http://localhost:4000` by default. `GET /health` should
return `{ "ok": true, "service": "holdfast-api" }`.

Seeded accounts (password for all of them: `holdfast123`):

| handle | name | notes |
|---|---|---|
| `nadiaf` | Nadia Farrell | main seeded account — has goals, a stake, sessions, partners |
| `tomruns` | Tomas Oyelaran | partner, hosts October Base Miles |
| `junep` | June Park | partner |
| `swhit` | Sam Whitlock | partner, has a proof awaiting witness |
| `adeogun` | Ade Ogun | partner, hosts two challenges |
| `lenac` | Lena Costa | pending partner invite, posted a missed-day update |
| `rinak` | Rina Kalra | challenge member only |

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nadia@example.com","password":"holdfast123"}'
# → { "token": "...", "user": {...} }

curl http://localhost:4000/goals/mine -H "Authorization: Bearer <token>"
```

### A note on `prisma generate` / `prisma migrate`

These commands download a small native query engine from Prisma's CDN the
first time you run them. If you're behind a restrictive firewall or a fully
offline network sandbox and the download is blocked (403/timeout), that's a
network policy issue, not a problem with this schema — on a normal machine
with regular internet access it works without any extra steps. If you do
need an offline workaround, see Prisma's docs on
[configuring engine binaries manually](https://www.prisma.io/docs/orm/reference/environment-variables-reference).

## Project layout

```
prisma/
  schema.prisma        the whole data model, heavily commented per section
  seed.ts               sample data matching the UI showcase
src/
  app.ts                Fastify instance: plugins, route registration, error handler
  server.ts             entry point
  plugins/auth.ts        JWT verification + `app.authenticate` preHandler
  lib/                   prisma client, password hashing
  utils/                 typed ApiError, visibility rules, serializers
  modules/
    auth/                register, login, /auth/me
    users/                profile lookup, edit, reliability stats
    partners/             invite / accept / list partners (the witness graph)
    goals/                CRUD + milestones + per-goal witnesses
    challenges/           discovery, detail, standings, join/leave
    sessions/             log workouts, upload + verify proof, witness queue
    feed/                 posts, comments, the single "encourage" reaction
    settings/             privacy visibility table + notification prefs
    stake/                DEMO-ONLY simulated credit ledger
```

## Design decisions worth knowing about

**Visibility is computed, not cached.** `src/utils/visibility.ts` resolves
`PUBLIC` / `PARTNERS` / `PRIVATE` against the live partner graph on every
read. That's the right tradeoff at this scale; if the feed or goal lists ever
need to scale past a few thousand users, that's the first thing to put
behind a materialized view or a fan-out-on-write cache.

**Partnership is a single accepted-or-not relationship**, not a witness
assignment. You can be someone's partner without witnessing a specific goal
(see `GoalWitness`) or a specific proof (see `Witness`) — that split matches
the UI, where onboarding asks "who should notice if you skip" but a goal's
edit screen lets you pick witnesses per-goal.

**Proof timestamp "verification" is a simple same-day check**
(`isSameDay(capturedAt, session.occurredAt)` in `sessions/routes.ts`), not
real EXIF/metadata forensics — it reproduces the UI's rejection example
("gym-selfie.heic was taken on 19 September") without pretending to be a
fraud-detection system. Flag it, don't block it silently: the session and
proof are still saved, just marked `timestampVerified: false`, and the
response includes a `warning` string.

**File uploads go to local disk** (`UPLOAD_DIR`, served back at
`/uploads/...`) to keep this runnable with zero external accounts. Swap
`sessions/routes.ts`'s upload handler for S3/R2/GCS in front of a CDN before
this goes anywhere real — proof photos are exactly the kind of user content
that shouldn't live on a single app server's disk long-term.

**The staking module is deliberately isolated and over-commented.** Every
model, field, and route under "stake" operates on simulated integer
`credits`, seeded via a signup grant, moved between a free balance and
per-stake holds, and logged to an append-only ledger. There is no
payment-provider client anywhere in this repo. If real-money staking is ever
built, treat it as new module with its own compliance review — don't extend
this one.

## Endpoint reference

All routes are prefixed at the root (no `/api` or version prefix — add one
in front with a reverse proxy or in `app.ts` if you need it later).
Authenticated routes expect `Authorization: Bearer <token>`.

### Auth
- `POST /auth/register` — `{ name, email, password, handle }`
- `POST /auth/login` — `{ email, password }`
- `GET /auth/me`

### Users & partners
- `GET /users/handle/:handle`
- `PATCH /users/me`
- `GET /users/:userId/stats` — reliability numbers for the profile screen
- `POST /partners/invite` — `{ handle }`
- `POST /partners/:partnershipId/respond` — `{ accept: boolean }`
- `GET /partners`, `GET /partners/pending/sent`, `GET /partners/pending/received`
- `DELETE /partners/:userId`

### Goals
- `POST /goals`, `GET /goals/mine?status=ACTIVE`, `GET /goals/:goalId`
- `PATCH /goals/:goalId`, `DELETE /goals/:goalId` (archives, doesn't hard-delete)
- `GET /users/:userId/goals` — visibility-filtered
- `POST /goals/:goalId/milestones`, `POST /goals/:goalId/milestones/:milestoneId/achieve`
- `POST /goals/:goalId/witnesses` — `{ userId }`

### Challenges
- `GET /challenges?category=&proofRequired=&search=` (public, no auth required)
- `GET /challenges/:challengeId`, `GET /challenges/:challengeId/standings`
- `POST /challenges` (create/host one), `POST /challenges/:challengeId/join`, `POST /challenges/:challengeId/leave`
- `GET /challenges/mine`

### Sessions & proof
- `POST /sessions` — log a workout
- `GET /sessions/mine`, `GET /sessions/:sessionId`, `GET /users/:userId/sessions`
- `GET /users/:userId/consistency?weeks=16` — weekly counts for the tally chart
- `POST /sessions/:sessionId/proof` — `multipart/form-data`: `file`, `kind`, `capturedAt`, `checkInLabel?`, `witnessUserIds?`
- `GET /witness-queue` — proof waiting on your confirmation
- `POST /witness/:witnessId/respond` — `{ status: "CONFIRMED"|"QUERIED", note? }`

### Feed
- `GET /feed?scope=partners|everyone`
- `POST /feed/posts`, `GET /feed/posts/:postId`
- `POST /feed/posts/:postId/comments`
- `POST /feed/posts/:postId/react`, `DELETE /feed/posts/:postId/react`
- `POST /feed/posts/milestone`, `POST /feed/posts/missed-day`

### Settings
- `GET/PUT /settings/privacy` — `{ field, visibleTo }`
- `GET/PUT /settings/notifications` — `{ key, enabled, channel? }`

### Staking (demo)
- `GET /stake/account` — `{ freeBalance, atStake, totalBalance, returnedLast90Days, isDemo: true }`
- `GET /stake`, `GET /stake/ledger`
- `POST /stake` — `{ amount, ruleSummary, goalId | challengeId }`
- `POST /stake/:stakeId/resolve` — `{ outcome: "WON"|"LOST" }` (demo trigger — see comment in the code)
- `POST /stake/:stakeId/release` — a partner releases a stake early, no proof required
- `POST /stake/:stakeId/withdraw`

## What this is not (yet)

This is a runnable first pass, not a production deployment:

- No rate limiting, no refresh tokens (just a 30-day access token)
- No background jobs — notification "preferences" are stored but nothing sends notifications
- No automated stake resolution — `POST /stake/:id/resolve` is a manual demo trigger standing in for logic that would otherwise watch goal/challenge completion
- Local disk storage for uploads, not object storage
- No tests yet — the shape above should make them straightforward to add per module
