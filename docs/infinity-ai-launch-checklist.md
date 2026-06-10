# Infinity AI Launch Checklist

> Deprecated / superseded: do not use this checklist for launch readiness until it is rewritten against `docs/infinity-ai-analyst-agent-upgrade-plan.md`. The active direction now requires the Analyst-Agent-inspired turn operating system, quality gates, route-specific flows, and traceable validation before QA or launch.

## Feature Flags

- `INFINITY_AI_ENABLED=true`
- `NEXT_PUBLIC_INFINITY_AI_ENABLED=true`
- `INFINITY_AI_REQUIRE_LLM=true`
- `INFINITY_AI_ANONYMOUS_ENABLED` set to intended launch mode
- `INFINITY_AI_PGVECTOR_ENABLED=false` unless explicitly needed
- `INFINITY_AI_ADMIN_BOOSTS_ENABLED=true`

## Required Runtime Config

- `INFINITY_AI_SERVICE_URL` points at the FastAPI service
- `INFINITY_AI_INTERNAL_SECRET` is set in both Next.js and FastAPI environments
- `INFINITY_AI_LLM_PROVIDER` is set
- `INFINITY_AI_LLM_API_KEY` is set
- `INFINITY_AI_LLM_MODEL` is set if overriding defaults

## Database

- apply `0056_infinity_ai_foundation.sql`
- confirm Infinity AI tables exist
- confirm existing `0055_razorpay_payments.sql` remains in migration order

## Product Readiness

- manual review passed for all eight scenarios in `docs/infinity-ai-manual-product-review.md`
- anonymous landing flow works when enabled
- authenticated booking flow records AI attribution
- completion and review attribution events persist
- expert recommendations remain capped at 2-3
- session readiness persists after expert routing
- returning-user memory loads with provenance

## Operational Readiness

- `/health` responds from the FastAPI service
- internal secret blocks unauthorized bridge calls
- failure mode is visible and contained when LLM config is missing
- recommendation runs persist candidate score breakdowns
- admin boost rules are scoped, capped, and expiring in DB

## Final Go / No-Go

- trace metadata confirmed on recent assistant turns
- recommendation events confirmed in DB
- rollback checklist reviewed and ready
