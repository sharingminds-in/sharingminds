-- Manual cleanup for withdrawn AI Foundation tables.
--
-- This file is intentionally manual-only and is not part of the Drizzle
-- migration journal. Review before running against any environment.
--
-- Do not drop legacy chatbot tables:
--   - ai_chatbot_messages
--   - ai_chatbot_message_insights

DROP TABLE IF EXISTS ai_tool_calls;
DROP TABLE IF EXISTS ai_llm_tool_calls;
DROP TABLE IF EXISTS ai_llm_runs;

DROP TABLE IF EXISTS ai_recommendation_events;
DROP TABLE IF EXISTS ai_recommendation_candidates;
DROP TABLE IF EXISTS ai_recommendation_runs;

DROP TABLE IF EXISTS ai_session_readiness_notes;
DROP TABLE IF EXISTS ai_memory_items;
DROP TABLE IF EXISTS ai_user_signals;
DROP TABLE IF EXISTS ai_turns;
DROP TABLE IF EXISTS ai_conversations;

DROP TABLE IF EXISTS ai_embeddings;
DROP TABLE IF EXISTS ai_evaluation_cases;

DROP TABLE IF EXISTS ai_admin_boost_rules;
DROP TABLE IF EXISTS ai_expert_allocation_metrics;
DROP TABLE IF EXISTS ai_allocation_metrics;
DROP TABLE IF EXISTS ai_expert_performance_metrics;
DROP TABLE IF EXISTS ai_expert_intelligence;
DROP TABLE IF EXISTS ai_expert_profiles;
