# Infinity AI Dummy Recommendation Seed

This seed exists only for local/staging AI recommendation testing. It is not a migration and must not be used as production data.

## Source Data

The fixture at `scripts/infinity-ai/fixtures/sharingminds-profiles.json` was derived from:

- `SharingMinds_500_Dummy_Expert_Profiles.xlsx`
- `SharingMinds_Dummy_RnD_Data.xlsx`

The seed fills missing platform fields deterministically so the records can exercise the actual Infinity AI recommendation path.

## What Varies

Mentor/expert seed rows are distributed across controlled buckets:

- eligible boosted premium experts
- eligible high-quality experts
- eligible underexposed new experts
- eligible basic mentors with free-session availability
- eligible paid-session specialists
- eligible but overexposed mentors
- relevant mentors without AI visibility
- relevant mentors without session availability
- exclusive-search mentors
- unavailable mentors
- unverified mentors
- mentors with inactive subscriptions

These dimensions are intentionally aligned to the current AI scoring inputs:

- relevance: domain, expertise, keywords, intent tags, outcome tags, persona tags
- platform eligibility: verification, availability, `AI_SEARCH`, active mentor subscription, AI visibility, session availability
- trust/quality: reviews, completed sessions, cancelled sessions, content count
- conversion: clicks, bookings, completions
- exposure: recent impressions
- business priority: active `ai_admin_boost_rules`

## Content Seed

The seed creates approved and non-approved mentor content across:

- `URL`
- `FILE`
- limited `COURSE` rows for course-path smoke coverage

The AI resource candidate route now also reads approved public `mentor_content` rows of type `FILE` and `URL`, so content resources can be recommended without pretending everything is a course.

## Tables Touched

Seed:

- `users`
- `mentors`
- `subscriptions`
- `subscription_plans`
- `subscription_plan_features`
- `subscription_features` only if required feature keys do not already exist
- `sessions`
- `reviews`
- `mentor_content`
- `courses`
- `ai_expert_profiles`
- `ai_admin_boost_rules`
- `ai_recommendation_events`

No schema changes are made.

## Cleanup Marker

All generated data uses deterministic markers:

- user id prefix: `seed-sharingminds-`
- email domain: `sharingminds-dummy.local`
- seed batch: `sharingminds_dummy_seed_v1`
- boost reason prefix: `sharingminds_dummy_seed_v1`
- content review note prefix: `sharingminds_dummy_seed_v1`

Cleanup deletes only rows matching those markers.

## Commands

Dry run:

```bash
pnpm infinity-ai:seed:dummy
pnpm infinity-ai:cleanup:dummy
```

Write seed data:

```bash
INFINITY_AI_ALLOW_DUMMY_SEED=true pnpm infinity-ai:seed:dummy -- --execute
```

Write a smaller seed:

```bash
INFINITY_AI_ALLOW_DUMMY_SEED=true pnpm infinity-ai:seed:dummy -- --execute --limit=60
```

Include the extra R&D workbook rows:

```bash
INFINITY_AI_ALLOW_DUMMY_SEED=true pnpm infinity-ai:seed:dummy -- --execute --include-rnd --limit=240
```

Cleanup:

```bash
INFINITY_AI_ALLOW_DUMMY_SEED=true pnpm infinity-ai:cleanup:dummy -- --execute
```

Production is blocked unless `INFINITY_AI_ALLOW_PRODUCTION_DUMMY_SEED=true` is also set. That override should not be used for normal QA.

## Expected AI Testing Value

This seed lets smoke tests verify:

- high-relevance expert matching
- broad/open mentor discovery
- boosted expert ordering after relevance threshold
- blocked mentors staying out of AI recommendations
- session/visibility/subscription gates
- exposure balancing
- FILE/URL/course resource retrieval
- weak resources competing against stronger resources

If resource recommendations still show weak cards after this seed, the issue is in resource scoring/allocation thresholds, not lack of data.
