DO $$
BEGIN
  CREATE TYPE "mentor_creation_source" AS ENUM ('SELF_REGISTERED', 'ADMIN_CREATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "mentors"
  ADD COLUMN IF NOT EXISTS "creation_source" "mentor_creation_source" DEFAULT 'SELF_REGISTERED' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mentors"
  ADD COLUMN IF NOT EXISTS "created_by_admin_id" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mentors_created_by_admin_id_users_id_fk'
  ) THEN
    ALTER TABLE "mentors"
      ADD CONSTRAINT "mentors_created_by_admin_id_users_id_fk"
      FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
