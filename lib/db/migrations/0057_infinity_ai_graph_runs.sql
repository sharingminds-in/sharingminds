CREATE TABLE IF NOT EXISTS "ai_graph_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_turn_id" uuid,
  "assistant_turn_id" uuid,
  "graph_version" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "phase_before" text,
  "phase_after" text,
  "state_before" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "state_after" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "node_traces" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "model_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "selected_expert_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "recommendation_run_id" uuid,
  "error" jsonb,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_graph_runs"
  ADD CONSTRAINT "ai_graph_runs_conversation_id_ai_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_graph_runs"
  ADD CONSTRAINT "ai_graph_runs_user_turn_id_ai_turns_id_fk"
  FOREIGN KEY ("user_turn_id") REFERENCES "public"."ai_turns"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_graph_runs"
  ADD CONSTRAINT "ai_graph_runs_assistant_turn_id_ai_turns_id_fk"
  FOREIGN KEY ("assistant_turn_id") REFERENCES "public"."ai_turns"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_graph_runs"
  ADD CONSTRAINT "ai_graph_runs_recommendation_run_id_ai_recommendation_runs_id_fk"
  FOREIGN KEY ("recommendation_run_id") REFERENCES "public"."ai_recommendation_runs"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_graph_runs_conversation_created_idx"
  ON "ai_graph_runs" ("conversation_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_graph_runs_user_turn_idx"
  ON "ai_graph_runs" ("user_turn_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_graph_runs_status_idx"
  ON "ai_graph_runs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_graph_runs_recommendation_run_idx"
  ON "ai_graph_runs" ("recommendation_run_id");
--> statement-breakpoint
ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_turns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_user_signals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_expert_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_admin_boost_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_candidates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_recommendation_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_memory_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_graph_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_conversations_service_role_all" ON "ai_conversations";
--> statement-breakpoint
CREATE POLICY "ai_conversations_service_role_all"
  ON "ai_conversations" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_turns_service_role_all" ON "ai_turns";
--> statement-breakpoint
CREATE POLICY "ai_turns_service_role_all"
  ON "ai_turns" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_user_signals_service_role_all" ON "ai_user_signals";
--> statement-breakpoint
CREATE POLICY "ai_user_signals_service_role_all"
  ON "ai_user_signals" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_expert_profiles_service_role_all" ON "ai_expert_profiles";
--> statement-breakpoint
CREATE POLICY "ai_expert_profiles_service_role_all"
  ON "ai_expert_profiles" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_admin_boost_rules_service_role_all" ON "ai_admin_boost_rules";
--> statement-breakpoint
CREATE POLICY "ai_admin_boost_rules_service_role_all"
  ON "ai_admin_boost_rules" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_recommendation_runs_service_role_all" ON "ai_recommendation_runs";
--> statement-breakpoint
CREATE POLICY "ai_recommendation_runs_service_role_all"
  ON "ai_recommendation_runs" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_recommendation_candidates_service_role_all" ON "ai_recommendation_candidates";
--> statement-breakpoint
CREATE POLICY "ai_recommendation_candidates_service_role_all"
  ON "ai_recommendation_candidates" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_recommendation_events_service_role_all" ON "ai_recommendation_events";
--> statement-breakpoint
CREATE POLICY "ai_recommendation_events_service_role_all"
  ON "ai_recommendation_events" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_memory_items_service_role_all" ON "ai_memory_items";
--> statement-breakpoint
CREATE POLICY "ai_memory_items_service_role_all"
  ON "ai_memory_items" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_graph_runs_service_role_all" ON "ai_graph_runs";
--> statement-breakpoint
CREATE POLICY "ai_graph_runs_service_role_all"
  ON "ai_graph_runs" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
