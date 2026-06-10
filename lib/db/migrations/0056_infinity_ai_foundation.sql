CREATE TABLE IF NOT EXISTS "ai_admin_boost_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mentor_profile_id" uuid NOT NULL,
  "rule_type" text NOT NULL,
  "category_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "priority_multiplier" numeric(6,3) DEFAULT '1.000' NOT NULL,
  "inclusion_percentage_cap" integer DEFAULT 100 NOT NULL,
  "max_impressions" integer,
  "starts_at" timestamp NOT NULL,
  "expires_at" timestamp NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "reason" text NOT NULL,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text,
  "anonymous_session_id" text,
  "surface" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "phase" text DEFAULT 'discovery' NOT NULL,
  "depth_mode" text DEFAULT 'light' NOT NULL,
  "signal_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "memory_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "readiness_snapshot" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_expert_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mentor_profile_id" uuid NOT NULL,
  "mentor_user_id" text NOT NULL,
  "intent_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "outcome_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "industry_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "persona_fit_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "keyword_trust_score" numeric(4,3) DEFAULT '0.500' NOT NULL,
  "content_authority_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "quality_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "conversion_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "allocation_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata_quality_status" text DEFAULT 'derived' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_memory_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "conversation_id" uuid,
  "memory_type" text NOT NULL,
  "content" text NOT NULL,
  "confidence" numeric(4,3) DEFAULT '0.500' NOT NULL,
  "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_recommendation_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "mentor_profile_id" uuid NOT NULL,
  "mentor_user_id" text NOT NULL,
  "eligibility_status" text DEFAULT 'eligible' NOT NULL,
  "intent_match_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "outcome_match_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "persona_match_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "expertise_relevance_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "conversion_probability_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "admin_priority_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "exposure_balancing_score" numeric(4,3) DEFAULT '0.000' NOT NULL,
  "final_score" numeric(5,4) DEFAULT '0.0000' NOT NULL,
  "slot_type" text,
  "selected" boolean DEFAULT false NOT NULL,
  "score_explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_recommendation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid,
  "conversation_id" uuid,
  "user_id" text,
  "mentor_profile_id" uuid,
  "candidate_type" text,
  "entity_id" text,
  "mentor_user_id" text,
  "resource_type" text,
  "resource_id" uuid,
  "event_type" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_recommendation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" text,
  "input_signal_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "algorithm_version" text NOT NULL,
  "candidate_count" integer DEFAULT 0 NOT NULL,
  "selected_count" integer DEFAULT 0 NOT NULL,
  "trace_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "actor" text NOT NULL,
  "input_text" text,
  "response_blocks" jsonb,
  "signal_delta" jsonb,
  "model_metadata" jsonb,
  "trace_metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_user_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" text,
  "signal_type" text NOT NULL,
  "signal_value" text NOT NULL,
  "confidence" numeric(4,3) DEFAULT '0.500' NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_turn_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_admin_boost_rules"
  ADD CONSTRAINT "ai_admin_boost_rules_mentor_profile_id_mentors_id_fk"
  FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentors"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_admin_boost_rules"
  ADD CONSTRAINT "ai_admin_boost_rules_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_conversations"
  ADD CONSTRAINT "ai_conversations_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_expert_profiles"
  ADD CONSTRAINT "ai_expert_profiles_mentor_profile_id_mentors_id_fk"
  FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentors"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_expert_profiles"
  ADD CONSTRAINT "ai_expert_profiles_mentor_user_id_users_id_fk"
  FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_memory_items"
  ADD CONSTRAINT "ai_memory_items_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_memory_items"
  ADD CONSTRAINT "ai_memory_items_conversation_id_ai_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_candidates"
  ADD CONSTRAINT "ai_recommendation_candidates_run_id_ai_recommendation_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."ai_recommendation_runs"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_candidates"
  ADD CONSTRAINT "ai_recommendation_candidates_mentor_profile_id_mentors_id_fk"
  FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentors"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_candidates"
  ADD CONSTRAINT "ai_recommendation_candidates_mentor_user_id_users_id_fk"
  FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_events"
  ADD CONSTRAINT "ai_recommendation_events_run_id_ai_recommendation_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."ai_recommendation_runs"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_events"
  ADD CONSTRAINT "ai_recommendation_events_conversation_id_ai_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_events"
  ADD CONSTRAINT "ai_recommendation_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_events"
  ADD CONSTRAINT "ai_recommendation_events_mentor_profile_id_mentors_id_fk"
  FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentors"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_events"
  ADD CONSTRAINT "ai_recommendation_events_mentor_user_id_users_id_fk"
  FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_runs"
  ADD CONSTRAINT "ai_recommendation_runs_conversation_id_ai_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_runs"
  ADD CONSTRAINT "ai_recommendation_runs_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_turns"
  ADD CONSTRAINT "ai_turns_conversation_id_ai_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_user_signals"
  ADD CONSTRAINT "ai_user_signals_conversation_id_ai_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_user_signals"
  ADD CONSTRAINT "ai_user_signals_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_user_signals"
  ADD CONSTRAINT "ai_user_signals_source_turn_id_ai_turns_id_fk"
  FOREIGN KEY ("source_turn_id") REFERENCES "public"."ai_turns"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_admin_boost_rules_mentor_status_idx"
  ON "ai_admin_boost_rules" ("mentor_profile_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_admin_boost_rules_starts_at_idx"
  ON "ai_admin_boost_rules" ("starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_admin_boost_rules_expires_at_idx"
  ON "ai_admin_boost_rules" ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_conversations_user_surface_idx"
  ON "ai_conversations" ("user_id", "surface");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_conversations_anonymous_surface_idx"
  ON "ai_conversations" ("anonymous_session_id", "surface");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_conversations_updated_at_idx"
  ON "ai_conversations" ("updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_expert_profiles_mentor_profile_uidx"
  ON "ai_expert_profiles" ("mentor_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_expert_profiles_mentor_user_idx"
  ON "ai_expert_profiles" ("mentor_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_expert_profiles_quality_status_idx"
  ON "ai_expert_profiles" ("metadata_quality_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_memory_items_user_type_idx"
  ON "ai_memory_items" ("user_id", "memory_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_memory_items_user_updated_idx"
  ON "ai_memory_items" ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_candidates_run_mentor_idx"
  ON "ai_recommendation_candidates" ("run_id", "mentor_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_candidates_run_selected_idx"
  ON "ai_recommendation_candidates" ("run_id", "selected");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_recommendation_events_idempotency_uidx"
  ON "ai_recommendation_events" ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_events_conversation_event_idx"
  ON "ai_recommendation_events" ("conversation_id", "event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_events_mentor_event_idx"
  ON "ai_recommendation_events" ("mentor_profile_id", "event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_events_mentor_user_event_idx"
  ON "ai_recommendation_events" ("mentor_user_id", "event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_events_candidate_event_idx"
  ON "ai_recommendation_events" ("candidate_type", "entity_id", "event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_events_resource_event_idx"
  ON "ai_recommendation_events" ("resource_type", "resource_id", "event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_events_run_idx"
  ON "ai_recommendation_events" ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_events_created_at_idx"
  ON "ai_recommendation_events" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_runs_conversation_created_idx"
  ON "ai_recommendation_runs" ("conversation_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_recommendation_runs_user_created_idx"
  ON "ai_recommendation_runs" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_turns_conversation_created_idx"
  ON "ai_turns" ("conversation_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_user_signals_conversation_type_idx"
  ON "ai_user_signals" ("conversation_id", "signal_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_user_signals_user_type_idx"
  ON "ai_user_signals" ("user_id", "signal_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_user_signals_updated_at_idx"
  ON "ai_user_signals" ("updated_at");
