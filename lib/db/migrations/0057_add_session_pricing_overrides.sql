ALTER TABLE "mentors"
  ADD COLUMN IF NOT EXISTS "admin_hourly_rate_override" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "mentors"
  ADD COLUMN IF NOT EXISTS "rate_override_reason" text;
--> statement-breakpoint
ALTER TABLE "mentors"
  ADD COLUMN IF NOT EXISTS "rate_overridden_at" timestamp;
--> statement-breakpoint
ALTER TABLE "mentors"
  ADD COLUMN IF NOT EXISTS "rate_overridden_by" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mentors_rate_overridden_by_users_id_fk'
  ) THEN
    ALTER TABLE "mentors"
      ADD CONSTRAINT "mentors_rate_overridden_by_users_id_fk"
      FOREIGN KEY ("rate_overridden_by") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "hourly_rate_snapshot" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "rate_source" text;
