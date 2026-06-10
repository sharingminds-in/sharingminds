# Infinity AI North Star

## Status

This is the strategic direction document for Infinity AI. Implementation plans, PRDs, and phase checklists can change, but this document captures the product and architecture direction we should not lose.

Infinity AI is not trying to become a generic chatbot. It is decision-clarity and human-routing infrastructure: it should understand what the user is trying to do, reduce uncertainty, and route them toward the right human expertise or resource at the right moment.

The ambition is to build the best possible goal, learning, and mentor companion for this product category. That does not mean "answer anything like a general chatbot." It means the assistant should feel seamless, capable, and agentic inside its real job: helping users clarify decisions, turn vague goals into next steps, and reach useful humans or resources without brittle loops.

## Ruthless Product Standard

Every turn should either understand better, move the user forward, or route them to the right next action.

Infinity AI fails the standard if it:

- loops instead of progressing
- punts with "I can help" after the user has already asked for help
- leaks internal planner or rationale text
- hardcodes fake intelligence through canned assistant prose
- adds brittle special cases instead of strengthening the execution model
- recommends experts/resources before it has earned enough context or policy permission
- keeps asking questions when it should act
- acts when it should clarify

The user should feel that the assistant is a skilled goal, learning, and mentoring companion: calm, direct, contextual, and capable.

## Core Belief

The LLM should be the system's understanding and judgment layer, not a source of hidden business decisions.

The platform should remain the source of truth for eligibility, subscriptions, booking, policy, safety, and persistence.

The ranking and allocation layer should be auditable and configurable, not a pile of brittle hardcoded branches.

The final product should feel intelligent because it combines:

- LLM semantic understanding.
- Platform-owned policy and eligibility.
- Business-aware marketplace controls.
- Traceable execution.
- Quality validation before presentation.

## How We Achieve The Goal

The product goal and the implementation method are different things.

The product goal is a seamless goal/learning/mentor agent.

The implementation method should be simple and powerful:

```text
understand -> execute one meaningful capability -> observe artifact -> validate -> refine only if needed
```

Infinity AI should not become a pile of filters, keyword branches, and special-case flows. Each new behavior should be expressed through a small number of strong capabilities with typed inputs, typed outputs, state, traces, and validation.

Good direction:

- `goal_workbench(state)`
- `search_experts(plan)`
- `search_resources(plan)`
- `compose_response(artifacts)`

Bad direction:

- `handle_budget_yes_button`
- `handle_london_phd_case`
- `mentor_search_random_guest`
- `mentor_search_domain_followup`
- `repeat_framework_repair_for_case_x`

The first style lets the agent reason and execute cleanly. The second style creates a maze.

## What We Learned From Analyst Agent

Analyst Agent works well because it is not just "an LLM answering." It is a controlled execution system:

```text
plan -> execute -> observe -> diagnose -> refine -> validate -> present
```

It gives the model a powerful execution surface, observes what actually happened, validates the result, and only then presents an answer.

The important lesson is not to give the LLM unlimited access. The important lesson is to give the system one powerful, bounded execution capability with typed state, traceability, diagnostics, and quality gates.

For Infinity AI, the equivalent should be:

```text
user request
  -> LLM understands the request
  -> typed search / routing plan
  -> platform-owned expert/resource retrieval
  -> LLM-assisted fit assessment where useful
  -> policy-governed ranking/allocation
  -> quality validation
  -> final user-visible response
```

## The Vercel Tool Lesson

The product should avoid exploding into many tiny tools and edge-case handlers.

Bad direction:

```text
mentor_search_by_domain
mentor_search_random
mentor_search_by_budget
mentor_search_by_location
mentor_search_guest
mentor_search_authenticated
mentor_search_by_quality
```

That creates brittle behavior because every new user phrase becomes another branch.

Better direction:

```text
search_experts(plan)
```

One powerful, platform-owned expert search capability should accept a structured plan, enforce policy, return eligible candidates and metadata, and let the AI execution layer reason over the result.

The goal is fewer, stronger capabilities, not more narrow special cases.

## Goal Workbench

Goal-help turns should be handled by one primary capability: `goal_workbench`.

The workbench owns the user's active goal thread:

- clarification
- consent/action suggestions
- mini-frameworks
- plan refinement
- concrete next-step planning
- deciding whether the next useful action is resources or experts

The workbench does not own:

- expert retrieval
- resource retrieval
- booking
- subscription
- payment
- eligibility
- usage metering

Those remain platform-owned or routed to separate retrieval capabilities.

The active goal should come from the conversation goal itself, not from whether a specific UI block was rendered. A mini-framework can create a useful artifact, but it must not be the only condition that allows continuation.

The workbench should preserve helpful interaction details such as suggested replies or action chips. Those are good product affordances when they are generated from structured LLM output and tied to the current goal. They should not be hardcoded labels or separate brittle branches.

Minimum active-goal shape:

```text
active_goal = {
  active_goal_key,
  goal_type,
  goal_summary,
  collected_fields,
  missing_fields,
  next_action,
  last_artifact_hash,
  plan_version
}
```

If the user provides concrete details after a planning prompt, the workbench must update `active_goal` and produce the next useful artifact. It should not say "I can help" when the user has already asked for help or accepted the action.

## The Human Mentoring Traversal

Infinity AI should behave like a skilled human goal/learning/mentor companion. A good human mentor does not immediately jump from vague uncertainty to recommendations. They move through a confidence ladder.

The ladder:

1. Stabilize the vague ask.
   If the user says "I do not know what to do", the assistant should understand uncertainty first. This is not automatically a mentor request, a course request, or a generic advice request.

2. Find the type of problem.
   Identify whether the issue is career direction, study choice, skill growth, business, confidence, money, family pressure, time, geography, or another constraint.

3. Reflect the current situation.
   The assistant should briefly show that it understands the shape of the decision before trying to solve it.

4. Extract anchors.
   Capture the user's outcome, constraints, timeline, location, budget, emotional pressure, current stage, and any non-negotiables.

5. Create the first useful artifact.
   The first artifact should not be generic advice. It should be a small decision map, framework, shortlist, tradeoff table, feasibility check, or next-step plan.

6. Refine with new details.
   When the user adds concrete information, the assistant updates the active goal and moves the artifact forward. It must not restart the flow or repeat the previous artifact.

7. Route only when earned.
   If the goal needs learning material, route to resources. If it needs human judgment, accountability, or lived experience, route to mentors. If it needs booking, the platform handles booking.

8. Maintain continuity.
   Same-chat context is valid context. Cross-chat memory should be careful, authenticated, policy-controlled, and traceable.

   Per-chat active goal state lives in the conversation state JSON so the current thread can refine the same goal without pretending it is long-term memory. Cross-chat authenticated memory lives in `ai_memory_items`, is owned by `users.id`, and must not exist for guests. Authenticated users must be able to inspect and clear saved memory items one by one from their settings surface through user-scoped server APIs; browser clients must never receive raw memory rows, internal prompt metadata, or another user's memory.

The assistant should always know whether it is discovering, clarifying, planning, refining, or routing. These are not rigid funnel stages; they are the natural modes of a serious mentoring conversation.

## Expert Ranking Philosophy

Pure code ranking is too rigid.

Pure LLM ranking is too opaque.

The right approach is LLM-assisted, policy-governed ranking.

### LLM Responsibilities

The LLM may assess candidate fit in structured form:

- Semantic fit.
- Domain fit.
- Persona/stage fit.
- Communication/style fit.
- User constraint fit.
- Why this expert may help.
- Risks or mismatch notes.

The LLM may choose a high-level selection intent:

- `specific_relevance`
- `open_discovery`
- `quality_first`
- `pending_category_preview`

The LLM must not directly choose final mentors by itself.

### Platform Responsibilities

The platform owns non-negotiable decisions:

- Whether the user can see expert recommendations.
- Whether the user can book.
- Whether the mentor is eligible.
- Whether the mentor is visible in AI search.
- Whether the mentor has session availability.
- Subscription/payment/booking rules.
- Usage and event accounting.

Python must not invent or override these.

### Ranking/Allocation Responsibilities

The ranker should combine:

- LLM semantic fit.
- Mentor quality/trust.
- Availability.
- Review/session signals.
- Mentor subscription/business priority.
- Admin boosts.
- Exposure balancing.
- Diversity.
- Safety and eligibility constraints.

This ranking should be deterministic in the audit sense: same inputs, same output, clear explanation.

It should not be deterministic in the dumb sense: fixed magic constants buried in code with no product control.

Weights, boost rules, thresholds, and strategy behavior should become configurable over time through admin/config data, not scattered hardcoded branches.

## Business Priority Without Corruption

It is valid for business logic to affect ranking.

Example: if two experts are similarly relevant, and one has an active mentor subscription or an admin-approved boost, that can move them up.

But business priority must have guardrails:

- It cannot override eligibility.
- It cannot override safety.
- It cannot force irrelevant experts into a recommendation.
- It should have caps.
- It should have expiry.
- It should be auditable.
- It should be visible in score explanations for internal review.

The product should be commercially aware without becoming dishonest.

## Open Discovery Is A First-Class Intent

If the user says:

- "give me random mentors"
- "any space"
- "just give me"
- "surprise me"
- "I do not care what field"

That is not a failure case. It is an open-discovery request.

The system should not treat low specificity as automatic no-match. It should retrieve eligible experts and allocate using open-discovery logic:

- quality first
- availability
- exposure balancing
- diversity
- deterministic seeded randomness where appropriate

If eligible candidates exist, the system should usually show at least one expert card.

## Plan Continuation After Consent

When the assistant offers a planning action such as "Yes, plan it", that button should not be treated as an isolated canned reply. It is consent to continue the active goal thread.

After consent, the next turns must move from generic clarity into concrete plan refinement:

- Extract concrete planning fields from the user's answer.
- Update the current conversation goal state.
- Generate a more specific next-step plan from the newly supplied details.
- Ask only when a required field is genuinely missing.
- Recommend resources or mentors only when the user asks or the plan has reached that point.

Example:

```text
User: I want to study abroad in London but budget matters.
Assistant: ... Want me to help narrow this into a budget-friendly London plan?
User clicks: Yes, help me plan it.
Assistant: Gives a compact planning framework.
User: 22 rupees, PhD, Computer Scientist.
```

The correct behavior is not to repeat the same framework. The system should incorporate:

- budget: `22 rupees`
- study level: `PhD`
- subject/career direction: `Computer Science`
- location: `London`
- feasibility constraint: the budget is likely unrealistic and needs a grounded feasibility check

The follow-up response should become a concrete plan refinement or feasibility clarification, not another copy of the previous generic framework.

The same chat history is valid context. The product should not discard it. The requirement is active-goal discipline: preserve conversation continuity while keeping the current user turn anchored to the correct active goal thread.

## User Context And Privacy Boundary

Infinity AI should eventually understand long-term user goals, but it must not indiscriminately expose all user data to the model.

The correct approach is context packing:

- Load only what is relevant to the current turn.
- Summarize long-term memory.
- Keep platform-sensitive fields server-side.
- Use typed DTOs, not raw database rows.
- Keep private/internal trace data out of normal user responses.

The AI should feel continuous, but the data boundary must remain deliberate.

## Response Contract

Internal reasoning must never be rendered as user-visible copy.

Bad output:

```text
The user wants a random mentor recommendation with no field preference...
Retrieve eligible experts...
```

That is planner text, not assistant speech.

The response contract must separate:

- internal rationale
- execution plan
- retrieval decision
- ranking diagnostics
- user-visible response blocks

Only explicitly user-visible fields may render.

No phrase blacklist should be used to solve this. The fix must be schema separation and renderer enforcement.

## North-Star Architecture

```text
Browser
  |
  v
Next.js public AI route
  |
  | auth/session/guest context
  | signed internal request
  v
Python Infinity AI service
  |
  | turn controller / supervisor
  | typed route plan
  | context packing
  v
Platform tools through Next.js
  |
  | policy-owned candidate retrieval
  | eligible expert/resource DTOs
  v
Python execution graph
  |
  | LLM-assisted fit assessment
  | deterministic/auditable allocation
  | diagnose/refine if bad
  | quality gates
  v
Next.js persistence + UI rendering
```

## Anti-Patterns

Do not build:

- Generic chatbot behavior as the core product.
- Canned fallback assistant text.
- Keyword-based edge-case routing.
- Dozens of narrow mentor search tools.
- LLM-only final mentor selection.
- Code-only dumb ranking with buried magic constants.
- UI rendering of planner/internal rationale.
- Python-owned subscription, payment, or booking decisions.
- Silent fallback when model/provider/config fails in required mode.

## Review Standard

When reviewing any Infinity AI change, ask:

1. Does this reduce brittleness or add another branch?
2. Is the LLM being used for understanding and judgment, not hidden policy?
3. Does the platform still own policy, eligibility, and booking?
4. Can we explain why an expert/resource was shown?
5. Can business priority influence ranking without corrupting relevance?
6. Are failures diagnosed before presenting a bad response?
7. Are internal fields prevented from leaking into the UI?
8. Is the implementation closer to a traceable execution system than a prompt funnel?

If the answer to these is no, the implementation is drifting away from the north star.
