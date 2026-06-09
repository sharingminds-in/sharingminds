DO $$
BEGIN
  CREATE TYPE "public"."mentor_pricing_actor_role" AS ENUM('mentor', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "public"."mentor_pricing_action" AS ENUM(
    'MENTOR_RATE_SET',
    'MENTOR_RATE_UPDATED',
    'ADMIN_OVERRIDE_UPDATED',
    'ADMIN_OVERRIDE_CLEARED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mentor_pricing_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mentor_id" uuid NOT NULL,
  "actor_user_id" text,
  "actor_role" "mentor_pricing_actor_role" NOT NULL,
  "action" "mentor_pricing_action" NOT NULL,
  "previous_mentor_rate" numeric(10, 2),
  "new_mentor_rate" numeric(10, 2),
  "previous_admin_override" numeric(10, 2),
  "new_admin_override" numeric(10, 2),
  "previous_effective_rate" numeric(10, 2),
  "new_effective_rate" numeric(10, 2),
  "currency" text DEFAULT 'USD' NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mentor_pricing_audit_mentor_id_mentors_id_fk'
  ) THEN
    ALTER TABLE "mentor_pricing_audit"
      ADD CONSTRAINT "mentor_pricing_audit_mentor_id_mentors_id_fk"
      FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mentor_pricing_audit_actor_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "mentor_pricing_audit"
      ADD CONSTRAINT "mentor_pricing_audit_actor_user_id_users_id_fk"
      FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mentor_pricing_audit_mentor_created_at_idx"
  ON "mentor_pricing_audit" USING btree ("mentor_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mentor_pricing_audit_actor_created_at_idx"
  ON "mentor_pricing_audit" USING btree ("actor_user_id", "created_at");
