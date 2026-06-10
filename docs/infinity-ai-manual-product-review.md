# Infinity AI Manual Product Review

> Deprecated / superseded: this review guide targets the older Infinity AI V1 flow. Do not use it for QA signoff until it is rewritten against `docs/infinity-ai-analyst-agent-upgrade-plan.md`.

This document is the Phase 6 manual smoke guide for Infinity AI V1.

Goal: confirm the system behaves like compact decision clarity plus human routing, not a generic chatbot.

## Review Rules

- Use Infinity AI only through the landing experience.
- Review both anonymous and authenticated flows where relevant.
- Confirm expert cards appear only after meaningful context and mini-clarity.
- Confirm recommendations cap at 2-3 experts.
- Confirm traces persist signal extraction, phase changes, LLM call metadata, recommendation scoring, and readiness snapshots.
- Confirm booking, completion, and review attribution events persist when an AI-sourced session moves forward.

## What To Inspect In Data

- `ai_conversations`
- `ai_turns`
- `ai_user_signals`
- `ai_recommendation_runs`
- `ai_recommendation_candidates`
- `ai_recommendation_events`
- `ai_memory_items`

For each reviewed conversation, verify:

- `trace_metadata.traceId` exists on assistant turns.
- `phaseBefore` and `phaseAfter` are persisted.
- `signalSummary` exists in trace metadata.
- candidate score breakdown rows were stored when experts were shown.
- `readiness_snapshot` exists once session readiness is generated.
- memory items include provenance when continuity is updated.

## Scenario 1: Mid-Career Professional

Prompt: `I feel stuck in my career. I've been working for 6 years but I don't see growth.`

Record:

- Trace ID:
- Recommendation Run ID:
- Result: Pass / Fail
- Notes:

Expected signs:

- detects career-growth intent and uncertainty emotion.
- reflects the strategic-clarity problem before recommending anyone.
- asks a clarifying question or offers a mini-framework with micro-consent.
- expert cards focus on career acceleration, leadership positioning, transitions, or global growth.
- session readiness captures unclear decisions and constraints.

## Scenario 2: Work Abroad

Prompt: `I want to move abroad for work but I don't know where to start.`

Record:

- Trace ID:
- Recommendation Run ID:
- Result: Pass / Fail
- Notes:

Expected signs:

- detects work-abroad intent and software/global-positioning style outcomes if supplied.
- clarifies market fit, country alignment, and positioning before expert elevation.
- asks field/context questions before routing.
- expert cards emphasize relocation, global hiring, or international positioning.

## Scenario 3: Student Career Confusion

Prompt: `I genuinely don't know what career to choose.`

Record:

- Trace ID:
- Recommendation Run ID:
- Result: Pass / Fail
- Notes:

Expected signs:

- detects student/future-direction stage.
- gives compact clarity around strengths, market direction, and lifestyle fit.
- does not rush to book an expert before a mini-framework is offered or accepted.
- readiness block organizes interests, strengths, and uncertainties.

## Scenario 4: Founder Funding

Prompt: `We have a product but investors are not responding.`

Record:

- Trace ID:
- Recommendation Run ID:
- Result: Pass / Fail
- Notes:

Expected signs:

- detects funding/founder intent and early-revenue context when provided.
- clarifies fundraising blockers before showing experts.
- expert cards emphasize fundraising strategy, GTM clarity, investor positioning, and scaling.
- readiness block includes traction story and investor concerns.

## Scenario 5: SME Growth Slowdown

Prompt: `Our business is stable but growth has slowed.`

Record:

- Trace ID:
- Recommendation Run ID:
- Result: Pass / Fail
- Notes:

Expected signs:

- detects business-operations or GTM intent.
- frames the problem as a scaling transition, not a generic business tip exchange.
- expert cards emphasize sales systems, GTM, operations, and expansion.
- recommendations remain capped and contextual.

## Scenario 6: Parent Exploring Non-Traditional Careers

Prompt: `My son isn't interested in traditional careers like engineering or medicine.`

Record:

- Trace ID:
- Recommendation Run ID:
- Result: Pass / Fail
- Notes:

Expected signs:

- detects parent persona and child-career context.
- balances empathy with employability, capability, and opportunity framing.
- does not moralize or force a path.
- expert cards emphasize creative/digital pathways, student strengths, and long-term planning.

## Scenario 7: Study Abroad Uncertainty

Prompt: `I want to study abroad but I'm confused whether it's actually worth it.`

Record:

- Trace ID:
- Recommendation Run ID:
- Result: Pass / Fail
- Notes:

Expected signs:

- detects study-abroad intent and long-term leverage outcome.
- clarifies career opportunity, affordability, and long-term fit before expert elevation.
- readiness block captures goals, countries, finances, and career priorities.

## Scenario 8: Enterprise AI Adoption

Prompt: `We want to integrate AI into our workflows.`

Record:

- Trace ID:
- Recommendation Run ID:
- Result: Pass / Fail
- Notes:

Expected signs:

- detects AI-adoption and transformation intent.
- frames the work as operational redesign, not a tooling FAQ.
- asks which functions or workflows matter first.
- expert cards emphasize workflow redesign, governance, and organizational change.

## Pass / Fail Standard

Pass if all eight scenarios:

- feel calm, perceptive, and compact.
- produce contextual signal capture.
- show experts only after earned clarity.
- persist trace metadata and score breakdowns.
- produce a session-readiness block when expert routing occurs.

Fail if any scenario:

- behaves like a generic chatbot.
- shows experts too early.
- produces long advice dumps.
- lets promoted experts bypass relevance.
- omits trace or scoring persistence.
