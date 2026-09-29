-- Migration: link verification proofs to the exact stake they verify.
-- Additive only: existing rows keep "stakeId" NULL. No data is modified.
ALTER TABLE "verification_proofs" ADD COLUMN IF NOT EXISTS "stakeId" uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'verification_proofs_stakeId_stakes_id_fk'
  ) THEN
    ALTER TABLE "verification_proofs"
      ADD CONSTRAINT "verification_proofs_stakeId_stakes_id_fk"
      FOREIGN KEY ("stakeId") REFERENCES "stakes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "verification_proofs_stake_id_idx"
  ON "verification_proofs" ("stakeId");
