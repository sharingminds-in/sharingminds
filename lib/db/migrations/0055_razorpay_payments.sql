CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "purpose" text NOT NULL,
  "status" text DEFAULT 'created' NOT NULL,
  "provider" text DEFAULT 'dummy' NOT NULL,
  "provider_mode" text DEFAULT 'test' NOT NULL,
  "provider_order_id" text,
  "provider_payment_id" text,
  "provider_subscription_id" text,
  "provider_customer_id" text,
  "related_resource_type" text,
  "related_resource_id" text,
  "amount" numeric(12,2) NOT NULL,
  "amount_subunits" integer NOT NULL,
  "currency" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_error" text,
  "expires_at" timestamp,
  "paid_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL,
  "provider_mode" text DEFAULT 'test' NOT NULL,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payment_intent_id" uuid,
  "payload" jsonb NOT NULL,
  "processed_at" timestamp,
  "processing_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_intent_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_refund_id" text,
  "provider_payment_id" text NOT NULL,
  "status" text DEFAULT 'created' NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "amount_subunits" integer NOT NULL,
  "currency" text NOT NULL,
  "reason" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "processed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_events"
  ADD CONSTRAINT "payment_events_payment_intent_id_payment_intents_id_fk"
  FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_payment_intent_id_payment_intents_id_fk"
  FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_user_id_idx" ON "payment_intents" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_status_idx" ON "payment_intents" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_provider_order_id_idx" ON "payment_intents" ("provider_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_provider_payment_id_idx" ON "payment_intents" ("provider_payment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_provider_subscription_id_idx" ON "payment_intents" ("provider_subscription_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_idempotency_key_uidx" ON "payment_intents" ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_events_provider_event_uidx" ON "payment_events" ("provider", "provider_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_events_event_type_idx" ON "payment_events" ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_events_payment_intent_id_idx" ON "payment_events" ("payment_intent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_refunds_payment_intent_id_idx" ON "payment_refunds" ("payment_intent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_refunds_provider_refund_id_idx" ON "payment_refunds" ("provider_refund_id");
--> statement-breakpoint
ALTER TABLE "subscription_plan_prices"
  ADD COLUMN IF NOT EXISTS "provider_plan_id" text;
--> statement-breakpoint
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "payment_intent_id" uuid;
--> statement-breakpoint
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_payment_intent_id_payment_intents_id_fk"
  FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_payment_intent_id_idx" ON "sessions" ("payment_intent_id");
