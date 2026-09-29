# Holdfast

Fitness Accountability Staking Network.

## Tech Stack

- Next.js
- React
- TypeScript
- Better Auth
- Drizzle ORM
- PostgreSQL
- Stripe
- Vercel Blob
- Tailwind CSS

## Local Setup

```sh
pnpm install
pnpm dev
pnpm build
pnpm start
```

## Environment Variables

See `.env.example` for the required variable names. Do not commit real values.

- `DATABASE_URL` — PostgreSQL connection string used by Drizzle ORM.
- `STRIPE_SECRET_KEY` — Stripe secret key used to create checkout sessions and confirm payments.
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret used to verify webhook events.
- `ADMIN_EMAILS` — Comma-separated allowlist of admin emails for proof review.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token required for production video proof uploads.
- `BETTER_AUTH_SECRET` — Secret used by Better Auth for session handling.
- `BETTER_AUTH_URL` — Canonical base URL used by Better Auth.

## Database

The SQL files under `drizzle/` are production migrations and must be applied to the target PostgreSQL database before deployment.

- `0001_add_stake_id_to_verification_proofs.sql`
- `0002_add_goal_id_to_stakes.sql`

These migrations are not automatically applied by the application.

## Stripe Staking Flow

Current flow:

checkout -> Stripe payment -> confirm/webhook -> recordPaidCheckout

Canonical webhook endpoint:

```text
POST /api/staking/webhook
```

The Stripe webhook handles `checkout.session.completed`.

The endpoint must be configured in Stripe with the matching webhook secret.

## Video Proofs

- Production requires `BLOB_READ_WRITE_TOKEN`.
- `public/uploads/` is a local fallback and is not persistent storage on Vercel.

## Admin

`ADMIN_EMAILS` controls access to admin proof review.

## Deployment Notes

- Set the required environment variables in the deployment platform.
- Apply the two database migrations to the production database.
- Configure the Stripe webhook to `/api/staking/webhook`.
- Ensure `BLOB_READ_WRITE_TOKEN` is configured before relying on video proof uploads.
