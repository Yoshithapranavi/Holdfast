CREATE TABLE IF NOT EXISTS daily_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "commitmentDate" timestamp NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
