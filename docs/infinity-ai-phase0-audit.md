# Infinity AI Phase 0 Audit

> Deprecated / superseded: this audit was written for the older Infinity AI Core PRD and implementation plan. Keep it as historical platform context only. Current implementation direction lives in `docs/infinity-ai-analyst-agent-upgrade-plan.md`.

## Scope

This audit maps the current Young Minds platform data to the Infinity AI Core PRD and `docs/infinity-ai-core-implementation-plan.md`.

It is intentionally limited to the platform areas the implementation plan calls out:

- users
- mentors
- sessions / bookings
- reviews
- subscriptions / policy controls
- content / courses
- admin controls

## Current Platform Data Map

### Users

Source tables:

- `users`
- `roles`
- `user_roles`
- `auth_sessions`, `auth_accounts`, `auth_verifications`

Available for Infinity:

- stable platform user id
- email / name / image
- account status
- role resolution through `user_roles`

Infinity V1 decision:

- reuse `users.id` as the durable authenticated actor key
- support anonymous visitors separately with `anonymous_session_id`

### Mentors / Experts

Source tables:

- `mentors`
- `users`
- `mentor_availability_*`
- `subscriptions`
- `subscription_usage_tracking`
- `subscription_usage_events`

Available for Infinity:

- mentor profile id: `mentors.id`
- mentor user id: `mentors.userId`
- title / company / industry / expertise / experience
- pricing and currency
- availability flag
- verification status
- location fields
- search mode (`AI_SEARCH` vs `EXCLUSIVE_SEARCH`)
- expert flag

Observed data shape:

- mentor expertise is mixed: some rows are comma-separated text, some are JSON-like strings
- `search_mode` already exists and can be used as a hard AI eligibility filter
- mentor availability and subscription policy data already exist outside the AI system

Infinity V1 decision:

- keep mentor/session/subscription truth in existing tables
- create `ai_expert_profiles` only for AI-facing derived metadata and scoring inputs
- do not create a separate expert master table

### Sessions / Bookings

Source tables:

- `sessions`
- `session_policies`
- `session_audit_log`
- `reschedule_requests`
- `payments`

Available for Infinity:

- booking/session id
- mentor / mentee user ids
- title / description
- session status
- session type
- `booking_source`
- scheduled time / duration
- mentor / mentee notes
- review completion flags

Observed data shape:

- `sessions.booking_source` already includes `ai`
- live booking flow already distinguishes AI booking pricing and entitlement checks

Infinity V1 decision:

- keep booking creation in existing platform code
- use `booking_source='ai'` plus `ai_recommendation_events` for AI attribution
- do not add AI columns to `sessions` in V1

### Reviews

Source tables:

- `reviews`
- `review_questions`
- `review_ratings`

Available for Infinity:

- final score
- free text feedback
- reviewer / reviewee ids
- session linkage

Infinity V1 decision:

- derive expert quality and conversion-supporting signals from existing reviews
- store AI recommendation attribution separately in `ai_recommendation_events`

### Subscriptions / Policy / Business Controls

Source tables and services:

- `subscriptions`
- `subscription_plans`
- `subscription_plan_features`
- `subscription_usage_tracking`
- `subscription_usage_events`
- `access_policy_configs`
- existing runtime policy enforcement in `lib/subscriptions/policy-runtime.ts`
- existing mentor/public eligibility logic in `lib/mentor/server/public-service.ts`

Available for Infinity:

- requester booking rights
- AI feature access
- mentor AI visibility entitlement
- mentor availability limits
- admin policy config versioning

Infinity V1 decision:

- Next.js remains the owner of all policy checks
- Python never decides booking or subscription rights
- internal policy and expert endpoints must reuse existing platform policy logic

### Content / Courses

Source tables:

- `mentor_content`
- `courses`
- `course_modules`
- `course_sections`
- `section_content_items`
- `course_reviews`
- `course_enrollments`

Available for Infinity:

- mentor-authored content metadata
- course categories, tags, outcomes, enrollments, reviews
- lightweight authority signals for expert ranking

Infinity V1 decision:

- use course/content data only as supporting evidence for expert authority in V1
- do not build separate content recommendation flows into Infinity V1

### Existing AI / Chatbot Data

Source tables:

- `ai_chatbot_messages`
- `ai_chatbot_message_insights`

Observed data shape:

- these belong to the legacy chatbot flow
- they do not satisfy the Infinity PRD requirements for trace metadata, scoring persistence, memory provenance, or routing control

Infinity V1 decision:

- keep legacy tables for rollback and audit
- do not extend them for Infinity
- implement the new Infinity V1 tables separately

## Current Data Snapshot

Database audit on 2026-05-26 found:

- `users`: 55
- `mentors`: 15
- `sessions`: 84
- `reviews`: 13
- `subscriptions`: 73
- `mentor_content`: 11
- `courses`: 5
- `access_policy_configs`: 0
- `ai_chatbot_messages`: 664
- `ai_chatbot_message_insights`: 28

Also confirmed:

- `pgvector` is installed via the `vector` extension

## Gap List

Missing durable Infinity-specific storage:

- conversations with current phase/state
- response blocks and trace metadata per assistant turn
- normalized user signals with provenance
- AI-facing expert metadata
- admin boost rules
- recommendation run and candidate score breakdown persistence
- recommendation event attribution
- continuity memory with provenance

Missing service boundary:

- Python FastAPI runtime
- internal service auth between Next and Python
- public Infinity API bridge
- internal policy / expert / persistence routes

Missing UI boundary:

- Infinity-specific landing panel
- structured response block renderer
- contextual expert cards wired to AI recommendation events

## Final V1 Architecture Note

Phase 0 conclusions:

1. Anonymous homepage use should be supported in V1.
   - Reason: the current landing experience is anonymous and the PRD explicitly includes light-mode homepage visitors.

2. `pgvector` is available, but it is not required for V1 launch.
   - Reason: current expert volume is small, and metadata/tag-based retrieval plus deterministic scoring is sufficient.

3. A thin explicit orchestrator is enough.
   - Reason: the required flow is linear and traceable without LangGraph.

4. The initial provider abstraction should support Gemini and OpenAI, but fail closed when LLM access is required and unavailable.
   - Reason: the project currently has no working Infinity LLM env configured in this repo state.

5. Existing platform policy and booking logic are strong enough to remain the hard boundary.
   - Reason: entitlement checks, AI visibility gating, and `booking_source='ai'` already exist.

## Required Migration List

Add only these V1 tables from the implementation plan:

- `ai_conversations`
- `ai_turns`
- `ai_user_signals`
- `ai_expert_profiles`
- `ai_admin_boost_rules`
- `ai_recommendation_runs`
- `ai_recommendation_candidates`
- `ai_recommendation_events`
- `ai_memory_items`

Not included in V1 migration:

- `ai_embeddings`
- separate evaluation tables
- separate expert performance tables
- separate session readiness tables
- separate LLM run tables
