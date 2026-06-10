# Infinity AI Upgrade Plan Inspired By Analyst Agent

> Strategic north star: read `docs/infinity-ai-north-star.md` first. This document explains the implementation inspiration from Analyst Agent, but the north-star doc defines the product and architecture direction we should preserve.

## Purpose

This document maps the working patterns from `C:\Users\Raf\Desktop\Projects\Analyst agent\analyst_agent` into a concrete, non-breaking upgrade plan for the Young Minds Infinity AI system.

The goal is not to turn Infinity AI into a data analyst product. The goal is to copy the engineering discipline that makes Analyst Agent feel reliable:

- bounded job contracts
- typed graph state
- explicit conditional routing
- node-level execution history
- budgets and attempt limits
- quality gates
- diagnostic and refinement loops
- artifact-based outputs
- traceable final presentation

Infinity AI must remain a decision-clarity and human-routing system. It must not become a generic chatbot, it must not move platform policy into Python, and it must not let the LLM choose subscriptions, booking rights, or final expert rankings.

## Source Systems Reviewed

### Analyst Agent

Key files:

- `analyst_agent/core/graph.py`
- `analyst_agent/core/nodes.py`
- `analyst_agent/core/state.py`
- `analyst_agent/core/sql_executor.py`
- `analyst_agent/core/dialect_caps.py`
- `analyst_agent/core/llm_factory.py`
- `analyst_agent/models/contracts.py`
- `analyst_agent/api/routes/analysis.py`
- `frontend/src/main.ts`

### Infinity AI

Key files:

- `services/infinity-ai/app/orchestration/graph.py`
- `services/infinity-ai/app/orchestration/supervisor.py`
- `services/infinity-ai/app/orchestration/response_blocks.py`
- `services/infinity-ai/app/llm/schemas.py`
- `services/infinity-ai/app/llm/prompts.py`
- `services/infinity-ai/app/memory/summarizer.py`
- `services/infinity-ai/app/signals/extractor.py`
- `services/infinity-ai/app/signals/normalizer.py`
- `services/infinity-ai/app/matching/scoring.py`
- `services/infinity-ai/app/matching/allocation.py`
- `services/infinity-ai/app/adapters/platform_client.py`
- `lib/infinity-ai/repository.ts`
- `lib/infinity-ai/policy.ts`
- `lib/infinity-ai/client.ts`
- `lib/infinity-ai/schemas.ts`
- `components/landing/infinity-ai/InfinityAiPanel.tsx`
- `components/landing/infinity-ai/ResponseBlockRenderer.tsx`
- `components/landing/infinity-ai/ExpertCards.tsx`
- `app/api/infinity-ai/**`
- `app/api/internal/infinity-ai/**`

## Executive Diagnosis

Analyst Agent feels better because it is a controlled job engine, not an open-ended conversational funnel.

Analyst Agent receives a structured `QuerySpec`, runs a graph with concrete tool outputs, validates those outputs, retries when the result is bad, and returns a `RunResult` with artifacts and execution steps. Its graph is not just a sequence of LLM prompts. It is a state machine with measurable outcomes.

Infinity AI currently has stronger product ambition but weaker runtime discipline. It receives arbitrary conversational input, then must decide whether the turn is chitchat, goal-help, correction, resource search, expert matching, platform help, safety, or resume. If that routing is weak, the system collapses into generic goal-discovery behavior. That is what caused repeated generic questions like "What's on your mind today?"

The right fix is to make Infinity AI more like Analyst Agent at the runtime level:

- every turn becomes a typed job
- every turn has a route
- every route has allowed nodes
- every node has measurable output
- every output is validated
- bad outputs are diagnosed and regenerated, not patched with canned prose
- final response blocks are artifacts, not freeform chat text

## Deep Analyst Agent Anatomy

This section goes below the surface. Analyst Agent works because it has a narrow operating system around the LLM. The LLM is important, but the system quality mostly comes from the macro structure and the micro contracts around each step.

### Macro Pattern Map

| Analyst Agent Pattern | What It Does | Why It Works | Infinity AI Equivalent | Copy Exactly? |
|---|---|---|---|---|
| Bounded job type | Treats the request as a data-analysis job | Reduces ambiguity before the LLM runs | Treat each user turn as an `InfinityTurnSpec` | yes |
| Typed state | Keeps `spec`, context, result set, artifacts, quality, errors, budget, and history separate | Prevents hidden side effects and makes debugging possible | Restructure `InfinityGraphState` into `spec`, `ctx`, `routing`, `understanding`, `tools`, `quality`, `trace`, `persistence` | yes |
| Graph node sequence | Uses a LangGraph workflow with named steps | Makes execution inspectable and replayable | Keep LangGraph, but split by route-specific subflows | yes |
| Conditional routing | Routes to diagnostics/refinement only when state proves it is needed | Avoids one giant prompt trying to handle everything | Route by `conversation_act` and `turn_policy`, then conditionally repair | yes |
| Tool-grounded loop | Runs SQL, observes rows/errors, then diagnoses | The LLM is judged against external reality | Run platform tools for resources/experts, then score and validate deterministically | yes |
| Quality validation | Scores result quality before presentation | Bad output gets repaired before the user sees it | Add `TurnQualityReport` before response return | yes |
| Attempt and budget limits | Prevents infinite retries and runaway cost | Production-safe failure behavior | Add per-flow LLM/tool/latency budgets | yes |
| Artifacts | Returns SQL/table artifacts with lineage | Final answer can be audited | Store response blocks, signal snapshots, candidate pools, scores, memory changes as artifacts | yes |
| Presentation last | User-facing answer happens after data/tool/validation steps | Stops premature polished nonsense | Do not assemble UI blocks until all gates pass | yes |
| In-memory demo job store | Stores job status in process memory | Useful for demos only | Keep Postgres as source of truth | no |
| Loose SQL fallback | Extracts SQL or can fallback to `SELECT 1` | Helps a demo avoid crashing | Fail closed after strict schema repair | no |
| Provider fallback | Automatically switches provider | Makes demo resilient | Only use explicitly configured/allowed model fallback | no |

### Micro Pattern Map

| Analyst Micro Detail | Current Analyst Location | Functional Meaning | Infinity Upgrade |
|---|---|---|---|
| `QuerySpec` | `analyst_agent/models/contracts.py` | Formalizes input before execution | Add `InfinityTurnSpec` after supervisor classification |
| `AnalystState.spec` | `analyst_agent/core/state.py` | Immutable job contract for the run | Keep `spec` separate from mutable graph outputs |
| `AnalystState.ctx` | `analyst_agent/core/state.py` | Loaded schema/context card | Add `ContextProfile` summarizing conversation, policy, memory, prior signals |
| `AnalystState.history` | `analyst_agent/core/state.py` | Ordered list of prior SQL attempts and notes | Add `execution_history` for route decisions, repairs, tool outputs |
| `AnalystState.errors` | `analyst_agent/core/state.py` | Durable failure evidence | Add `ErrorRecord` and persist failed node/error summary |
| `AnalystState.diagnostics` | `analyst_agent/core/state.py` | Queries/observations used to repair | Add `DiagnosticRecord` for response failures, routing failures, empty candidates |
| `AnalystState.budget_remaining` | `analyst_agent/core/state.py` | Controls retries/cost | Add `TurnBudget` and decrement on LLM/tool/repair calls |
| `AnalystState.quality` | `analyst_agent/core/state.py` | Determines whether result can be presented | Add `TurnQualityReport` with route-specific gates |
| `add_execution_step()` | `analyst_agent/core/state.py` | Per-node audit trail | Make node traces and execution steps first-class in `ai_graph_runs` |
| `need_diagnostics()` | `analyst_agent/core/graph.py` | Conditional branch after failed/empty SQL | Add `needs_response_repair()`, `needs_route_repair()`, `needs_candidate_diagnostics()` |
| `should_continue_iteration()` | `analyst_agent/core/graph.py` | Retry only if quality/budget allows | Add bounded repair loop with plateau detection |
| `profile` node | `analyst_agent/core/nodes.py` | Compresses DB schema into useful context | Add `profile_context` before supervisor/planning |
| `mvq` node | `analyst_agent/core/nodes.py` | Main tool-producing step | Equivalent to route-specific primary action: goal plan, resource retrieval, expert matching |
| `diagnose` node | `analyst_agent/core/nodes.py` | Creates evidence for repair | Add response and candidate diagnostics |
| `refine` node | `analyst_agent/core/nodes.py` | Regenerates after diagnostic evidence | Add composer repair prompt with strict schema |
| `transform` node | `analyst_agent/core/nodes.py` | Shapes raw result into presentation-ready data | Add response block artifact shaping |
| `produce` node | `analyst_agent/core/nodes.py` | Builds final artifacts | Add `response_blocks`, `quality_report`, `selected_slots`, `memory_updates` artifacts |
| `validate` node | `analyst_agent/core/nodes.py` | Quality score and pass/fail | Add gate layer before returning UI response |
| `present` node | `analyst_agent/core/nodes.py` | Creates final answer after validation | Keep user-visible composition last |
| `dialect_caps.py` | `analyst_agent/core/dialect_caps.py` | Domain-specific capability packs | Add flow capability packs for goal, resource, expert, correction, soft response |
| `llm_factory.py` | `analyst_agent/core/llm_factory.py` | Provider selection and cache | Keep provider abstraction, but fail closed in required mode |
| `analysis.py` routes | `analyst_agent/api/routes/analysis.py` | Job lifecycle API | Keep Next public route plus internal Python service; do not expose Python to browser |

### Why Analyst Agent Feels Better In Practice

Analyst Agent is not "smarter" because it has more freeform LLM behavior. It feels better because the product loop is constrained:

1. The user asks for analysis.
2. The system profiles available data.
3. The LLM proposes a query.
4. The database either returns rows or returns an error.
5. The system can tell whether the attempt worked.
6. If it failed, diagnostics run.
7. If the answer quality is low, another bounded attempt happens.
8. Presentation happens only after the result is usable.

Infinity AI currently lacks the same amount of feedback. A user says "hi" or "tell me a joke", and if the graph does not have a strong supervisor and quality gate, the response composer can push the message into the goal funnel. That is why the system appears to "want" to say the same generic question repeatedly.

The upgrade is to give Infinity the same feedback loop:

1. Classify the conversation act.
2. Materialize a typed turn job.
3. Execute only the allowed flow.
4. Validate the flow output against explicit rules.
5. Diagnose and repair once if the output violates the route.
6. Persist the entire trace.
7. Return only validated structured blocks.

### Where Analyst Agent Is Hardcoded, And Why That Matters

Analyst Agent is not free of hardcoding. It has hardcoded graph nodes, route decisions, quality thresholds, prompt templates, SQL safety rules, UI labels, execution step names, validation logic, and provider behavior. That is normal for production software.

The important distinction is this:

```text
Good hardcoding:
  durable structure, policy, schemas, routing, validation, thresholds, safety limits

Bad hardcoding:
  user-visible assistant prose pretending to be intelligent conversation
```

Infinity AI should copy the first category and aggressively remove the second category.

### Infinity Hardcoding Policy

Allowed structural constants:

- enum values such as `chitchat`, `goal_help`, `resource_request`, `expert_request`
- route table entries
- graph node names
- quality gate names
- response block types
- max question count
- max expert card count
- budget limits
- provider required-mode behavior
- prompt ids and prompt versions
- platform policy field names
- UI button labels such as "Sign in" or "Book session"
- admin trace labels
- banned generic phrase validation rules

Not allowed as assistant behavior:

- deterministic fallback text like "What's on your mind today?"
- deterministic fallback text like "What brings you here today?"
- deterministic fallback text like "I can't tell jokes, but I can help you clarify your goals."
- deterministic catch-all reflection like "I hear that you are trying to get clearer before choosing the next step."
- deterministic no-match prose that pretends the LLM decided
- deterministic goal questions for every unknown user input
- deterministic re-anchor text appended after every soft response
- UI code that duplicates a model-generated question into a second question block

Allowed user-visible non-LLM text:

- fixed platform UI labels
- sign-in button text
- error state labels
- admin-only trace labels
- legal/security notices

Rule for assistant messages:

```text
If the text is presented as the assistant speaking conversationally, it must come from a validated LLM output for that route, or from an explicitly labeled platform/system notice. The block assembler may validate, order, cap, and remove invalid text. It may not invent conversational prose.
```

This is the practical fix for the repeated "What's on your mind today?" problem. The answer is not to replace that phrase with a different phrase. The answer is to remove deterministic conversational fallbacks and add a quality gate that rejects generic re-anchors when the LLM produces them.

## Analyst Agent: Macro Architecture

### 1. Bounded Input Contract

Analyst Agent starts from `QuerySpec`:

- `question`
- `dialect`
- `time_window`
- `grain`
- `filters`
- `budget`
- `validation_profile`

This is important because the graph does not have to guess what kind of job it is doing. The input is already a job.

Infinity AI currently starts from a raw `userMessage`, which is too broad. The missing equivalent is a materialized `InfinityTurnSpec`.

Recommended Infinity equivalent:

```python
class InfinityTurnSpec(BaseModel):
    conversation_id: str
    user_message: str
    actor: ActorContext
    surface: Literal["landing_page"]
    conversation_act: ConversationAct
    active_flow: ActiveFlow
    turn_policy: TurnPolicy
    prior_phase: str
    prior_signal_snapshot: dict
    memory_items: list[MemoryItem]
    platform_policy: PlatformPolicy
    budget: TurnBudget
```

The supervisor should not be a loose helper. It should materialize this turn spec before the rest of the graph runs.

### 2. Explicit Graph With Conditional Edges

Analyst Agent graph:

```text
plan -> profile -> mvq
mvq -> diagnose | transform
diagnose -> refine
refine -> transform | diagnose
transform -> produce -> validate
validate -> diagnose | present
```

This is strong because conditional edges are based on observed state:

- SQL failed
- SQL returned no rows
- result was weird
- quality score was low
- plateau happened
- budget remains
- attempts remain

Infinity AI currently has a more linear path:

```text
load_context
classify_conversation_act
extract_signals
normalize_signals
choose_conversation_step
generate_strategy
maybe_generate_framework
maybe_retrieve_experts
score_candidates
allocate_slots
maybe_generate_expert_elevation
maybe_generate_session_readiness
assemble_response_blocks
persist_turn_and_trace
```

The `maybe_*` nodes are an improvement over a pure prompt chain, but Analyst Agent's conditional branching is cleaner. Nodes that are not allowed by policy should often not execute at all. They should not execute and then return "skipped" unless we need trace symmetry.

Recommended Infinity graph shape:

```text
start_turn
  -> load_context
  -> profile_context
  -> supervise_turn
  -> route_by_act

soft_response route:
  compose_soft_response
  -> validate_response
  -> persist_turn_and_trace

goal_help route:
  extract_signals
  -> normalize_signals
  -> choose_goal_step
  -> plan_goal_response
  -> maybe_generate_framework
  -> validate_response
  -> persist_turn_and_trace

resource_request route:
  extract_signals
  -> normalize_signals
  -> policy_check_resources
  -> retrieve_resources
  -> score_resources
  -> allocate_resource_slots
  -> compose_resource_response
  -> validate_response
  -> persist_turn_and_trace

expert_request route:
  extract_signals
  -> normalize_signals
  -> policy_check_experts
  -> retrieve_experts
  -> score_experts
  -> allocate_expert_slots
  -> compose_expert_elevation
  -> compose_session_readiness
  -> validate_response
  -> persist_turn_and_trace

correction route:
  bound_correction_to_prior_context
  -> patch_signal_snapshot
  -> validate_context_patch
  -> compose_correction_response
  -> persist_turn_and_trace

repeat/resume route:
  resolve_resume_target
  -> compose_resume_or_repeat_response
  -> validate_response
  -> persist_turn_and_trace

safety/unsupported route:
  compose_boundary_response
  -> validate_response
  -> persist_turn_and_trace
```

### 3. Typed State As The Source Of Truth

Analyst Agent has `AnalystState` with clear buckets:

- `spec`
- `ctx`
- `rs`
- `shaped`
- `artifacts`
- `quality`
- `validation_results`
- `history`
- `attempt`
- `budget_remaining`
- `diagnostics`
- `errors`
- `answer`
- `execution_steps`
- `lineage`
- timestamps

Infinity AI should adopt this state discipline. Current `InfinityGraphState` is useful but too flat and too runtime-oriented. It mixes durable concepts, graph wiring, LLM results, response blocks, platform client, and transient state in one structure.

Recommended state buckets:

```python
class InfinityGraphState(TypedDict, total=False):
    # Identity
    job_id: str
    trace_id: str
    graph_version: str
    conversation_id: str
    user_turn_id: str
    assistant_turn_id: str | None

    # Input contract
    spec: InfinityTurnSpec
    actor: ActorContext

    # Loaded context
    ctx: InfinityContext
    policy: PlatformPolicy
    prior_turns: list[ConversationTurn]
    memory_items: list[MemoryItem]
    prior_signal_snapshot: dict

    # Routing
    supervisor: ConversationSupervisorDecision
    active_flow: ActiveFlow
    interrupted_flow: ActiveFlow | None
    turn_policy: TurnPolicy

    # Understanding
    extracted_signals: ExtractedSignals | None
    normalized_signals: NormalizedSignals | None
    signal_snapshot: dict
    signal_updates: list[SignalUpdate]

    # Planning/composition
    strategy: ConversationStrategy | None
    framework: MiniFrameworkDraft | None
    recommendation_copy: RecommendationBundle | None

    # Tools and artifacts
    tool_results: list[ToolResult]
    candidate_pool: list[CandidateArtifact]
    scored_candidates: list[ScoredCandidateArtifact]
    selected_slots: list[SelectedSlotArtifact]
    response_blocks: list[ResponseBlock]

    # Quality and repair
    quality: TurnQualityReport
    validation_results: list[ValidationResult]
    diagnostics: list[DiagnosticRecord]
    errors: list[ErrorRecord]
    attempt: int
    budget_remaining: TurnBudget

    # Trace
    execution_steps: list[ExecutionStep]
    model_calls: list[LlmRunRecord]
    node_traces: list[NodeTrace]

    # Persistence result
    persisted: dict
```

The important shift is that every output becomes a typed artifact inside state, then response assembly only presents approved artifacts.

### 4. Execution Steps Are Product Debugging Gold

Analyst Agent records an execution step per node:

- `step_name`
- `status`
- timestamp
- duration
- SQL
- row count
- error
- metadata

Infinity AI has node traces, but they should be treated as first-class execution steps with route-aware metadata.

Recommended `InfinityExecutionStep`:

```python
class InfinityExecutionStep(BaseModel):
    step_name: str
    status: Literal["running", "completed", "failed", "skipped"]
    started_at: datetime
    completed_at: datetime | None
    duration_ms: int | None
    conversation_act: ConversationAct | None
    active_flow: ActiveFlow | None
    phase_before: str | None
    phase_after: str | None
    tool_name: str | None
    model_call_id: str | None
    row_count: int | None
    candidate_count: int | None
    selected_count: int | None
    quality_score: float | None
    error: str | None
    metadata: dict
```

This lets us answer:

- why did the assistant ask that?
- why were no experts shown?
- why were resources not returned?
- did the LLM produce the phrase or did UI add it?
- did the graph skip extraction for chitchat?
- did candidate retrieval run?
- did policy block the action?
- did quality validation reject a response?

### 5. Budget And Attempt Limits Prevent Runaway Behavior

Analyst Agent has `budget_remaining` and `attempt`.

Infinity AI needs per-turn budgets:

```python
class TurnBudget(BaseModel):
    max_llm_calls: int = 4
    max_provider_retries: int = 1
    max_response_regenerations: int = 1
    max_tool_calls: int = 2
    max_candidates_considered: int = 50
    max_wall_time_ms: int = 12000
    max_prompt_tokens: int = 12000
    max_output_tokens: int = 2000
```

Default budgets by flow:

| Flow | LLM Calls | Tool Calls | Regenerations | Notes |
|---|---:|---:|---:|---|
| soft_response | 2 | 0 | 1 | supervisor + composer |
| goal_help | 3 | 0 | 1 | supervisor + extractor + strategy |
| resource_request | 4 | 1 | 1 | supervisor + extractor + resource composer |
| expert_request | 5 | 1 | 1 | supervisor + extractor + recommendation copy |
| correction | 3 | 0 | 1 | supervisor + bounded patch + composer |
| safety | 2 | 0 | 0 | supervisor + safety composer |

If budget is exhausted, the graph should fail closed or return a model-generated compact boundary response only if already safely generated and validated. It should not invent deterministic assistant prose.

### 6. Quality Gates Drive Iteration

Analyst Agent validates results and decides whether to continue:

- quality score
- passed flag
- plateau flag
- budget remains
- attempt count

Infinity AI needs a parallel `TurnQualityReport`.

```python
class TurnQualityGate(BaseModel):
    name: str
    passed: bool
    score: float
    severity: Literal["blocker", "high", "medium", "low"]
    message: str | None = None
    evidence: dict = {}

class TurnQualityReport(BaseModel):
    passed: bool
    score: float
    gates: list[TurnQualityGate]
    repairable: bool
    repair_reason: str | None
    plateau: bool = False
```

Required V1 gates:

| Gate | Purpose | Applies To | Blocker |
|---|---|---|---|
| `schema_valid` | Response matches Pydantic schema | all | yes |
| `route_policy_compliant` | Node outputs obey supervisor policy | all | yes |
| `no_generic_reanchor` | Blocks generic phrases like "What's on your mind today?" | all | yes |
| `max_one_question` | At most one user-facing question | all | yes |
| `question_allowed` | No question when turn policy says no | soft/safety/repeat/cancel | yes |
| `no_fake_signals` | No signal updates when extraction is disallowed | soft/safety/repeat/cancel | yes |
| `no_tool_calls_when_blocked` | No candidate/resource retrieval when policy blocks tools | soft/safety/repeat/cancel | yes |
| `recommendation_earned` | Experts only after context/policy threshold | expert/resource routes | yes |
| `candidate_ids_valid` | Expert/resource cards include canonical IDs | recommendation routes | yes |
| `selected_count_cap` | Expert cards capped at 3 | expert route | yes |
| `deterministic_ranking_used` | LLM did not choose final experts | expert route | yes |
| `memory_allowed` | No memory updates for guests or soft turns | guest/soft | yes |
| `response_non_empty` | User gets a renderable response if success | all | yes |
| `unsupported_boundary_safe` | Unsupported requests are not over-obeyed | unsupported/safety | yes |
| `platform_boundary_preserved` | No booking/subscription decisions from Python | all | yes |

### 7. Diagnostic And Refinement Loop

Analyst Agent does not stop at a bad query. It diagnoses and refines.

Infinity AI should not stop at a bad response block. It should diagnose and regenerate once.

Recommended response-quality loop:

```text
compose_response
  -> validate_response
  -> if pass: persist
  -> if fail and repairable and budget remains:
       diagnose_response_failure
       -> refine_response_prompt
       -> compose_response_again
       -> validate_response_again
       -> persist if pass
  -> if still fail:
       persist failed graph run
       return platform error
```

Important: the repair loop must not use deterministic fallback assistant copy. It should either produce validated LLM output or fail loudly.

Example repair cases:

- LLM generated `soft_response_text` plus `clarification_question` on a chitchat turn
- LLM used a banned generic re-anchor question
- LLM requested expert retrieval in a guest/no-booking policy state
- LLM generated memory updates for an anonymous user
- LLM generated two questions
- LLM returned empty response blocks

### 8. Artifacts Make Behavior Inspectable

Analyst Agent returns artifacts:

- table artifacts
- SQL artifacts
- execution steps
- quality report
- lineage

Infinity AI should treat response blocks, signal snapshots, candidate pools, score breakdowns, and memory updates as artifacts.

Recommended artifact types:

```python
class InfinityArtifact(BaseModel):
    id: str
    kind: Literal[
        "conversation_act",
        "signal_snapshot",
        "response_blocks",
        "candidate_pool",
        "score_breakdown",
        "selected_slots",
        "memory_update",
        "quality_report",
        "policy_snapshot",
        "llm_call",
        "tool_result",
    ]
    title: str
    content: dict
    metadata: dict = {}
```

These can initially live inside `ai_graph_runs.state_after`, `ai_turns.trace_metadata`, and the existing recommendation tables. Do not add SQL until the JSON starts becoming unreviewable.

## What To Copy From Analyst Agent

### Copy 1: Job Contract Discipline

Analyst has `QuerySpec -> RunResult`.

Infinity should have:

```text
Raw message -> SupervisorDecision -> InfinityTurnSpec -> InfinityTurnResult
```

`InfinityTurnResult` should include:

- response blocks
- state updates
- signal updates
- memory updates
- recommendation run
- quality report
- execution steps
- artifacts
- trace metadata

### Copy 2: Conditional Graph, Not Linear Maybe-Nodes

Analyst only routes to diagnostics when diagnostics are needed.

Infinity should route by `conversation_act` and `turn_policy`:

- chitchat should not pass through extraction
- safety should not pass through extraction
- expert route should not pass through resource scoring
- resource route should not pass through expert scoring unless explicitly mixed intent
- correction should use bounded context patching

This reduces accidental behavior.

### Copy 3: Budget And Attempt Counters

Analyst uses attempts and budget to avoid infinite repair.

Infinity should track:

- LLM call count
- provider retry count
- graph retry count
- tool call count
- response regeneration count
- max latency

### Copy 4: Quality-Driven Retry

Analyst validates results before presenting.

Infinity should validate response blocks before persistence and UI return.

### Copy 5: Diagnostics As First-Class State

Analyst stores diagnostics and error history.

Infinity should store:

- response validation failures
- policy violation attempts
- prompt/schema validation failures
- candidate retrieval emptiness reason
- no-match reason
- route confidence
- repair prompts used

### Copy 6: Artifacts And Lineage

Analyst can show SQL and data lineage.

Infinity should show:

- why this route was selected
- what context was loaded
- what signals were extracted
- what was patched
- which tools ran
- what candidates were scored
- why slots were selected
- which response blocks were emitted
- which gates passed

### Copy 7: Presentation Is Last

Analyst does not present until after `validate`.

Infinity should not return response blocks to the UI until:

- schema validation passed
- quality gates passed
- route policy passed
- platform boundary passed
- no banned generic question remains

## What Not To Copy From Analyst Agent

Analyst Agent has some patterns that are acceptable for a prototype but should not be copied into Infinity production.

### Do Not Copy: In-Memory Job Store

Analyst uses `job_store: Dict[str, Dict[str, Any]]`.

Infinity already has database-backed `ai_conversations`, `ai_turns`, and `ai_graph_runs`. Keep Postgres as the source of truth.

### Do Not Copy: Loose LLM JSON Fallbacks

Analyst attempts to recover unparseable SQL and can fallback to `SELECT 1`.

Infinity must not do silent deterministic fallback for assistant responses. If structured output fails after one repair, fail closed.

### Do Not Copy: Provider Fallback Semantics

Analyst has automatic provider fallback.

Infinity has director constraints around provider/model selection. For required mode, do not silently fallback to a different provider/model unless explicitly allowed by config and logged in `model_calls`.

### Do Not Copy: Monkey Patching For Streaming

Analyst monkey-patches `add_execution_step` for streaming.

Infinity should implement trace streaming or trace persistence directly, not monkey-patch.

### Do Not Copy: Frontend `innerHTML` Rendering

Analyst frontend uses direct HTML injection in places.

Infinity must keep typed React rendering and avoid injecting arbitrary LLM HTML.

## Current Infinity Gaps

### Gap 1: No Turn Quality Gate Layer

Current Infinity validates schemas, but it does not have an Analyst-style quality report that decides whether output is good enough to present.

Impact:

- generic questions can slip through
- invalid conversational behavior can be persisted
- chitchat can accidentally become goal discovery
- no-match behavior can be unclear

### Gap 2: Graph Is Still Too Linear

The current graph uses `maybe_*` nodes. Some skip correctly, but the graph still conceptually walks through recommendation machinery even for routes that should never approach it.

Impact:

- harder traces
- easier future regressions
- more places to forget policy checks

### Gap 3: Prompt Responsibilities Are Too Broad

`build_strategy_prompt()` must handle soft responses, goal planning, micro-consent, framework, memory proposals, and recommendation gating.

Analyst has prompt specialization by job:

- SQL generation prompt
- diagnostic prompt
- refinement prompt
- answer presentation prompt

Infinity should split prompt responsibilities by flow.

### Gap 4: Response Validation Is Reactive

Current response assembly can strip duplicate or generic questions. That helps, but it is not enough.

Target behavior:

- validator detects violation
- diagnostic record explains it
- graph regenerates once using a repair prompt
- if still bad, fail closed

### Gap 5: No Explicit Flow Artifacts

Infinity stores traces, but it needs route-level artifacts:

- `conversation_act_artifact`
- `turn_policy_artifact`
- `quality_report_artifact`
- `candidate_pool_artifact`
- `response_validation_artifact`

### Gap 6: No Analyst-Style Plateau / Attempt Logic

If the LLM keeps generating invalid responses, Infinity should not keep retrying. It should stop after a bounded repair attempt and persist the failure.

### Gap 7: No Shadow Evaluation Mode

Analyst can run an analysis job and inspect artifacts. Infinity needs a shadow mode where the new graph can run for review without changing the user-facing answer.

## Target Architecture: Infinity Turn Operating System

### High-Level Flow

```text
Browser
  -> Next public route
  -> actor/session/feature flag resolution
  -> Python private service
  -> LangGraph turn runtime
  -> Next internal platform APIs
  -> Postgres persistence
  -> typed response blocks
  -> React renderer
```

### Runtime Flow

```text
start_turn
load_context
profile_context
supervise_turn
route_by_conversation_act

  chitchat/meta/repeat/cancel/unsupported/safety:
    compose_soft_or_boundary_response
    validate_response
    persist

  goal_help:
    extract_signals
    normalize_signals
    choose_goal_step
    plan_goal_response
    maybe_framework
    validate_response
    persist

  resource_request:
    extract_signals
    normalize_signals
    policy_check_resources
    retrieve_resources
    score_resources
    allocate_resource_slots
    compose_resource_response
    validate_response
    persist

  expert_request:
    extract_signals
    normalize_signals
    policy_check_experts
    retrieve_experts
    score_experts
    allocate_expert_slots
    compose_expert_response
    validate_response
    persist

  correction:
    bind_correction_to_prior_context
    patch_context
    validate_context_patch
    compose_correction_response
    validate_response
    persist

  resume_previous_flow:
    resolve_resume_target
    continue_target_flow_or_compose_resume
    validate_response
    persist
```

### ASCII Architecture View

High-level user-message path:

```text
                         BROWSER
                 InfinityAiPanel / Homepage
                              |
                              v
              +--------------------------------+
              | Next.js public AI route        |
              | - feature flag                 |
              | - guest/auth actor             |
              | - conversation ownership       |
              | - signed Python request        |
              +--------------------------------+
                              |
                              v
              +--------------------------------+
              | Python Infinity AI Service     |
              | FastAPI + LangGraph            |
              +--------------------------------+
                              |
                              v
        +------------------------------------------------+
        | Conversation Supervisor / Router               |
        |                                                |
        | classify conversation_act before extraction:   |
        | - chitchat                                    |
        | - goal_help                                   |
        | - resource_request                            |
        | - expert_request                              |
        | - correction                                  |
        | - repeat / resume / cancel                    |
        | - unsupported / safety                        |
        +------------------------------------------------+
                              |
                              v
        +------------------------------------------------+
        | Route-Specific LangGraph Flow                  |
        +------------------------------------------------+
             |              |                |
             v              v                v
      soft response    goal companion    resource/expert flow
      no tools         extract signals   platform tools
      no memory        framework         deterministic scoring
      no fake goals    clarity flow      cards if earned

                              |
                              v
        +------------------------------------------------+
        | Response Validation / Quality Gates            |
        | - max one question                             |
        | - no generic fallback prose                    |
        | - no fake signals on soft turns                |
        | - no tools when policy blocks tools            |
        | - recommendations must be earned               |
        +------------------------------------------------+
                  | pass                      | fail
                  v                           v
        assemble response_blocks      diagnose + repair once
                  |                           |
                  v                           v
        persist turn + trace          fail closed if still invalid
```

Full platform shape:

```text
+--------------------+
| Browser            |
|                    |
| User types message |
+---------+----------+
          |
          v
+-------------------------------+
| Next.js                       |
|                               |
| Public route                  |
| /api/infinity-ai/...          |
|                               |
| Owns:                         |
| - auth                        |
| - guest mode                  |
| - policy                      |
| - booking rights              |
| - persistence bridge          |
+---------------+---------------+
                |
                | signed internal request
                v
+-------------------------------+
| Python Infinity AI            |
|                               |
| Owns:                         |
| - conversation intelligence   |
| - LangGraph orchestration     |
| - LLM structured calls        |
| - routing                     |
| - signal extraction           |
| - response composition        |
| - quality validation          |
| - deterministic scoring       |
+---------------+---------------+
                |
                | internal platform tools only
                v
+-------------------------------+
| Next.js Internal APIs         |
|                               |
| - policy check                |
| - eligible experts            |
| - public resources            |
| - persist turn/trace          |
| - record events               |
+---------------+---------------+
                |
                v
+-------------------------------+
| Postgres / Supabase           |
|                               |
| - ai_conversations            |
| - ai_turns                    |
| - ai_graph_runs               |
| - ai_user_signals             |
| - ai_memory_items             |
| - ai_recommendation_*         |
+-------------------------------+
```

Old failure shape:

```text
User: "Tell me a joke"
        |
        v
goal discovery funnel
        |
        v
"What brings you here today?"
```

New target shape:

```text
User: "Tell me a joke"
        |
        v
Supervisor: conversation_act = chitchat
        |
        v
soft_response flow
        |
        v
LLM-generated brief response
        |
        v
validator checks:
- no goal signals
- no expert/resource tools
- no generic hardcoded question
        |
        v
return soft_response block
```

The main idea: Infinity AI becomes a traceable turn engine. The LLM writes the conversational content, but the graph decides what is allowed, validates it, persists the trace, and prevents the system from falling back into hardcoded funnel behavior.

### LLM Call Budget Between User Query And Final Response

Target architecture:

```text
User message
  -> LLM call 1: supervisor/router
  -> optional LLM calls depending on route
  -> deterministic tools/scoring/validation
  -> final response
```

Expected LLM calls per turn:

| Turn type | Normal LLM calls | Notes |
|---|---:|---|
| `hi`, thanks, joke, meta, repeat, cancel | 2 | supervisor + soft response composer |
| safety / unsupported | 2 | supervisor + boundary composer |
| goal-help / clarity | 3 | supervisor + signal extraction + strategy/response composer |
| resource request | 3-4 | supervisor + extraction + resource response composer, maybe framework/strategy |
| expert request | 4-5 | supervisor + extraction + expert explanation/readiness composer; matching itself is deterministic |
| correction | 2-3 | supervisor + bounded correction/response composer |

Quality repair adds at most:

```text
+1 LLM retry
```

only if the response fails validation, for example duplicate question, generic fallback phrase, invalid JSON, or policy violation.

Important: these are LLM calls, not platform/tool calls. Expert retrieval, resource retrieval, policy checks, persistence, and deterministic scoring are not LLM calls.

Practical budget:

```text
Simple turn:       2 LLM calls
Goal turn:         3 LLM calls
Resource turn:     3-4 LLM calls
Expert turn:       4-5 LLM calls
Failed validation: +1 repair call max
```

The runtime should enforce this with `TurnBudget` so the system never silently grows beyond the intended call count.

### Target Graph Nodes

#### 1. `start_turn`

Responsibilities:

- create graph run
- persist user turn before LLM work
- initialize budget
- initialize execution history

Current equivalent:

- Python calls `platform_client.start_graph_run()`
- Next inserts `ai_turns` user row and `ai_graph_runs` row

Upgrade:

- include `budget_remaining`
- include `graph_variant`
- include `feature_flag_snapshot`
- include `provider_config_snapshot` without secrets

#### 2. `load_context`

Responsibilities:

- load conversation
- load recent turns
- load memory
- load platform policy

Current equivalent:

- `_load_context()`
- `buildInfinityPolicyContext()`

Upgrade:

- split `context` into typed sections:
  - `conversation_context`
  - `memory_context`
  - `platform_policy`
  - `surface_context`
  - `recent_turn_context`
- log context counts, not raw sensitive content, in node summary

#### 3. `profile_context`

Analyst has `profile`, which turns schema into a schema card.

Infinity equivalent should build a "conversation context card":

```python
class ContextProfile(BaseModel):
    turn_count: int
    prior_phase: str
    known_intents: list[str]
    known_outcomes: list[str]
    known_constraints: list[str]
    known_location: list[str]
    memory_count: int
    last_assistant_question: str | None
    last_recommendation_type: str | None
    user_is_guest: bool
    can_book_sessions: bool
    can_recommend_experts: bool
    can_recommend_resources: bool
```

This gives the supervisor compact, stable context instead of raw history.

#### 4. `supervise_turn`

Responsibilities:

- classify conversation act
- choose active flow
- create turn policy
- identify interruption/resume behavior

Must output:

- `conversation_act`
- `active_flow`
- `interrupted_flow`
- `resume_available`
- `flow_confidence`
- `turn_policy`
- `rationale`

Rules:

- no signal extraction before this node
- no tools before this node
- no recommendations before this node
- no memory updates before this node

#### 5. `route_by_conversation_act`

Use conditional LangGraph edges.

Do not rely only on `maybe_*` nodes.

Routing table:

| Act | Flow | Extraction | Tools | Recommendations | Memory | Question |
|---|---|---:|---:|---:|---:|---:|
| `chitchat` | `soft_response` | no | no | no | no | no |
| `meta_question` | `soft_response` | no | no | no | no | optional no by default |
| `repeat` | `soft_response` | no | no | no | no | no |
| `cancel_or_restart` | `soft_response` | no | no | no | no | no |
| `unsupported` | `soft_response` | no | no | no | no | no |
| `safety` | `safety` | no | no | no | no | no |
| `goal_help` | `goal_companion` | yes | no | no | yes if auth | yes |
| `resource_request` | `resource_search` | yes | resource only | resources only | yes if auth | maybe |
| `expert_request` | `expert_matching` | yes | expert only | experts only | yes if auth | maybe |
| `correction` | `repair` | bounded | no | no | maybe | maybe |
| `resume_previous_flow` | previous flow | depends | depends | depends | no by default | maybe |

#### 6. `extract_signals`

Only runs when `turn_policy.allow_extraction=true`.

Upgrade:

- accept `context_profile`
- reject unsupported/off-topic acts
- output `extraction_scope`
- include `evidence_required=true`
- no signal without evidence

#### 7. `normalize_signals`

Upgrade:

- separate `snapshot_before`, `snapshot_after`, `patch`
- support corrections:
  - replace Canada with London
  - mark old geography as superseded
  - keep provenance

#### 8. `choose_goal_step`

Equivalent of Analyst routing functions:

- `need_diagnostics`
- `should_continue_iteration`
- `next_after_refine`

Infinity should have typed route functions:

```python
def should_ask_question(state) -> bool
def should_offer_framework(state) -> bool
def should_retrieve_resources(state) -> bool
def should_retrieve_experts(state) -> bool
def should_prepare_session_readiness(state) -> bool
```

Each function should explain the decision in metadata.

#### 9. `compose_*` Nodes

Split one broad strategy prompt into route-specific composers:

- `compose_soft_response`
- `compose_goal_reflection`
- `compose_mini_framework`
- `compose_resource_intro`
- `compose_expert_elevation`
- `compose_session_readiness`
- `compose_correction_ack`
- `compose_boundary_response`

Each composer should have:

- its own schema
- its own prompt id
- its own version
- its own quality gates

#### 10. `retrieve_resources`

Equivalent to Analyst `profile/mvq` but for platform resources.

Inputs:

- signal snapshot
- resource intent
- guest/auth policy
- public/private resource policy

Output artifact:

```python
class ResourcePoolArtifact(BaseModel):
    query_terms: list[str]
    broad_fallback_used: bool
    candidates: list[ResourceCandidate]
    retrieval_count: int
    empty_reason: str | None
```

#### 11. `retrieve_experts`

Must call Next/platform.

Python must not query legacy RLS-disabled tables directly.

Output artifact:

```python
class ExpertPoolArtifact(BaseModel):
    candidate_count: int
    eligibility_policy_snapshot: dict
    candidates: list[ExpertCandidate]
    empty_reason: str | None
```

#### 12. `score_candidates`

Keep deterministic.

Upgrade:

- separate `score_inputs`
- include `score_breakdown`
- include missing-data warnings
- include cold-start flag
- include guardrail flags

#### 13. `allocate_slots`

Keep deterministic.

Output:

- selected slots
- why each slot was selected
- why non-selected high candidates were not selected

#### 14. `validate_response`

This is the biggest Analyst-inspired addition.

Validation happens after composition and before persistence.

Required output:

```python
class ResponseValidationResult(BaseModel):
    passed: bool
    score: float
    gates: list[TurnQualityGate]
    repairable: bool
    repair_instruction: str | None
```

If validation fails and repairable:

```text
diagnose_response_failure -> regenerate_once -> validate_response
```

#### 15. `persist_turn_and_trace`

Only persist successful response as completed.

If failed:

- update graph run as failed
- keep user turn
- keep node traces
- keep model calls
- keep diagnostics
- keep error

## Prompt Architecture Upgrade

### Current Problem

The current strategy prompt is doing too much:

- soft responses
- goal reflections
- clarification questions
- mini-framework gating
- expert retrieval gating
- memory proposal

### Target Prompt Registry

Create a prompt registry:

```python
PROMPTS = {
    "conversation_supervisor": PromptSpec(...),
    "signal_extraction": PromptSpec(...),
    "soft_response_composer": PromptSpec(...),
    "goal_strategy_planner": PromptSpec(...),
    "mini_framework_composer": PromptSpec(...),
    "resource_response_composer": PromptSpec(...),
    "expert_elevation_composer": PromptSpec(...),
    "session_readiness_composer": PromptSpec(...),
    "correction_composer": PromptSpec(...),
    "response_repair": PromptSpec(...),
}
```

Each `PromptSpec`:

```python
class PromptSpec(BaseModel):
    prompt_id: str
    version: str
    system_prompt: str
    input_schema_name: str
    output_schema_name: str
    owner: str
    quality_gates: list[str]
```

### Prompt Rules

Every prompt must state:

- which fields are user-visible
- whether questions are allowed
- whether recommendations are allowed
- whether memory updates are allowed
- whether platform tools are allowed
- that policy and booking are platform-owned

### Banned Prompt Behavior

No route should ask generic catch-all questions like:

- "What's on your mind today?"
- "What brings you here today?"
- "What specific challenge are you focusing on?"

If a question is needed, it must be context-specific.

Examples:

- "Which deadline is making this decision feel urgent?"
- "Are you comparing study options, job options, or both?"
- "Is budget, location, or timing the constraint you want to optimize first?"

## Response Block Architecture Upgrade

### Current Blocks

Current `infinityResponseBlockTypes` include:

- `soft_response`
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

### Recommended Blocks

Keep:

- `soft_response`
- `reflection`
- `clarification`
- `insight`
- `direction`
- `micro_consent`
- `mini_framework`
- `expert_elevation`
- `expert_cards`
- `session_readiness`
- `system_notice`

Deprecate for generated assistant responses:

- `continuity`
- `no_match`

Add when needed:

- `resource_cards`
- `sign_in_cta`
- `correction_ack`
- `boundary_response`
- `resume_prompt`
- `quality_notice` only for admin/internal trace, not normal UI

### Response Assembly Rule

The deterministic assembler may:

- validate schema
- remove duplicate questions
- remove banned generic questions
- order blocks
- cap expert cards
- attach deterministic card metadata

The deterministic assembler must not:

- invent assistant prose
- replace failed LLM output with canned assistant text
- convert a soft turn into a goal question
- create recommendation cards not backed by selected artifacts

## Persistence Upgrade

### Use Existing Tables First

Current useful tables:

- `ai_conversations`
- `ai_turns`
- `ai_user_signals`
- `ai_memory_items`
- `ai_graph_runs`
- `ai_recommendation_runs`
- `ai_recommendation_candidates`
- `ai_recommendation_events`

Do not add SQL immediately.

Store V1 upgrades in:

- `ai_graph_runs.state_before`
- `ai_graph_runs.state_after`
- `ai_graph_runs.node_traces`
- `ai_graph_runs.model_calls`
- `ai_turns.trace_metadata`
- `ai_turns.model_metadata`

### Add Later Only If JSON Becomes Painful

Potential future tables:

- `ai_turn_quality_reports`
- `ai_flow_artifacts`
- `ai_diagnostics`
- `ai_prompt_runs`

Do not add these until the JSON-based trace proves insufficient.

### Conversation Context vs User Memory

Infinity AI maintains two different kinds of continuity.

Conversation context is scoped to one chat/conversation. It exists for both guests and authenticated users.

```ts
{
  conversationId: "uuid",
  activeFlow: "goal_companion",
  interruptedFlow: null,
  phase: "mini_clarity",
  lastUserAct: "goal_help",
  pendingQuestionId: "timeline_constraint",
  resumeAvailable: true,
  signalSnapshot: {
    primaryIntent: "study_abroad_decision",
    desiredOutcomes: ["choose between masters and job"],
    stage: "student",
    emotions: ["uncertain"],
    constraints: ["budget"],
    timeline: "next month",
    geography: ["London"]
  },
  recentTurns: [
    { role: "user", content: "I need help deciding..." },
    { role: "assistant", responseBlocks: [] }
  ]
}
```

User memory is durable across conversations and must exist only for authenticated users when policy allows memory updates.

```ts
{
  userId: "better-auth-user-id",
  memoryItems: [
    {
      type: "goal",
      content: "Considering masters in London vs getting a job",
      confidence: 0.87,
      provenance: {
        conversationId: "uuid",
        turnId: "uuid"
      }
    }
  ]
}
```

Rules:

- guests can have conversation-local context, but not durable cross-chat user memory
- authenticated users can have both conversation context and durable user memory
- memory writes must be controlled by `TurnPolicy.allow_memory_updates`
- memory writes must be traceable to the conversation and turn that created them
- Python may propose memory updates, but platform persistence and user ownership remain platform-owned

## Platform Boundary

### Python Owns

- conversation intelligence
- supervisor classification
- signal extraction
- response planning
- route-specific composition
- deterministic scoring math after platform candidate DTOs
- response quality validation
- trace metadata assembly

### Next/platform Owns

- auth
- anonymous session validation
- conversation ownership
- policy
- subscription checks
- booking rights
- mentor eligibility DTOs
- resource visibility DTOs
- persistence
- recommendation event recording
- session/booking creation

### Browser Owns

- typed rendering
- anonymous session id storage
- sign-in CTA display
- sending user messages to Next only
- never calling Python directly

## Non-Breaking Rollout Strategy

### Feature Flags

Current top-level flag:

- `INFINITY_AI_ENABLED`

Add subflags:

- `INFINITY_AI_GRAPH_V2_ENABLED=false`
- `INFINITY_AI_GRAPH_V2_SHADOW=false`
- `INFINITY_AI_RESPONSE_QUALITY_GATES=true`
- `INFINITY_AI_SUPERVISOR_REQUIRED=true`
- `INFINITY_AI_REPAIR_LOOP_ENABLED=false` initially

### Rollout Phases

#### Phase 0: Document And Baseline

No runtime behavior changes.

Deliver:

- this document
- current graph trace examples
- failure transcript baseline
- test matrix

#### Phase 1: Contracts And Quality Gates

Files likely touched:

- `services/infinity-ai/app/llm/schemas.py`
- `services/infinity-ai/app/orchestration/quality.py`
- `services/infinity-ai/app/orchestration/artifacts.py`
- `services/infinity-ai/tests/test_quality_gates.py`
- `lib/infinity-ai/schemas.ts`

Implement:

- `TurnQualityReport`
- `TurnQualityGate`
- `InfinityExecutionStep`
- `InfinityArtifact`
- `TurnBudget`
- quality gate functions

No graph rewrite yet.

Verification:

- unit tests for every gate
- no UI behavior change

#### Phase 2: Supervisor As Materialized TurnSpec

Files likely touched:

- `services/infinity-ai/app/orchestration/supervisor.py`
- `services/infinity-ai/app/orchestration/graph.py`
- `services/infinity-ai/app/llm/prompts.py`
- `services/infinity-ai/tests/test_supervisor.py`
- `services/infinity-ai/tests/test_graph_orchestration.py`

Implement:

- `InfinityTurnSpec`
- route table
- typed `TurnPolicy`
- no extraction before supervisor
- no tools before supervisor

Acceptance:

- `Hi` -> soft route
- `Tell me a joke` -> soft route
- `Thanks` -> soft route
- `Never mind` -> cancel route
- `Actually I meant London` -> correction route
- no fake signals for soft turns

#### Phase 3: Conditional Graph Edges

Files likely touched:

- `services/infinity-ai/app/orchestration/graph.py`
- `services/infinity-ai/tests/test_graph_orchestration.py`

Implement:

- conditional route after supervisor
- separate route subgraphs where practical
- no linear traversal through irrelevant nodes

Acceptance:

- soft route node traces do not include extraction, normalization, expert retrieval, scoring, allocation
- expert route includes policy, retrieval, scoring, allocation
- resource route does not include expert scoring unless mixed act explicitly permits it

#### Phase 4: Route-Specific Composers

Files likely touched:

- `services/infinity-ai/app/llm/prompts.py`
- `services/infinity-ai/app/llm/schemas.py`
- `services/infinity-ai/app/composers/*.py`
- `services/infinity-ai/tests/test_composers.py`

Implement:

- soft response composer
- goal response composer
- resource response composer
- expert response composer
- correction composer
- boundary composer

Acceptance:

- no route shares a broad catch-all strategy prompt
- each composer has its own prompt id/version/schema
- model calls show the route-specific prompt id

#### Phase 5: Response Quality Gate And Repair Loop

Files likely touched:

- `services/infinity-ai/app/orchestration/quality.py`
- `services/infinity-ai/app/orchestration/diagnostics.py`
- `services/infinity-ai/app/orchestration/graph.py`
- `services/infinity-ai/app/llm/prompts.py`
- `services/infinity-ai/tests/test_response_repair.py`

Implement:

- validate response blocks
- diagnose response failure
- regenerate once when repairable
- fail closed when still invalid

Acceptance:

- if LLM returns "What's on your mind today?", gate fails
- repair prompt regenerates route-appropriate response
- if repair fails, no invalid assistant blocks are returned

#### Phase 6: Resource Flow Artifactization

Files likely touched:

- `lib/infinity-ai/repository.ts`
- `lib/infinity-ai/schemas.ts`
- `services/infinity-ai/app/orchestration/graph.py`
- `services/infinity-ai/app/matching/resource_scoring.py`
- `components/landing/infinity-ai/ResponseBlockRenderer.tsx`

Implement:

- resource candidate artifact
- public resource policy
- broad fallback pool
- deterministic scoring
- `resource_cards`

Acceptance:

- guest can receive public resources
- guest cannot receive expert cards unless policy explicitly allows preview
- resource-only request does not show sign-in CTA
- mentor request may show sign-in CTA if guest

#### Phase 7: Expert Flow Quality And Candidate Diagnostics

Files likely touched:

- `lib/infinity-ai/expert-candidates.ts`
- `services/infinity-ai/app/matching/scoring.py`
- `services/infinity-ai/app/matching/allocation.py`
- `services/infinity-ai/app/orchestration/quality.py`
- `services/infinity-ai/tests/test_matching_quality.py`

Implement:

- candidate pool artifact
- selected slot artifact
- no-match diagnostics
- cold-start confidence flag
- guardrail validation

Acceptance:

- final experts selected by deterministic ranking
- LLM only explains selected experts
- no expert cards when policy blocks booking/recommendation
- single high-confidence expert behavior is explicit and traceable

#### Phase 8: Trace Endpoint Upgrade

Files likely touched:

- `lib/infinity-ai/repository.ts`
- `app/api/internal/infinity-ai/conversations/[conversationId]/trace/route.ts`
- `lib/infinity-ai/schemas.ts`

Implement trace sections:

- conversation summary
- turns
- execution steps
- artifacts
- quality reports
- diagnostics
- node traces
- model calls
- policy snapshots
- signal snapshots
- memory updates
- recommendation runs
- candidate scores

Acceptance:

- one admin trace response can explain a bad turn without reading logs

#### Phase 9: Shadow Mode And Rollout

Implement:

- old behavior remains default
- new graph can run in shadow and persist trace only
- compare old vs new outputs
- promote to visible only after eval pass

Acceptance:

- feature flag off preserves old flow
- shadow mode has no user-visible behavior change
- rollback is one env change

## Test Matrix

### Supervisor Tests

| Input | Expected Act | Extraction | Tools | Question |
|---|---|---:|---:|---:|
| `Hi` | `chitchat` | no | no | no |
| `Tell me a joke` | `chitchat` | no | no | no |
| `Thanks` | `chitchat` | no | no | no |
| `What can you do?` | `meta_question` | no | no | no |
| `Can you repeat that?` | `repeat` | no | no | no |
| `Never mind` | `cancel_or_restart` | no | no | no |
| `Actually I meant London, not Canada` | `correction` | bounded | no | maybe |
| `I need help deciding between masters and job` | `goal_help` | yes | no | maybe |
| `Recommend resources` | `resource_request` | yes | resource | maybe |
| `Recommend mentors` | `expert_request` | yes | expert | maybe |

### Response Quality Tests

- generic re-anchor removed/repaired
- duplicate questions blocked
- soft response has no question
- soft response has no memory updates
- soft response has no recommendation run
- safety response has no tools
- expert response has deterministic selected candidates
- resource response has valid hrefs
- empty response fails validation

### Trajectory Tests

#### Goal -> Joke -> Continue

```text
User: I need help deciding between masters in London and getting a job.
Expected: goal_help, extraction runs, context saved.

User: Tell me a joke.
Expected: chitchat, extraction skipped, prior goal state preserved, no generic goal question.

User: okay continue
Expected: resume_previous_flow, resumes masters/job context.
```

#### Correction

```text
User: I want to study in Canada.
Expected: geography=Canada.

User: Actually I meant London, not Canada.
Expected: correction, geography patched to London, Canada superseded, no fake new intent.
```

#### Guest Resource Flow

```text
User: Please recommend public courses and resources for study abroad.
Expected: resource_request, public resources only, no expert cards, no sign-in CTA for resource-only ask.
```

#### Guest Expert Flow

```text
User: Recommend mentors.
Expected: expert_request, policy blocks expert booking/recommendation or shows sign-in CTA according to platform policy, no Python booking decision.
```

## Implementation Checklist

### Python

- [ ] Add `InfinityTurnSpec`
- [ ] Add `TurnBudget`
- [ ] Add `InfinityExecutionStep`
- [ ] Add `InfinityArtifact`
- [ ] Add `TurnQualityReport`
- [ ] Add `quality.py`
- [ ] Add `diagnostics.py`
- [ ] Split broad strategy prompt into route-specific prompt specs
- [ ] Add response repair prompt
- [ ] Convert graph to conditional route subflows
- [ ] Add route-specific composer modules
- [ ] Add resource scoring module
- [ ] Add candidate artifacts
- [ ] Add quality gate tests
- [ ] Add trajectory tests

### Next.js

- [ ] Extend `lib/infinity-ai/schemas.ts` with quality/artifact/execution step DTOs
- [ ] Persist quality/artifact data in existing JSON fields
- [ ] Expand trace endpoint response
- [ ] Add resource cards renderer
- [ ] Keep browser -> Next -> Python boundary
- [ ] Keep booking platform-owned
- [ ] Keep feature flags default safe

### Database

- [ ] No immediate SQL changes
- [ ] Use existing JSON trace fields first
- [ ] Add SQL only after trace JSON becomes unmanageable

### Verification

- [ ] Python full suite
- [ ] Targeted Vitest
- [ ] AI-path TypeScript filter
- [ ] `git diff --check`
- [ ] scoped untracked AI file check
- [ ] manual smoke transcript
- [ ] admin trace review
- [ ] shadow comparison review

## Acceptance Criteria

The upgrade is acceptable only when:

1. `Hi` does not enter goal discovery.
2. `Tell me a joke` does not enter goal discovery.
3. Chitchat does not create fake signals.
4. Chitchat does not call expert/resource tools.
5. Chitchat does not ask "What's on your mind today?"
6. Generic re-anchor questions are quality-gate failures, not accepted output.
7. Real goal requests still enter the goal-companion flow.
8. Resource requests can return public resource cards.
9. Expert requests use platform policy and deterministic ranking.
10. LLM does not choose final experts.
11. Python does not create bookings or sessions.
12. Every turn has execution steps, artifacts, quality report, node traces, and model calls.
13. Failed turns persist the failure node and diagnostic reason.
14. The trace endpoint can explain the full turn after the fact.
15. Feature flag off preserves rollback.

## Recommended Immediate Next Step

Do not keep patching individual phrases.

The next engineering step should be:

```text
Phase 1: Contracts And Quality Gates
```

Deliver that as a small reviewable change:

- `TurnQualityReport`
- `TurnQualityGate`
- `InfinityExecutionStep`
- `InfinityArtifact`
- `TurnBudget`
- `quality.py`
- unit tests for banned generic questions, max-one-question, no-tools-when-blocked, no-fake-signals, memory policy, recommendation policy

Then move to:

```text
Phase 2: Supervisor As Materialized TurnSpec
```

This sequence is safer than jumping directly into a graph rewrite because it gives us gates first. Once gates exist, every later graph change can prove it did not regress.

## Future Product Ceiling

This plan is not the best final version Infinity AI can ever have.

It is the best next architecture move for where Infinity AI currently is.

The current plan is strong because it fixes the biggest product failure: Infinity AI behaves like a funnel instead of a conversation system. Adding typed routing, quality gates, flow-specific execution, traceability, and no hardcoded assistant prose is the right correction.

But it is not the final best possible implementation.

The best possible version would eventually need:

- first-class product telemetry: every turn measured for helpfulness, drop-off, conversion, confusion, repeated questions, and recommendation quality
- continuous evals: not just fixed tests, but regression suites created from real failed transcripts
- human review tooling: admins reviewing traces, rating outputs, and tagging failure causes
- prompt/version governance: prompt registry, rollout versions, A/B tests, and rollback per prompt
- memory governance: what gets remembered, why, expiry, user deletion, and privacy controls
- better retrieval: resource and expert semantic retrieval with embeddings once data quality supports it
- stronger personalization: user stage, constraints, prior actions, outcomes, and mentor fit learned over time
- better frontend interaction model: not just chat, but structured decision surfaces, saved plans, comparison panels, and clear next-step cards
- cost and latency optimization: model routing, caching, batch context packing, and explicit fallback policies
- production observability: dashboards for provider failures, bad routes, validation failures, latency, and token spend
- red-team and safety evals: prompt injection, emotional vulnerability, medical/legal/visa boundaries, and payment/booking manipulation
- business feedback loop: whether recommendations lead to booking, completion, satisfaction, and repeat engagement

So the evaluation is:

```text
Is this the absolute final form of a world-class AI companion?
No.

Is this the correct foundation to stop the current brittle behavior and build toward a world-class system?
Yes.
```

The reason this direction is correct is that it gives Infinity AI a measurable operating system first. Without that, any "better AI" attempt becomes random prompt tuning. With this foundation, every future improvement has a place:

```text
bad answer
  -> trace shows route
  -> trace shows LLM call
  -> trace shows quality gate
  -> trace shows tool output
  -> trace shows response blocks
  -> fix the exact failing layer
```

This plan is not glamorous, but it is the right engineering base. The best possible product comes later, after this foundation lets the team learn safely from real usage.

## Final Architectural Principle

Analyst Agent works because it treats each request as a job with a measurable result.

Infinity AI should treat each user turn the same way:

```text
Turn in -> classify -> execute allowed flow -> validate -> repair if needed -> persist trace -> present typed artifacts
```

That is the difference between a brittle chatbot and a production-grade conversation operating system.
