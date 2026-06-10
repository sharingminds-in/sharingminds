# Infinity AI Core Implementation Plan

> Deprecated / superseded: this document is historical context only. Do not use it as the active implementation plan. Current implementation direction lives in `docs/infinity-ai-analyst-agent-upgrade-plan.md`, which supersedes this plan with the Analyst-Agent-inspired turn operating system, typed quality gates, route-specific flows, and no hardcoded assistant prose.

## Document Control

| Field | Value |
| --- | --- |
| Product | Infinity AI for SharingMinds / Young Minds |
| Document type | Corporate Engineering Implementation Plan |
| Version | 1.1 - simplified modular V1 |
| Parent PRD | `docs/infinity-ai-core-prd.md` |
| Source documents | `docs/AI philosophy/1.md`, `docs/AI philosophy/2.md`, `docs/AI philosophy/3.md` |
| Scope boundary | Implement only the PRD behavior derived from the three philosophy documents |
| Current implementation state | Prior implementation removed; only dependency scaffold remains under `services/infinity-ai` |

## 1. Purpose

This plan converts the Infinity AI Core PRD into a practical engineering execution path.

The implementation must build the product described in the PRD: decision clarity, compact-depth conversation, expert elevation, session readiness, continuity, and business-aware expert routing.

The implementation must not throw complexity at the problem. The goal is the best long-term architecture with the fewest moving parts required to satisfy the PRD.

## 2. Architecture Philosophy

### 2.1 Core Principle

Build a simple core with strong seams.

This means:

- Keep the runtime easy to understand.
- Keep modules cleanly separated.
- Keep business rules deterministic.
- Keep LLM calls structured and bounded.
- Keep data in Postgres first.
- Add external infrastructure only when current infrastructure cannot satisfy a requirement.
- Design interfaces so future systems can be swapped in without rewriting the product.

### 2.2 Complexity Admission Rule

A component is allowed only if it satisfies at least one of these conditions:

1. It is required by the PRD.
2. It removes more complexity than it adds.
3. It protects a critical business boundary.
4. It prevents a known future rewrite.
5. It gives observability needed to operate the system safely.

If a simpler Postgres table, plain Python module, or server-side function solves the requirement cleanly, use the simpler option.

### 2.3 Explicit V1 Simplicity Defaults

V1 defaults:

- Use Postgres/Supabase as the primary data store.
- Use pgvector only if available and useful; do not start with an external vector DB.
- Use a small orchestrator first; use LangGraph only as a thin graph if it genuinely simplifies state and tracing.
- Use structured Pydantic LLM outputs, not a large multi-agent system.
- Use deterministic Python code for scoring and allocation.
- Use structured logs and DB trace fields first; add Langfuse/LangSmith only when needed.
- Use DB-backed admin boost rules first; do not build a large admin UI in V1 unless separately required.
- Use manual product evaluation and smoke transcripts first; do not add automated test files unless separately approved.

### 2.4 What V1 Must Not Become

V1 must not become:

- A generic chatbot platform.
- A broad personal assistant.
- A multi-agent research system.
- A complex workflow engine for its own sake.
- A LangGraph demo.
- A prompt playground.
- A vector-search wrapper.
- A marketplace search page with AI copy.

## 3. System Boundary

### 3.1 Next.js Responsibilities

Next.js remains the platform owner.

It must own:

- Authentication.
- User session context.
- Platform policy.
- Subscription and booking rights.
- Expert eligibility hard filters.
- Booking/session creation.
- Database writes through server-side repositories.
- Browser-safe response rendering.
- Feature flags.
- Rollback to legacy behavior.

### 3.2 Python AI Service Responsibilities

Python owns the decision-clarity intelligence layer.

It must own:

- Structured LLM calls.
- Signal extraction.
- Conversation phase orchestration.
- Compact-depth response strategy.
- Mini-framework generation.
- Expert elevation language.
- Deterministic expert scoring and slot selection using platform-provided candidate data.
- Session readiness generation.
- Memory update proposals.
- Trace metadata returned to the platform.

Python must not:

- Create bookings.
- Decide subscription rights.
- Bypass eligibility filters.
- Write directly to browser-visible data.
- Treat LLM output as final business truth.

## 4. V1 Architecture

### 4.1 Components

| Component | V1 choice | Why |
| --- | --- | --- |
| Platform bridge | Existing Next.js API routes | Reuses platform auth, data, and policy |
| AI runtime | Python FastAPI service | Keeps AI orchestration separate from Vercel/runtime constraints |
| Orchestration | Small explicit orchestrator, optionally backed by thin LangGraph | Avoids oversized graph while preserving future graph upgrade path |
| LLM contracts | Pydantic schemas | Prevents unstructured model output from controlling the system |
| Persistence | Postgres/Supabase | Existing source of relational truth |
| Vector retrieval | pgvector only if available; otherwise defer embeddings behind interface | Avoids adding Qdrant/Pinecone too early |
| Observability | Structured logs + persisted trace metadata first | Enough for V1 debugging without external platform dependency |
| Analytics | Existing analytics or simple event table first | Avoids analytics-platform migration before product proof |
| Admin controls | DB-backed rules first | Satisfies boost/allocation requirements without full admin UI |

### 4.2 Orchestrator Shape

The orchestrator should be a small pipeline, not a large agent network.

V1 pipeline:

```text
load_context
  -> extract_signals
  -> choose_conversation_step
  -> maybe_generate_framework
  -> maybe_retrieve_experts
  -> maybe_rank_and_select_experts
  -> maybe_generate_session_readiness
  -> assemble_response_blocks
  -> return_trace_and_state_updates
```

Each step must be a separate function/module with typed input and output.

LangGraph may be used only as a thin wrapper around these steps if it improves checkpointing, traceability, or state flow. Do not create many tiny graph nodes if plain module calls are clearer.

### 4.3 Initial Python Folder Structure

Keep the service smaller than the earlier plan.

```text
services/infinity-ai/
  app/
    main.py
    api/
      health.py
      conversations.py
    core/
      config.py
      errors.py
      logging.py
      security.py
    llm/
      provider.py
      gemini_provider.py
      openai_provider.py
      schemas.py
      prompts.py
    orchestration/
      pipeline.py
      state.py
      response_blocks.py
    signals/
      extractor.py
      models.py
      normalizer.py
    matching/
      models.py
      scoring.py
      allocation.py
      slots.py
    readiness/
      generator.py
      models.py
    memory/
      models.py
      summarizer.py
    adapters/
      platform_client.py
```

Create subfolders later only when files become too large or responsibilities genuinely split.

### 4.4 Initial Next.js Folder Structure

```text
app/api/infinity-ai/
  conversations/route.ts
  conversations/[conversationId]/message/route.ts
  events/route.ts
app/api/internal/infinity-ai/
  policy/route.ts
  experts/route.ts
  persist/route.ts
lib/infinity-ai/
  config.ts
  schemas.ts
  client.ts
  repository.ts
  policy.ts
  expert-candidates.ts
components/landing/infinity-ai/
  InfinityAiPanel.tsx
  ResponseBlockRenderer.tsx
  ExpertCards.tsx
```

Do not create extra routes until a real consumer exists.

## 5. Data Model Plan

### 5.1 Data Model Principle

Use fewer tables in V1. Prefer JSON snapshots for low-volume, evolving AI metadata. Normalize only what must be queried, audited, or joined frequently.

The PRD requires traceability, scoring, memory, admin controls, and behavioral learning. It does not require a separate table for every future metric on day one.

### 5.2 V1 Tables

#### `ai_conversations`

Purpose: conversation lifecycle and current state.

Required fields:

- `id`
- `user_id` nullable
- `anonymous_session_id` nullable
- `surface`
- `status`
- `phase`
- `depth_mode`
- `signal_snapshot` JSON
- `memory_snapshot` JSON
- `readiness_snapshot` JSON nullable
- `created_at`
- `updated_at`

#### `ai_turns`

Purpose: user/assistant turns, response blocks, and trace metadata.

Required fields:

- `id`
- `conversation_id`
- `actor`
- `input_text` nullable
- `response_blocks` JSON nullable
- `signal_delta` JSON nullable
- `model_metadata` JSON nullable
- `trace_metadata` JSON nullable
- `created_at`

#### `ai_user_signals`

Purpose: durable normalized user signals with provenance.

Required fields:

- `id`
- `conversation_id`
- `user_id` nullable
- `signal_type`
- `signal_value`
- `confidence`
- `evidence` JSON
- `source_turn_id` nullable
- `created_at`
- `updated_at`

#### `ai_expert_profiles`

Purpose: AI-facing metadata attached to existing mentor profiles.

Required fields:

- `id`
- `mentor_profile_id`
- `mentor_user_id`
- `intent_tags` JSON
- `outcome_tags` JSON
- `industry_tags` JSON
- `persona_fit_tags` JSON
- `keyword_trust_score`
- `content_authority_score`
- `quality_score`
- `conversion_score`
- `allocation_snapshot` JSON
- `metadata_quality_status`
- `created_at`
- `updated_at`

Use existing mentor, session, booking, and review tables as source of truth. This table stores AI-facing derived metadata only.

#### `ai_admin_boost_rules`

Purpose: controlled business priority.

Required fields:

- `id`
- `mentor_profile_id`
- `rule_type`
- `category_scope` JSON
- `priority_multiplier`
- `inclusion_percentage_cap`
- `max_impressions` nullable
- `starts_at`
- `expires_at`
- `status`
- `reason`
- `created_by`
- `created_at`
- `updated_at`

#### `ai_recommendation_runs`

Purpose: one traceable recommendation attempt.

Required fields:

- `id`
- `conversation_id`
- `user_id` nullable
- `input_signal_snapshot` JSON
- `algorithm_version`
- `candidate_count`
- `selected_count`
- `trace_metadata` JSON
- `created_at`

#### `ai_recommendation_candidates`

Purpose: candidate-level score breakdown and selected slots.

Required fields:

- `id`
- `run_id`
- `mentor_profile_id`
- `mentor_user_id`
- `eligibility_status`
- `intent_match_score`
- `outcome_match_score`
- `persona_match_score`
- `expertise_relevance_score`
- `conversion_probability_score`
- `admin_priority_score`
- `exposure_balancing_score`
- `final_score`
- `slot_type` nullable
- `selected`
- `score_explanation` JSON
- `created_at`

#### `ai_recommendation_events`

Purpose: impressions, clicks, bookings, completions, reviews, and repeat-booking attribution.

Required fields:

- `id`
- `run_id` nullable
- `conversation_id` nullable
- `user_id` nullable
- `mentor_profile_id` nullable
- `event_type`
- `metadata` JSON
- `idempotency_key`
- `created_at`

#### `ai_memory_items`

Purpose: continuity memory with provenance.

Required fields:

- `id`
- `user_id`
- `conversation_id` nullable
- `memory_type`
- `content`
- `confidence`
- `provenance` JSON
- `created_at`
- `updated_at`

#### `ai_embeddings`

Purpose: optional unified pgvector table for expert/content/course retrieval.

Create this only if pgvector is available and candidate retrieval needs it in V1.

Required fields if created:

- `id`
- `entity_type`
- `entity_id`
- `embedding_model`
- `embedding_vector`
- `text_content`
- `metadata` JSON
- `created_at`
- `updated_at`

### 5.3 What Not To Add In V1

Do not add these as separate V1 tables unless Phase 0 proves they are necessary immediately:

- Separate expert performance metrics table.
- Separate allocation metrics table.
- Separate session readiness table.
- Separate evaluation table.
- Separate LLM run table.

Store these as JSON snapshots, recommendation events, or derived queries first. Split into tables later when query volume, reporting needs, or data ownership requires it.

## 6. API Plan

### 6.1 Public Next.js APIs

Keep only three public-facing platform routes in V1.

#### `POST /api/infinity-ai/conversations`

Creates or resumes a conversation.

#### `POST /api/infinity-ai/conversations/:conversationId/message`

Sends a message through the platform bridge to Python and persists the result.

#### `POST /api/infinity-ai/events`

Records safe user events such as expert-card impression, click, booking attribution, completion attribution, or review attribution.

### 6.2 Internal Next.js APIs For Python

Keep only three internal routes in V1.

#### `POST /api/internal/infinity-ai/policy`

Returns auth and policy context.

#### `POST /api/internal/infinity-ai/experts`

Returns eligible expert candidates and required scoring metadata.

#### `POST /api/internal/infinity-ai/persist`

Persists state updates, turns, signals, recommendation runs, candidates, events, and memory updates after server validation.

This combined persistence route avoids route sprawl in V1. It can be split later if it becomes too broad.

### 6.3 Python APIs

Keep Python public service surface minimal.

#### `GET /health`

Health check.

#### `POST /v1/conversations/:conversationId/message`

Main orchestration endpoint.

Response must include:

- `response_blocks`
- `state_updates`
- `signal_updates`
- `recommendation_run` nullable
- `memory_updates`
- `trace_metadata`

## 7. LLM Usage Plan

### 7.1 V1 LLM Calls

Use at most three LLM calls for a normal meaningful decision turn:

1. Signal extraction.
2. Response strategy and mini-framework generation.
3. Expert elevation or session readiness generation only when needed.

If a turn does not require expert elevation or readiness, do not call that module.

### 7.2 Structured Output Required

Every LLM call must return a strict schema.

Required schemas:

- `ExtractedSignals`
- `ConversationStrategy`
- `MiniFrameworkDraft`
- `ExpertElevationDraft`
- `SessionReadinessDraft`
- `MemoryUpdateDraft`

### 7.3 Prompt Organization

Use a small number of versioned prompt functions in `llm/prompts.py` first.

Split into multiple prompt files only when prompt size or ownership makes it necessary.

### 7.4 No Silent Fallback

If required LLM mode is enabled and the provider fails, fail clearly. Do not silently return deterministic placeholder content that looks like real AI output.

## 8. Conversation Orchestration Plan

### 8.1 Phases

V1 supports these phases:

- `discovery`
- `clarifying`
- `mini_clarity`
- `micro_consent`
- `framework`
- `expert_elevation`
- `expert_recommendation`
- `session_readiness`
- `continuity`

### 8.2 Pipeline Logic

The pipeline must:

1. Load conversation state and memory.
2. Extract signals with evidence.
3. Merge signals into current state.
4. Choose the next conversation phase.
5. Generate compact response content.
6. Ask micro-consent when deeper framework is useful.
7. Generate mini-framework only when consent/context supports it.
8. Retrieve experts only when expert elevation is earned or explicitly appropriate.
9. Score and allocate experts deterministically.
10. Assemble response blocks.
11. Return trace metadata and persistence updates.

### 8.3 Sparse Context Behavior

If context is sparse, ask one high-signal clarification question. Do not fabricate confidence.

### 8.4 Unrelated Input Behavior

If user input is outside decision clarity or expert routing, respond briefly and steer back to supported use cases. This behavior must be context-aware and LLM-driven through the strategy schema, not phrase maps.

## 9. Expert Ranking Plan

### 9.1 Required Formula

The scoring formula is unchanged from the PRD:

```text
final_score =
  intent_match_score * 0.30 +
  outcome_match_score * 0.20 +
  persona_match_score * 0.10 +
  expertise_relevance_score * 0.15 +
  conversion_probability_score * 0.10 +
  admin_priority_score * 0.10 +
  exposure_balancing_score * 0.05
```

Each sub-score is normalized to `0.0-1.0`.

### 9.2 V1 Implementation Simplicity

Use plain deterministic Python functions:

- `score_intent_match`
- `score_outcome_match`
- `score_persona_match`
- `score_expertise_relevance`
- `score_conversion_probability`
- `score_admin_priority`
- `score_exposure_balancing`
- `select_slots`

Do not use an LLM for final ranking.

### 9.3 Candidate Retrieval

V1 candidate retrieval order:

1. Platform hard eligibility filters.
2. Tag/metadata matching from existing expert data and `ai_expert_profiles`.
3. pgvector retrieval if available and populated.
4. Never show weak candidates just to fill slots.

### 9.4 Slot Selection

Select up to three experts:

- Slot 1: best relevance.
- Slot 2: high trust/conversion among relevant candidates.
- Slot 3: discovery/fairness/featured among relevant candidates.

Every selected expert must pass a minimum relevance threshold.

### 9.5 Admin And Allocation In V1

Keep admin controls simple:

- Store boost rules in DB.
- Apply boost only inside `admin_priority_score`.
- Enforce expiry and category scope.
- Enforce inclusion cap where event data exists.
- Never allow boost to override hard eligibility or minimum relevance.

Exposure balancing can start with:

- recent impressions from `ai_recommendation_events`
- last shown timestamp
- simple fatigue penalty
- underexposed expert boost within relevance threshold

## 10. Response Block Plan

V1 response blocks:

- `reflection`
- `clarification`
- `insight`
- `direction`
- `micro_consent`
- `mini_framework`
- `expert_elevation`
- `expert_cards`
- `session_readiness`
- `continuity`
- `no_match`
- `system_notice`

The frontend renderer must be simple. Do not create a complex visual system before the response contract is proven.

## 11. Observability Plan

### 11.1 V1 Observability

Use structured logs and persisted trace metadata first.

Each turn must capture:

- trace ID
- conversation ID
- phase before/after
- LLM calls made
- provider/model
- latency
- token usage if provider returns it
- extracted signal summary
- ranking run ID if any
- selected expert IDs if any
- errors

### 11.2 Defer External Observability Platform

Do not require Langfuse, LangSmith, or another external observability platform in V1.

Add provider-neutral hooks so one can be added later without rewriting the pipeline.

## 12. Phase Plan

### Phase 0: Current Data Audit And Final Simplicity Decisions

Goal: decide the minimum implementation surface from actual current platform data.

Tasks:

- Inspect existing user, mentor, session, booking, review, content, course, subscription, and admin tables.
- Map PRD fields to existing data.
- Identify only truly missing AI fields.
- Decide whether pgvector exists and is usable now.
- Decide whether anonymous homepage use is supported in V1.
- Decide initial LLM provider and required/fail-closed behavior.
- Decide if thin LangGraph is useful or if explicit orchestrator is enough for V1.

Deliverables:

- Data map.
- Gap list.
- Final V1 architecture note.
- Migration list limited to required tables.

Review gate:

- Every planned table, route, and external dependency has a clear reason.

### Phase 1: Minimal Service And Platform Bridge

Goal: establish the service boundary without product logic.

Tasks:

- Create FastAPI app.
- Add health endpoint.
- Add config and internal auth.
- Add structured JSON logging.
- Add LLM provider interface.
- Add Next.js client and minimal API routes.
- Add feature flags.

Deliverables:

- Python service starts locally.
- Next can call Python health/status.
- No user-facing AI behavior yet.

Review gate:

- Boundary is clean and reversible.

### Phase 2: Minimal Data Foundation

Goal: add only the durable data needed for V1.

Tasks:

- Add V1 AI tables from Section 5.2.
- Add indexes for conversation, recommendation, candidate, and event lookup.
- Add server-only access policies.
- Add repository functions.
- Avoid optional split tables unless Phase 0 proved they are required.

Deliverables:

- Additive migration.
- Schema exports.
- Repository layer.

Review gate:

- Migration is isolated and does not alter unrelated legacy behavior.

### Phase 3: Decision-Clarity Conversation Core

Goal: implement the core PRD conversation behavior before matching.

Tasks:

- Implement conversation state.
- Implement signal extraction.
- Implement signal normalization and provenance.
- Implement conversation strategy.
- Implement compact response blocks.
- Implement micro-consent.
- Implement mini-framework generation.
- Persist conversation turns and signals.

Deliverables:

- User can move through discovery, clarification, mini-clarity, micro-consent, and framework.
- Trace metadata exists.
- No expert cards yet unless Phase 4 is complete.

Review gate:

- Output feels like decision clarity, not generic chatbot text.
- No hardcoded phrase maps are used as primary intelligence.

### Phase 4: Expert Retrieval, Ranking, And Allocation

Goal: implement business-aware expert routing.

Tasks:

- Build internal eligible-candidate endpoint.
- Populate or derive `ai_expert_profiles` metadata.
- Implement seven scoring functions.
- Implement simple admin boost rules.
- Implement exposure balancing from events.
- Implement slot selection.
- Persist recommendation run and candidate breakdowns.

Deliverables:

- Deterministic ranking engine.
- Candidate score breakdowns.
- Up to three selected experts.

Review gate:

- LLM does not choose final experts.
- Score formula matches PRD.
- Boosts cannot rescue irrelevant experts.
- Exposure balancing affects results.

### Phase 5: Expert Elevation, Readiness, And UI

Goal: connect ranking to the actual user experience.

Tasks:

- Generate contextual expert elevation copy.
- Render expert cards.
- Record impressions and clicks.
- Generate session readiness block.
- Store readiness snapshot.
- Keep booking/session creation in platform code.

Deliverables:

- Homepage AI can guide from uncertainty to contextual expert recommendation.
- Expert cards are contextual and limited to 2-3.
- Session readiness appears when appropriate.

Review gate:

- No marketplace dump.
- No salesy jump to booking.
- User receives compact clarity before expert recommendation.

### Phase 6: Continuity And Launch Readiness

Goal: make V1 durable and reviewable.

Tasks:

- Persist memory items with provenance.
- Hydrate memory for returning authenticated users.
- Store session/post-session action points as memory items when available.
- Add live smoke flows for the eight PRD scenarios.
- Review traces and transcripts manually.
- Verify rollback flags.

Deliverables:

- Memory foundation.
- Manual product review transcripts.
- Launch checklist.
- Rollback checklist.

Review gate:

- Returning users do not restart from zero when memory exists.
- All eight source-document scenarios pass product review.
- Automated test files are not added unless separately approved.

## 13. Feature Flags

Required V1 flags:

- `INFINITY_AI_ENABLED`
- `NEXT_PUBLIC_INFINITY_AI_ENABLED`
- `INFINITY_AI_REQUIRE_LLM`
- `INFINITY_AI_ANONYMOUS_ENABLED`
- `INFINITY_AI_PGVECTOR_ENABLED`
- `INFINITY_AI_ADMIN_BOOSTS_ENABLED`

Do not add provider-specific flags unless needed.

## 14. Environment Variables

Required V1 variables:

- `INFINITY_AI_SERVICE_URL`
- `INFINITY_AI_INTERNAL_SECRET`
- `INFINITY_AI_LLM_PROVIDER`
- `INFINITY_AI_LLM_API_KEY`

Optional V1 variables:

- `INFINITY_AI_EMBEDDING_PROVIDER`
- `INFINITY_AI_EMBEDDING_API_KEY`
- `INFINITY_AI_TRACE_SAMPLE_RATE`

Do not require observability or analytics vendor secrets for V1 unless the vendor is actually enabled.

## 15. Rollback Strategy

Rollback must be simple:

1. Disable `NEXT_PUBLIC_INFINITY_AI_ENABLED`.
2. Disable `INFINITY_AI_ENABLED`.
3. Stop Python service if needed.
4. Keep additive AI tables for audit.
5. Keep platform booking/session flows unchanged.
6. Restore legacy homepage path if it still exists.

## 16. Review Checklist

Before implementation is accepted, reviewers must verify:

- Every component exists for a PRD reason.
- No unnecessary external service was introduced.
- The runtime is understandable without reading dozens of modules.
- LLM calls use structured schemas.
- Business rules are deterministic.
- Final expert ranking is deterministic.
- The seven-layer scoring formula is preserved.
- Recommendations are contextual and capped at 2-3 experts.
- Admin boosts are constrained.
- Exposure balancing exists in simple form.
- Memory has provenance.
- Trace metadata explains every important decision.
- Product outputs match the three source documents.

## 17. Definition Of Done

V1 is done only when:

- The decision-clarity arc works end to end.
- The system gives compact clarity before expert elevation.
- The system recommends experts through deterministic ranking and slot selection.
- The system persists conversation, signals, recommendation runs, candidates, events, and memory.
- The system supports admin boosts and exposure balancing without overengineering.
- The system supports session readiness.
- The system supports returning-user continuity.
- Manual product review validates the eight source-document scenarios.
- Feature flags and rollback work.
- The implementation remains simple enough to understand, operate, and extend.
