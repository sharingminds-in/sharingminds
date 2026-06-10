# Infinity AI Rollback Checklist

> Deprecated / superseded: this rollback checklist targets the older Infinity AI V1 launch path. Do not use it for release operations until it is updated against `docs/infinity-ai-analyst-agent-upgrade-plan.md`.

Use this if Infinity AI V1 causes routing, UX, or infrastructure issues after enablement.

## Immediate User-Facing Rollback

1. Set `NEXT_PUBLIC_INFINITY_AI_ENABLED=false`.
2. Set `INFINITY_AI_ENABLED=false`.
3. Redeploy Next.js so the landing page falls back to the legacy hero/chat surface.

## Service Isolation

1. Remove or disable `INFINITY_AI_SERVICE_URL`.
2. Rotate `INFINITY_AI_INTERNAL_SECRET` if bridge misuse is suspected.
3. Stop the FastAPI deployment if needed after traffic is drained.

## Policy Rollback

1. Set `INFINITY_AI_ADMIN_BOOSTS_ENABLED=false` if ranking quality is acceptable but boosts are not.
2. Set `INFINITY_AI_ANONYMOUS_ENABLED=false` if anonymous flow quality is the issue.
3. Set `INFINITY_AI_REQUIRE_LLM=false` only for controlled diagnosis, not normal degraded production behavior.

## Data Handling

- do not drop Infinity AI tables during rollback.
- preserve `ai_recommendation_runs`, `ai_recommendation_candidates`, and `ai_turns` for review.
- preserve recommendation events for attribution analysis.

## Post-Rollback Review

1. inspect the latest failing traces in `ai_turns.trace_metadata`
2. inspect recent `ai_recommendation_runs` and candidate breakdowns
3. inspect recent `ai_recommendation_events`
4. document whether failure was:
   - conversation quality
   - ranking quality
   - policy mismatch
   - bridge/auth issue
   - provider/runtime issue
