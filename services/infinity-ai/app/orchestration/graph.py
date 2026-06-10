from __future__ import annotations

import json
from hashlib import sha256
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, Awaitable, Callable, TypedDict
from uuid import uuid4

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel

from app.adapters.platform_client import PlatformClient
from app.composers import (
    compose_blocked_expert_response,
    compose_boundary_response,
    compose_correction_response,
    compose_expert_no_match_response,
    compose_expert_planning_response,
    compose_goal_workbench_response,
    compose_resource_response,
    compose_soft_response,
    repair_response_bundle,
)
from app.core.config import get_settings
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import (
    ActiveGoalState,
    ConversationStrategy,
    ExpertRetrievalPlan,
    GoalWorkbenchDraft,
    MemoryUpdateDraft,
    PendingInteraction,
    PendingSlotPatch,
    StrategyBundle,
    TurnPolicy,
    TurnResolutionDecision,
)
from app.matching.allocation import select_slots
from app.matching.models import (
    PlatformCandidate,
    PlatformResourceCandidate,
    ScoredCandidate,
    ScoredResourceCandidate,
)
from app.matching.resource_scoring import (
    RESOURCE_ALGORITHM_VERSION,
    score_resource_candidate,
    select_resource_slots,
)
from app.matching.scoring import score_candidate
from app.observability.smoke_log import (
    capture_completed_turn,
    capture_failed_turn,
    http_status_for_error,
)
from app.orchestration.budgets import TurnBudget
from app.orchestration.diagnostics import ResponseDiagnostic, diagnose_response_failure
from app.orchestration.quality import TurnQualityReport, evaluate_turn_quality
from app.orchestration.response_blocks import build_response_blocks
from app.orchestration.state import (
    ContextProfile,
    InfinityTurnSpec,
    choose_conversation_phase,
)
from app.orchestration.supervisor import classify_conversation_turn
from app.orchestration.turn_controller import run_turn_controller
from app.orchestration.turn_resolution import resolve_pending_turn
from app.readiness.generator import generate_recommendation_bundle
from app.signals.extractor import extract_signals
from app.signals.correction import apply_correction_patch, generate_correction_patch
from app.signals.domain_taxonomy import expand_domain_terms
from app.signals.models import SignalEvidence, SignalUpdate
from app.signals.normalizer import normalize_extracted_signals

GRAPH_VERSION = "infinity-langgraph-v1"

FLOW_PHASE_NAMES = {
    "repair",
    "soft_response",
    "safety",
    "resource_search",
    "expert_matching",
    "goal_companion",
    "platform_help",
}

VALID_CONVERSATION_PHASES = {
    "discovery",
    "clarifying",
    "mini_clarity",
    "framework",
    "micro_consent",
    "expert_elevation",
    "expert_recommendation",
    "session_readiness",
}

PENDING_INTERACTION_KEY = "pending_interaction"
ACTIVE_GOAL_KEY = "active_goal"
UNIVERSAL_GOAL_FIELDS = {
    "intent",
    "desired_outcome",
    "current_state",
    "constraints",
    "urgency",
    "emotional_state",
    "decision_scope",
    "timeline",
}
DOMAIN_GOAL_FIELDS: dict[str, set[str]] = {
    "study": {
        "budget",
        "study_level",
        "subject_field",
        "geography",
        "timeline",
        "funding_source",
        "application_timeline",
        "constraints",
        "feasibility_flags",
    },
    "career": {
        "role",
        "industry",
        "experience_level",
        "skill_gap",
        "timeline",
        "constraints",
    },
    "startup": {
        "stage",
        "market",
        "funding_need",
        "traction",
        "timeline",
        "constraints",
    },
    "skill": {
        "subject_field",
        "current_level",
        "practice_time",
        "timeline",
        "constraints",
    },
    "life_direction": {
        "area_of_life",
        "stuck_pattern",
        "support_needed",
        "next_step_need",
        "decision_scope",
        "emotional_state",
        "timeline",
        "constraints",
    },
    "mentor": {
        "mentor_category",
        "subject_field",
        "expertise_keywords",
        "industries",
        "constraints",
    },
    "resource": {
        "resource_focus",
        "subject_field",
        "current_level",
        "timeline",
        "constraints",
    },
}
ALL_DOMAIN_GOAL_FIELDS = set().union(*DOMAIN_GOAL_FIELDS.values())
LEGACY_GOAL_FIELD_ALIASES = {
    "study_abroad": "study",
    "study_planning": "study",
    "study_decision": "study",
    "education": "study",
    "academic": "study",
    "career_planning": "career",
    "career_decision": "career",
    "life": "life_direction",
    "general_direction": "life_direction",
    "mentor_search": "mentor",
    "expert_matching": "mentor",
    "resource_search": "resource",
    "learning_resource": "resource",
}

NODE_ORDER = [
    "load_context",
    "turn_resolution",
    "apply_pending_answer",
    "turn_controller",
    "classify_conversation_act",
    "goal_workbench",
    "patch_correction_context",
    "extract_signals",
    "normalize_signals",
    "choose_conversation_step",
    "generate_strategy",
    "maybe_generate_framework",
    "maybe_retrieve_resources",
    "score_resource_candidates",
    "allocate_resource_slots",
    "maybe_retrieve_experts",
    "score_candidates",
    "allocate_slots",
    "diagnose_expert_selection",
    "maybe_generate_expert_elevation",
    "maybe_generate_session_readiness",
    "assemble_response_blocks",
    "validate_response",
    "diagnose_response_failure",
    "repair_response",
    "persist_turn_and_trace",
]

NODE_SUMMARY_KEY = "_node_summary"
ACTIONABLE_CONTROLLER_ROUTES = {
    ("expert_request", "expert_matching"),
    ("resource_request", "resource_search"),
    ("goal_help", "goal_companion"),
}
CONTROLLER_CONFIDENCE_THRESHOLD = 0.75


class InfinityGraphState(TypedDict, total=False):
    trace_id: str
    graph_version: str
    graph_run_id: str
    user_turn_id: str
    conversation_id: str
    user_message: str
    actor: dict[str, Any]
    policy_context: dict[str, Any]
    phase_before: str
    phase_after: str
    turns: list[dict[str, Any]]
    memory_items: list[dict[str, Any]]
    context_profile: ContextProfile
    pending_interaction: PendingInteraction | None
    turn_resolution_result: Any
    turn_resolution_decision: dict[str, Any] | None
    turn_resolution_route: str
    active_goal: ActiveGoalState | None
    goal_workbench_result: Any
    goal_workbench_decision: dict[str, Any] | None
    goal_workbench_route: str
    goal_workbench_added_details: bool
    supervisor_result: Any
    turn_spec: dict[str, Any]
    conversation_act: str
    active_flow: str
    interrupted_flow: str | None
    resume_available: bool
    flow_confidence: float
    turn_policy: dict[str, Any]
    extraction_result: Any
    normalized_result: Any
    signal_snapshot: dict[str, Any]
    signal_updates: list[Any]
    strategy_bundle: Any
    expert_candidates: list[PlatformCandidate]
    scored_candidates: list[ScoredCandidate]
    selected_candidates: list[ScoredCandidate]
    resource_candidates: list[PlatformResourceCandidate]
    scored_resource_candidates: list[ScoredResourceCandidate]
    selected_resource_candidates: list[ScoredResourceCandidate]
    selected_resource_ids: list[str]
    recommendation_bundle_result: Any
    response_blocks: list[dict[str, Any]]
    memory_updates: list[dict[str, Any]]
    tool_calls: list[dict[str, Any]]
    response_repair_attempts: int
    quality_report: TurnQualityReport
    response_diagnostic: ResponseDiagnostic
    readiness_snapshot: dict[str, Any] | None
    recommendation_run: dict[str, Any] | None
    trace_metadata: dict[str, Any]
    node_traces: list[dict[str, Any]]
    model_calls: list[dict[str, Any]]
    selected_expert_ids: list[str]
    candidate_count: int
    persisted: dict[str, Any]
    turn_controller_enabled: bool
    turn_controller_result: Any
    turn_controller_decision: dict[str, Any]
    turn_controller_stopped_graph: bool
    expert_selection_diagnosis: dict[str, Any]
    expert_allocation_retry_count: int


class GraphNodeExecutionError(Exception):
    def __init__(
        self,
        *,
        node_name: str,
        node_traces: list[dict[str, Any]],
        state: InfinityGraphState,
        original: Exception,
    ) -> None:
        super().__init__(str(original))
        self.node_name = node_name
        self.node_traces = node_traces
        self.state = state
        self.original = original


class ResponseQualityError(Exception):
    def __init__(self, report: TurnQualityReport) -> None:
        failed = [gate.name for gate in report.gates if not gate.passed]
        super().__init__(f"response quality gates failed: {', '.join(failed)}")
        self.report = report


NodeFn = Callable[[InfinityGraphState], Awaitable[dict[str, Any]]]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _utc_now().isoformat()


def _elapsed_ms(started_at: float) -> int:
    return int((perf_counter() - started_at) * 1000)


def _safe_json(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {str(key): _safe_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_safe_json(item) for item in value]
    if isinstance(value, tuple):
        return [_safe_json(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _open_pending_interaction(signal_snapshot: dict[str, Any]) -> PendingInteraction | None:
    raw = signal_snapshot.get(PENDING_INTERACTION_KEY)
    if not isinstance(raw, dict):
        return None
    try:
        pending = PendingInteraction.model_validate(raw)
    except Exception:
        return None
    if pending.status != "open":
        return None
    if pending.turns_elapsed >= pending.expires_after_turns:
        return pending.model_copy(update={"status": "expired"})
    return pending


def _merge_string_list(existing: Any, incoming: list[str]) -> list[str]:
    values = existing if isinstance(existing, list) else []
    seen: set[str] = set()
    merged: list[str] = []
    for value in [*values, *incoming]:
        normalized = str(value).strip()
        key = normalized.lower()
        if normalized and key not in seen:
            seen.add(key)
            merged.append(normalized)
    return merged


def _active_goal_state(signal_snapshot: dict[str, Any]) -> ActiveGoalState | None:
    raw = signal_snapshot.get(ACTIVE_GOAL_KEY)
    if not isinstance(raw, dict):
        return None
    try:
        return ActiveGoalState.model_validate(raw)
    except Exception:
        return None


def _framework_hash(summary: str) -> str:
    return sha256(summary.encode("utf-8")).hexdigest()[:24]


def _collected_goal_fields(signal_snapshot: dict[str, Any]) -> dict[str, Any]:
    collected: dict[str, Any] = {}
    for key in (
        "budget",
        "study_level",
        "subject_field",
        "geography",
        "timeline",
        "constraints",
        "feasibility_flags",
        "budget_confirmed_literal",
    ):
        value = signal_snapshot.get(key)
        if value not in (None, "", [], {}):
            collected[key] = value
    return collected


def _goal_domain(goal_type: str | None) -> str:
    raw = str(goal_type or "").strip().lower()
    if not raw:
        return "general"
    if raw in LEGACY_GOAL_FIELD_ALIASES:
        return LEGACY_GOAL_FIELD_ALIASES[raw]
    for marker, domain in (
        ("study", "study"),
        ("abroad", "study"),
        ("degree", "study"),
        ("career", "career"),
        ("job", "career"),
        ("startup", "startup"),
        ("founder", "startup"),
        ("business", "startup"),
        ("skill", "skill"),
        ("learn", "skill"),
        ("life", "life_direction"),
        ("direction", "life_direction"),
        ("mentor", "mentor"),
        ("expert", "mentor"),
        ("resource", "resource"),
        ("course", "resource"),
    ):
        if marker in raw:
            return domain
    return "general"


def _allowed_goal_fields(goal_type: str | None) -> set[str]:
    domain = _goal_domain(goal_type)
    return {
        *UNIVERSAL_GOAL_FIELDS,
        *DOMAIN_GOAL_FIELDS.get(domain, set()),
    }


def _field_allowed_for_goal(field: str, goal_type: str | None) -> bool:
    if not field:
        return False
    if field == "budget_confirmed_literal":
        return "budget" in _allowed_goal_fields(goal_type)
    if field in _allowed_goal_fields(goal_type):
        return True
    return field not in ALL_DOMAIN_GOAL_FIELDS


def _clean_goal_field_value(value: Any) -> Any:
    if value in (None, "", [], {}):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped or stripped.lower() in {"unknown", "not sure", "unsure", "n/a", "none"}:
            return None
        return stripped
    if isinstance(value, list):
        cleaned = [_clean_goal_field_value(item) for item in value]
        return [item for item in cleaned if item not in (None, "", [], {})] or None
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            cleaned_item = _clean_goal_field_value(item)
            if cleaned_item not in (None, "", [], {}):
                cleaned[str(key)] = cleaned_item
        if not cleaned:
            return None
        if set(cleaned.keys()) == {"interpretation"} and cleaned.get("interpretation") == "unknown":
            return None
        return cleaned
    return value


def _clean_collected_goal_fields(
    collected_fields: dict[str, Any],
    *,
    goal_type: str | None,
) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for field, value in collected_fields.items():
        cleaned_value = _clean_goal_field_value(value)
        if cleaned_value in (None, "", [], {}):
            continue
        if _field_allowed_for_goal(field, goal_type):
            cleaned[field] = cleaned_value
    return cleaned


def _budget_field_is_resolved(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    if value.get("confirmed_literal") is True:
        return True
    has_amount_and_currency = value.get("amount") is not None and bool(value.get("currency"))
    has_non_literal_interpretation = value.get("interpretation") in {"estimate", "placeholder"}
    return bool(value.get("raw_budget_text")) and (has_amount_and_currency or has_non_literal_interpretation)


def _goal_field_is_resolved(field: str, collected_fields: dict[str, Any]) -> bool:
    value = collected_fields.get(field)
    if field == "budget":
        return _budget_field_is_resolved(value)
    return value not in (None, "", [], {})


def _reconciled_missing_goal_fields(
    *,
    goal_type: str | None,
    collected_fields: dict[str, Any],
    draft_missing_fields: list[str],
    existing_missing_fields: list[str] | None = None,
) -> list[str]:
    allowed_fields = _allowed_goal_fields(goal_type)
    missing: list[str] = []
    for field in [*(existing_missing_fields or []), *draft_missing_fields]:
        field = str(field).strip()
        if not field:
            continue
        if field in missing:
            continue
        if not _field_allowed_for_goal(field, goal_type):
            continue
        if field in allowed_fields and _goal_field_is_resolved(field, collected_fields):
            continue
        missing.append(field)
    return missing


def _normalize_active_goal_obligations(signal_snapshot: dict[str, Any]) -> dict[str, Any]:
    snapshot = dict(signal_snapshot)
    existing = _active_goal_state(snapshot)
    if existing is None:
        return snapshot

    collected = {
        **existing.collected_fields,
        **_collected_goal_fields(snapshot),
    }
    collected = _clean_collected_goal_fields(collected, goal_type=existing.goal_type)
    missing_fields = _reconciled_missing_goal_fields(
        goal_type=existing.goal_type,
        collected_fields=collected,
        draft_missing_fields=[],
        existing_missing_fields=existing.missing_fields,
    )
    obligations_changed = (
        existing.missing_fields != missing_fields
        or existing.collected_fields != collected
    )
    active_goal = existing.model_copy(
        update={
            "collected_fields": collected,
            "missing_fields": missing_fields,
            "next_action": None if obligations_changed else existing.next_action,
            "expected_next_step": None if obligations_changed else existing.expected_next_step,
        }
    )
    snapshot[ACTIVE_GOAL_KEY] = active_goal.model_dump(mode="json")
    return snapshot


def _goal_workbench_input_snapshot(signal_snapshot: dict[str, Any]) -> dict[str, Any]:
    snapshot = _normalize_active_goal_obligations(signal_snapshot)
    pending = snapshot.get(PENDING_INTERACTION_KEY)
    if isinstance(pending, dict) and pending.get("status") != "open":
        snapshot.pop(PENDING_INTERACTION_KEY, None)
    return snapshot


def _goal_summary_from_snapshot(signal_snapshot: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("primary_intent", "intents", "outcomes", "geography", "constraints"):
        value = signal_snapshot.get(key)
        if isinstance(value, list):
            parts.extend(str(item) for item in value[:3] if str(item).strip())
        elif isinstance(value, str) and value.strip():
            parts.append(value.strip())
    return " | ".join(parts[:8]) or "active goal"


def _goal_workbench_budget_payload(draft: GoalWorkbenchDraft) -> dict[str, Any] | None:
    budget = draft.collected_fields.budget
    if budget.interpretation == "unknown" and not any(
        [
            budget.amount is not None,
            budget.currency,
            budget.raw_budget_text,
            budget.confirmed_literal is not None,
        ]
    ):
        return None
    payload = {
        key: value
        for key, value in {
            "amount": budget.amount,
            "currency": budget.currency,
            "raw_budget_text": budget.raw_budget_text,
            "confirmed_literal": budget.confirmed_literal,
            "interpretation": None if budget.interpretation == "unknown" else budget.interpretation,
        }.items()
        if value not in (None, "")
    }
    return payload or None


def _effective_goal_type_for_workbench_fields(
    draft: GoalWorkbenchDraft,
    existing_goal_type: str | None = None,
) -> str | None:
    if draft.route_decision.target_flow == "expert_matching":
        return "mentor"
    if draft.route_decision.target_flow == "resource_search":
        return "resource"
    return draft.goal_type or existing_goal_type


def _goal_workbench_collected_fields(
    *,
    signal_snapshot: dict[str, Any],
    draft: GoalWorkbenchDraft,
) -> dict[str, Any]:
    existing = _active_goal_state(signal_snapshot)
    goal_type = _effective_goal_type_for_workbench_fields(
        draft,
        existing.goal_type if existing else None,
    )
    collected = {
        **(existing.collected_fields if existing else {}),
        **_collected_goal_fields(signal_snapshot),
    }
    budget_payload = _goal_workbench_budget_payload(draft)
    if budget_payload:
        collected["budget"] = budget_payload
    fields = draft.collected_fields
    if fields.study_level:
        collected["study_level"] = fields.study_level
    if fields.subject_field:
        collected["subject_field"] = fields.subject_field
    if fields.geography:
        collected["geography"] = fields.geography
    if fields.timeline:
        collected["timeline"] = fields.timeline
    if fields.constraints:
        collected["constraints"] = fields.constraints
    feasibility_flags = [
        value for value in fields.feasibility_flags if _valid_feasibility_flag(value)
    ]
    if feasibility_flags:
        collected["feasibility_flags"] = feasibility_flags
    return _clean_collected_goal_fields(collected, goal_type=goal_type)


def _reconcile_goal_workbench_draft(
    *,
    signal_snapshot: dict[str, Any],
    draft: GoalWorkbenchDraft,
) -> GoalWorkbenchDraft:
    collected = _goal_workbench_collected_fields(
        signal_snapshot=signal_snapshot,
        draft=draft,
    )
    existing = _active_goal_state(signal_snapshot)
    missing_fields = _reconciled_missing_goal_fields(
        goal_type=_effective_goal_type_for_workbench_fields(
            draft,
            existing.goal_type if existing else None,
        ),
        collected_fields=collected,
        draft_missing_fields=draft.missing_fields,
        existing_missing_fields=existing.missing_fields if existing else None,
    )
    removed_resolved_missing_fields = any(
        field in draft.missing_fields and field not in missing_fields
        for field in _allowed_goal_fields(draft.goal_type)
    )
    if not removed_resolved_missing_fields:
        return draft.model_copy(update={"missing_fields": missing_fields})

    return draft.model_copy(
        update={
            "missing_fields": missing_fields,
            "next_action": None,
            "clarification_question": None,
        }
    )


def _strategy_bundle_from_goal_workbench_draft(
    original: StrategyBundle,
    draft: GoalWorkbenchDraft,
) -> StrategyBundle:
    suggested_replies = [
        reply.text for reply in draft.suggested_replies if reply.kind == "meaningful_action"
    ]
    micro_consent_suggested_reply = (
        draft.micro_consent_suggested_reply.text
        if draft.micro_consent_suggested_reply
        and draft.micro_consent_suggested_reply.kind == "meaningful_action"
        else None
    )
    return original.model_copy(
        update={
            "strategy": ConversationStrategy(
                phase=draft.phase,
                depth_mode=draft.depth_mode,
                reflection_text=draft.reflection_text,
                clarification_question=draft.clarification_question,
                insight_text=draft.insight_text,
                direction_text=draft.direction_text,
                transition_text=draft.transition_text,
                micro_consent_prompt=draft.micro_consent_prompt,
                micro_consent_suggested_reply=micro_consent_suggested_reply,
                suggested_replies=suggested_replies,
                should_offer_framework=bool(draft.mini_framework),
                should_retrieve_experts=draft.route_decision.target_flow == "expert_matching",
                should_generate_readiness=draft.route_decision.target_flow == "expert_matching",
                response_reason=draft.internal_rationale,
            ),
            "mini_framework": draft.mini_framework,
            "memory_updates": draft.memory_updates,
        }
    )


def _goal_workbench_artifact_summary(
    draft: GoalWorkbenchDraft,
    response_blocks: list[dict[str, Any]] | None = None,
) -> str:
    if response_blocks is not None:
        parts: list[str] = []
        for block in response_blocks:
            for key in ("title", "content", "question", "suggestedReply"):
                value = block.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(value.strip())
            items = block.get("items")
            if isinstance(items, list):
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    for key in ("title", "body"):
                        value = item.get(key)
                        if isinstance(value, str) and value.strip():
                            parts.append(value.strip())
        return " | ".join(parts)[:1600]

    parts = [
        draft.reflection_text,
        draft.insight_text,
        draft.direction_text,
        draft.transition_text,
        draft.clarification_question,
        draft.micro_consent_prompt,
        draft.micro_consent_suggested_reply.text
        if draft.micro_consent_suggested_reply
        else None,
        *(reply.text for reply in draft.suggested_replies),
    ]
    if draft.mini_framework:
        parts.extend([draft.mini_framework.title, draft.mini_framework.intro])
        for item in draft.mini_framework.items:
            parts.extend([item.title, item.body])
    return " | ".join(str(part).strip() for part in parts if part and str(part).strip())[:1600]


def _goal_workbench_has_concrete_fields(draft: GoalWorkbenchDraft) -> bool:
    fields = draft.collected_fields
    return any(
        [
            _field_allowed_for_goal("budget", draft.goal_type)
            and (fields.budget.raw_budget_text or fields.budget.amount is not None),
            _field_allowed_for_goal("study_level", draft.goal_type) and fields.study_level,
            _field_allowed_for_goal("subject_field", draft.goal_type) and fields.subject_field,
            _field_allowed_for_goal("geography", draft.goal_type) and fields.geography,
            _field_allowed_for_goal("timeline", draft.goal_type) and fields.timeline,
            _field_allowed_for_goal("constraints", draft.goal_type) and fields.constraints,
            _field_allowed_for_goal("feasibility_flags", draft.goal_type)
            and fields.feasibility_flags,
        ]
    )


def _valid_feasibility_flag(value: str) -> bool:
    return bool(value) and all(
        char.islower() or char.isdigit() or char == "_"
        for char in value
    )


def _apply_goal_workbench_to_snapshot(
    *,
    signal_snapshot: dict[str, Any],
    draft: GoalWorkbenchDraft,
    response_blocks: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], list[SignalUpdate], ActiveGoalState, bool]:
    snapshot = dict(signal_snapshot)
    updates: list[SignalUpdate] = []
    fields = draft.collected_fields
    evidence = fields.evidence
    existing_before_update = _active_goal_state(snapshot)
    goal_type = _effective_goal_type_for_workbench_fields(
        draft,
        existing_before_update.goal_type if existing_before_update else None,
    )

    def push(signal_type: str, value: str, confidence: float = 0.86) -> None:
        if not value:
            return
        excerpts = evidence.get(signal_type, []) or evidence.get(signal_type.replace("_", ""), [])
        updates.append(
            SignalUpdate(
                signal_type=signal_type,
                signal_value=value,
                confidence=confidence,
                evidence=[
                    SignalEvidence(
                        source="goal_workbench",
                        excerpt=" | ".join(excerpts[:2]) or None,
                    )
                ],
            )
        )

    budget_payload = _goal_workbench_budget_payload(draft)
    if budget_payload and _field_allowed_for_goal("budget", goal_type):
        snapshot["budget"] = budget_payload
        if budget_payload.get("confirmed_literal") is True:
            snapshot["budget_confirmed_literal"] = True
        push("budget", str(budget_payload.get("raw_budget_text") or budget_payload))
    if fields.study_level and _field_allowed_for_goal("study_level", goal_type):
        snapshot["study_level"] = fields.study_level
        push("study_level", fields.study_level)
    if fields.subject_field and _field_allowed_for_goal("subject_field", goal_type):
        snapshot["subject_field"] = fields.subject_field
        snapshot["expertise_keywords"] = _merge_string_list(
            snapshot.get("expertise_keywords"),
            [fields.subject_field],
        )
        snapshot["canonical_domains"] = _merge_string_list(
            snapshot.get("canonical_domains"),
            [fields.subject_field],
        )
        push("subject_field", fields.subject_field)
    if fields.geography and _field_allowed_for_goal("geography", goal_type):
        snapshot["geography"] = _merge_string_list(snapshot.get("geography"), fields.geography)
        for value in fields.geography:
            push("geography", value)
    if fields.timeline and _field_allowed_for_goal("timeline", goal_type):
        snapshot["timeline"] = fields.timeline
        push("timeline", fields.timeline)
    if fields.constraints and _field_allowed_for_goal("constraints", goal_type):
        snapshot["constraints"] = _merge_string_list(snapshot.get("constraints"), fields.constraints)
        for value in fields.constraints:
            push("constraint", value)
    feasibility_flags = [
        value for value in fields.feasibility_flags if _valid_feasibility_flag(value)
    ]
    if feasibility_flags and _field_allowed_for_goal("feasibility_flags", goal_type):
        snapshot["feasibility_flags"] = _merge_string_list(
            snapshot.get("feasibility_flags"),
            feasibility_flags,
        )
        for value in feasibility_flags:
            push("feasibility_flag", value)

    existing = _active_goal_state(snapshot)
    collected = {
        **(existing.collected_fields if existing else {}),
        **_collected_goal_fields(snapshot),
    }
    goal_type = draft.goal_type or (existing.goal_type if existing else None)
    collected = _clean_collected_goal_fields(collected, goal_type=goal_type)
    missing_fields = _reconciled_missing_goal_fields(
        goal_type=goal_type,
        collected_fields=collected,
        draft_missing_fields=draft.missing_fields,
        existing_missing_fields=existing.missing_fields if existing else None,
    )
    artifact_summary = _goal_workbench_artifact_summary(draft, response_blocks)
    artifact_hash = _framework_hash(artifact_summary) if artifact_summary else None
    removed_resolved_missing_fields = any(
        field in draft.missing_fields and field not in missing_fields
        for field in _allowed_goal_fields(goal_type)
    )
    active_goal = ActiveGoalState(
        active_goal_key=draft.active_goal_key
        or (existing.active_goal_key if existing else str(uuid4())),
        goal_type=draft.goal_type or (existing.goal_type if existing else None),
        goal_summary=draft.goal_summary
        or (existing.goal_summary if existing else _goal_summary_from_snapshot(snapshot)),
        last_framework=existing.last_framework if existing else None,
        expected_next_step=(
            None
            if removed_resolved_missing_fields
            else draft.next_action or (existing.expected_next_step if existing else None)
        ),
        next_action=None if removed_resolved_missing_fields else draft.next_action,
        last_artifact_hash=artifact_hash or (existing.last_artifact_hash if existing else None),
        collected_fields=collected,
        missing_fields=missing_fields,
        plan_version=(existing.plan_version + 1 if existing else 1),
    )
    snapshot[ACTIVE_GOAL_KEY] = active_goal.model_dump(mode="json")
    return snapshot, updates, active_goal, _goal_workbench_has_concrete_fields(draft)


def _pending_question_type(active_flow: str) -> str:
    if active_flow == "expert_matching":
        return "mentor_category"
    if active_flow == "resource_search":
        return "resource_focus"
    return "goal_clarification"


def _pending_slot_targets(question_type: str) -> list[str]:
    if question_type == "mentor_category":
        return ["mentor_category", "expertise_keywords", "industries", "intents", "constraints"]
    if question_type == "resource_focus":
        return ["resource_focus", "intents", "outcomes", "industries", "constraints"]
    return ["goal_clarification", "intents", "outcomes", "stage", "timeline", "constraints"]


def _pending_expected_answer_schema(question_type: str) -> dict[str, Any]:
    return {
        "type": "object",
        "question_type": question_type,
        "allowed_slot_patch_fields": [
            "mentor_category",
            "resource_focus",
            "goal_clarification",
            "canonical_domains",
            "expertise_keywords",
            "intents",
            "outcomes",
            "industries",
            "geography",
            "constraints",
            "stage",
            "timeline",
            "assistant_choice_requested",
            "budget_amount",
            "budget_currency",
            "budget_raw_text",
            "budget_confirmed_literal",
            "budget_interpretation",
        ],
    }


def _create_pending_interaction_if_needed(
    state: InfinityGraphState,
    response_blocks: list[dict[str, Any]],
) -> PendingInteraction | None:
    strategy_bundle = state.get("strategy_bundle")
    strategy = strategy_bundle.strategy if strategy_bundle else None
    question_text = getattr(strategy, "clarification_question", None)
    active_flow = state.get("active_flow")
    if (
        not question_text
        or active_flow not in {"expert_matching", "resource_search", "goal_companion"}
        or state.get("selected_candidates")
        or state.get("selected_resource_candidates")
        or not any(block.get("type") == "clarification" for block in response_blocks)
    ):
        return None
    question_type = _pending_question_type(str(active_flow))
    return PendingInteraction(
        pending_interaction_id=str(uuid4()),
        status="open",
        target_flow=active_flow,  # type: ignore[arg-type]
        question_type=question_type,  # type: ignore[arg-type]
        expected_answer_schema=_pending_expected_answer_schema(question_type),
        slot_targets=_pending_slot_targets(question_type),
        original_question_text=str(question_text),
        created_turn_id=state.get("user_turn_id"),
        expires_after_turns=4,
    )


def _snapshot_with_pending(
    signal_snapshot: dict[str, Any],
    pending: PendingInteraction | None,
) -> dict[str, Any]:
    snapshot = dict(signal_snapshot)
    if pending is not None:
        snapshot[PENDING_INTERACTION_KEY] = pending.model_dump(mode="json")
    return snapshot


def _apply_slot_patch_to_snapshot(
    *,
    signal_snapshot: dict[str, Any],
    pending: PendingInteraction,
    patch: PendingSlotPatch,
    status: str,
) -> tuple[dict[str, Any], list[SignalUpdate]]:
    snapshot = dict(signal_snapshot)
    updates: list[SignalUpdate] = []
    patch_payload = patch.model_dump(mode="json")
    taxonomy_values = [
        value
        for field_name in (
            "mentor_category",
            "resource_focus",
            "goal_clarification",
            "expertise_keywords",
            "industries",
            "intents",
        )
        for value in patch_payload.get(field_name, [])
        if str(value).strip()
    ]
    expansion = expand_domain_terms([str(value) for value in taxonomy_values])
    if expansion.canonical_domains:
        patch_payload["canonical_domains"] = _merge_string_list(
            patch_payload.get("canonical_domains"),
            expansion.canonical_domains,
        )
        patch_payload["industries"] = _merge_string_list(
            patch_payload.get("industries"),
            expansion.industries,
        )
        patch_payload["expertise_keywords"] = _merge_string_list(
            patch_payload.get("expertise_keywords"),
            expansion.expertise_keywords,
        )
        snapshot["domain_taxonomy_matches"] = expansion.model_dump(mode="json")
        if pending.target_flow == "expert_matching":
            snapshot["expert_selection_mode"] = "pending_category_preview"

    list_fields = [
        "intents",
        "outcomes",
        "industries",
        "geography",
        "constraints",
        "mentor_category",
        "resource_focus",
        "goal_clarification",
        "canonical_domains",
        "expertise_keywords",
    ]
    for field_name in list_fields:
        incoming = [str(value) for value in patch_payload.get(field_name, []) if str(value).strip()]
        if not incoming:
            continue
        snapshot[field_name] = _merge_string_list(snapshot.get(field_name), incoming)
        signal_type = {
            "intents": "intent",
            "outcomes": "outcome",
            "industries": "industry",
            "geography": "geography",
            "constraints": "constraint",
        }.get(field_name)
        if signal_type:
            updates.extend(
                SignalUpdate(
                    signal_type=signal_type,
                    signal_value=value,
                    confidence=0.82,
                    evidence=[
                        SignalEvidence(
                            source="pending_interaction_answer",
                            detail=pending.pending_interaction_id,
                        )
                    ],
                )
                for value in incoming
            )

    if patch.stage:
        snapshot["stage"] = patch.stage
        updates.append(
            SignalUpdate(
                signal_type="stage",
                signal_value=patch.stage,
                confidence=0.78,
                evidence=[
                    SignalEvidence(
                        source="pending_interaction_answer",
                        detail=pending.pending_interaction_id,
                    )
                ],
            )
        )
    if patch.timeline:
        snapshot["timeline"] = patch.timeline
        updates.append(
            SignalUpdate(
                signal_type="timeline",
                signal_value=patch.timeline,
                confidence=0.82,
                evidence=[
                    SignalEvidence(
                        source="pending_interaction_answer",
                        detail=pending.pending_interaction_id,
                    )
                ],
            )
        )
    if patch.assistant_choice_requested:
        snapshot["assistant_choice_requested"] = True

    budget_payload = {
        key: value
        for key, value in {
            "amount": patch.budget_amount,
            "currency": patch.budget_currency,
            "raw_budget_text": patch.budget_raw_text,
            "confirmed_literal": patch.budget_confirmed_literal,
            "interpretation": (
                patch.budget_interpretation
                if patch.budget_interpretation != "unknown"
                else None
            ),
        }.items()
        if value not in (None, "")
    }
    if budget_payload:
        existing_budget = snapshot.get("budget") if isinstance(snapshot.get("budget"), dict) else {}
        snapshot["budget"] = {
            **existing_budget,
            **budget_payload,
        }
        if budget_payload.get("confirmed_literal") is True:
            snapshot["budget_confirmed_literal"] = True
        updates.append(
            SignalUpdate(
                signal_type="budget",
                signal_value=str(
                    budget_payload.get("raw_budget_text")
                    or {
                        key: value
                        for key, value in budget_payload.items()
                        if key != "confirmed_literal"
                    }
                ),
                confidence=0.84,
                evidence=[
                    SignalEvidence(
                        source="pending_interaction_answer",
                        detail=pending.pending_interaction_id,
                    )
                ],
            )
        )

    snapshot[PENDING_INTERACTION_KEY] = pending.model_copy(
        update={
            "status": status,
            "turns_elapsed": pending.turns_elapsed + 1,
        }
    ).model_dump(mode="json")
    return snapshot, updates


def _patch_has_matching_context(patch: PendingSlotPatch) -> bool:
    payload = patch.model_dump(mode="json")
    for field_name in (
        "canonical_domains",
        "mentor_category",
        "resource_focus",
        "goal_clarification",
        "expertise_keywords",
        "intents",
        "outcomes",
        "industries",
        "geography",
        "constraints",
    ):
        if payload.get(field_name):
            return True
    if any(
        payload.get(field_name)
        for field_name in (
            "stage",
            "timeline",
            "budget_amount",
            "budget_currency",
            "budget_raw_text",
            "budget_confirmed_literal",
        )
    ):
        return True
    return patch.budget_interpretation not in (None, "unknown")


def _apply_turn_controller_matching_context(
    *,
    signal_snapshot: dict[str, Any],
    patch: PendingSlotPatch,
    active_flow: str,
) -> tuple[dict[str, Any], list[SignalUpdate]]:
    if active_flow not in {"expert_matching", "resource_search"} or not _patch_has_matching_context(patch):
        return dict(signal_snapshot), []

    snapshot = dict(signal_snapshot)
    updates: list[SignalUpdate] = []
    patch_payload = patch.model_dump(mode="json")
    taxonomy_values = [
        value
        for field_name in (
            "mentor_category",
            "resource_focus",
            "goal_clarification",
            "expertise_keywords",
            "industries",
            "intents",
            "outcomes",
        )
        for value in patch_payload.get(field_name, [])
        if str(value).strip()
    ]
    expansion = expand_domain_terms([str(value) for value in taxonomy_values])
    if expansion.canonical_domains:
        patch_payload["canonical_domains"] = _merge_string_list(
            patch_payload.get("canonical_domains"),
            expansion.canonical_domains,
        )
        patch_payload["industries"] = _merge_string_list(
            patch_payload.get("industries"),
            expansion.industries,
        )
        patch_payload["expertise_keywords"] = _merge_string_list(
            patch_payload.get("expertise_keywords"),
            expansion.expertise_keywords,
        )
        snapshot["domain_taxonomy_matches"] = expansion.model_dump(mode="json")

    list_fields = [
        "intents",
        "outcomes",
        "industries",
        "geography",
        "constraints",
        "mentor_category",
        "resource_focus",
        "goal_clarification",
        "canonical_domains",
        "expertise_keywords",
    ]
    emitted_signal_keys: set[tuple[str, str]] = set()
    signal_type_by_field = {
        "intents": "intent",
        "outcomes": "outcome",
        "industries": "industry",
        "geography": "geography",
        "constraints": "constraint",
        "canonical_domains": "industry",
        "expertise_keywords": "subject_field",
    }
    for field_name in list_fields:
        incoming = [str(value) for value in patch_payload.get(field_name, []) if str(value).strip()]
        if not incoming:
            continue
        snapshot[field_name] = _merge_string_list(snapshot.get(field_name), incoming)
        signal_type = signal_type_by_field.get(field_name)
        if signal_type:
            for value in incoming:
                signal_key = (signal_type, value.strip().lower())
                if signal_key in emitted_signal_keys:
                    continue
                emitted_signal_keys.add(signal_key)
                updates.append(
                    SignalUpdate(
                        signal_type=signal_type,
                        signal_value=value,
                        confidence=0.84,
                        evidence=[SignalEvidence(source="turn_controller_matching_context")],
                    )
                )

    if patch.stage:
        snapshot["stage"] = patch.stage
        updates.append(
            SignalUpdate(
                signal_type="stage",
                signal_value=patch.stage,
                confidence=0.78,
                evidence=[SignalEvidence(source="turn_controller_matching_context")],
            )
        )
    if patch.timeline:
        snapshot["timeline"] = patch.timeline
        updates.append(
            SignalUpdate(
                signal_type="timeline",
                signal_value=patch.timeline,
                confidence=0.78,
                evidence=[SignalEvidence(source="turn_controller_matching_context")],
            )
        )
    if patch.assistant_choice_requested:
        snapshot["assistant_choice_requested"] = True

    budget_payload = {
        key: value
        for key, value in {
            "amount": patch.budget_amount,
            "currency": patch.budget_currency,
            "raw_budget_text": patch.budget_raw_text,
            "confirmed_literal": patch.budget_confirmed_literal,
            "interpretation": (
                patch.budget_interpretation
                if patch.budget_interpretation != "unknown"
                else None
            ),
        }.items()
        if value not in (None, "")
    }
    if budget_payload:
        existing_budget = snapshot.get("budget") if isinstance(snapshot.get("budget"), dict) else {}
        snapshot["budget"] = {**existing_budget, **budget_payload}
        if budget_payload.get("confirmed_literal") is True:
            snapshot["budget_confirmed_literal"] = True
        updates.append(
            SignalUpdate(
                signal_type="budget",
                signal_value=str(budget_payload.get("raw_budget_text") or budget_payload),
                confidence=0.78,
                evidence=[SignalEvidence(source="turn_controller_matching_context")],
            )
        )

    return snapshot, updates


def _prior_turns(state: InfinityGraphState) -> list[dict[str, Any]]:
    user_turn_id = state.get("user_turn_id")
    return [
        turn
        for turn in state.get("turns", [])
        if not user_turn_id or turn.get("id") != user_turn_id
    ]


def _state_snapshot(state: InfinityGraphState) -> dict[str, Any]:
    response_blocks = state.get("response_blocks", [])
    scored_candidates = state.get("scored_candidates", [])
    selected_candidates = state.get("selected_candidates", [])
    scored_resource_candidates = state.get("scored_resource_candidates", [])
    selected_resource_candidates = state.get("selected_resource_candidates", [])
    return {
        "traceId": state.get("trace_id"),
        "graphVersion": state.get("graph_version"),
        "conversationId": state.get("conversation_id"),
        "phaseBefore": state.get("phase_before"),
        "phaseAfter": state.get("phase_after"),
        "conversationAct": state.get("conversation_act"),
        "activeFlow": state.get("active_flow"),
        "turnPolicy": state.get("turn_policy", {}),
        "turnController": _safe_json(state.get("turn_controller_decision")),
        "turnControllerStoppedGraph": state.get("turn_controller_stopped_graph"),
        "pendingInteraction": _safe_json(state.get("pending_interaction")),
        "activeGoal": _safe_json(state.get("active_goal")),
        "turnResolution": _safe_json(state.get("turn_resolution_decision")),
        "goalWorkbench": _safe_json(state.get("goal_workbench_decision")),
        "turnSpec": _safe_json(state.get("turn_spec")),
        "signalSummary": _signal_summary(state.get("signal_snapshot", {})),
        "responseBlockTypes": [block.get("type") for block in response_blocks],
        "candidateCount": len(scored_candidates),
        "resourceCandidateCount": len(scored_resource_candidates),
        "selectedExpertIds": [
            candidate.candidate.mentorProfileId for candidate in selected_candidates
        ],
        "expertSelectionDiagnosis": state.get("expert_selection_diagnosis"),
        "selectedResourceIds": [
            candidate.candidate.resourceId for candidate in selected_resource_candidates
        ],
        "memoryUpdateCount": len(state.get("memory_updates", [])),
        "llmCallCount": len(state.get("model_calls", [])),
        "nodeTraceCount": len(state.get("node_traces", [])),
        "qualityReport": _safe_json(state.get("quality_report")),
    }


def _signal_summary(signal_snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "primaryIntent": signal_snapshot.get("primary_intent"),
        "intents": signal_snapshot.get("intents", []),
        "outcomes": signal_snapshot.get("outcomes", []),
        "stage": signal_snapshot.get("stage"),
        "emotions": signal_snapshot.get("emotions", []),
        "urgency": signal_snapshot.get("urgency"),
        "constraints": signal_snapshot.get("constraints", []),
    }


def _turn_policy_summary(state: InfinityGraphState) -> dict[str, Any]:
    return {
        "conversationAct": state.get("conversation_act"),
        "activeFlow": state.get("active_flow"),
        "interruptedFlow": state.get("interrupted_flow"),
        "resumeAvailable": state.get("resume_available"),
        "flowConfidence": state.get("flow_confidence"),
        "turnPolicy": state.get("turn_policy", {}),
    }


def _build_context_profile(
    *,
    phase: str,
    turns: list[dict[str, Any]],
    memory_items: list[dict[str, Any]],
    signal_snapshot: dict[str, Any],
    actor: dict[str, Any],
    policy_context: dict[str, Any],
) -> ContextProfile:
    policy = policy_context.get("policy", {})
    last_assistant_question = None
    last_recommendation_type = None
    for turn in reversed(turns):
        if turn.get("actor") == "assistant":
            for block in turn.get("responseBlocks", []) or []:
                if isinstance(block, dict) and block.get("question"):
                    last_assistant_question = str(block["question"])
                    break
            if last_assistant_question:
                break

    for turn in reversed(turns):
        for block in turn.get("responseBlocks", []) or []:
            if isinstance(block, dict) and block.get("type") in {"expert_cards", "resource_cards"}:
                last_recommendation_type = str(block.get("type"))
                break
        if last_recommendation_type:
            break

    return ContextProfile(
        turn_count=len(turns),
        prior_phase=phase,
        known_intents=list(signal_snapshot.get("intents", [])),
        known_outcomes=list(signal_snapshot.get("outcomes", [])),
        known_constraints=list(signal_snapshot.get("constraints", [])),
        known_location=list(signal_snapshot.get("geography", [])),
        memory_count=len(memory_items),
        last_assistant_question=last_assistant_question,
        last_recommendation_type=last_recommendation_type,
        user_is_guest=not bool(actor.get("authenticated")),
        can_book_sessions=bool(policy.get("canBookSessions")),
        can_recommend_experts=bool(policy.get("canRecommendExperts", policy.get("canBookSessions"))),
        can_recommend_resources=bool(policy.get("canRecommendResources", True)),
    )


def _turn_spec_for_state(
    state: InfinityGraphState,
    *,
    conversation_act: str,
    active_flow: str,
    turn_policy: TurnPolicy,
    signal_snapshot: dict[str, Any],
) -> InfinityTurnSpec:
    return InfinityTurnSpec(
        conversation_id=state["conversation_id"],
        user_message=state["user_message"],
        actor=state["actor"],
        surface=str(state["actor"].get("surface") or "landing_page"),
        conversation_act=conversation_act,  # type: ignore[arg-type]
        active_flow=active_flow,  # type: ignore[arg-type]
        turn_policy=turn_policy,
        prior_phase=state["phase_before"],
        prior_signal_snapshot=signal_snapshot,
        memory_items=_response_memory_items(state),
        platform_policy=state.get("policy_context", {}).get("policy", {}),
        context_profile=state["context_profile"],
        budget=TurnBudget.for_flow(active_flow),
    )


def _cross_chat_memory_enabled(state: InfinityGraphState) -> bool:
    policy = state.get("policy_context", {}).get("policy", {})
    feature_flags = policy.get("featureFlags") if isinstance(policy, dict) else {}
    return bool(
        isinstance(feature_flags, dict)
        and feature_flags.get("crossChatMemoryEnabled")
        and state.get("actor", {}).get("authenticated")
    )


def _response_memory_items(state: InfinityGraphState) -> list[dict[str, Any]]:
    return state.get("memory_items", []) if _cross_chat_memory_enabled(state) else []


def _pending_answer_policy(
    *,
    actor: dict[str, Any],
    target_flow: str,
    cross_chat_memory_enabled: bool,
) -> TurnPolicy:
    return TurnPolicy(
        allow_extraction=False,
        allow_planning=False,
        allow_tools=target_flow in {"expert_matching", "resource_search"},
        allow_recommendations=target_flow in {"expert_matching", "resource_search"},
        allow_memory_updates=bool(actor.get("authenticated") and cross_chat_memory_enabled),
        allow_usage_metering=False,
        allow_question=False,
        response_mode="goal_companion",
    )


def _resolution_soft_policy() -> TurnPolicy:
    return TurnPolicy(
        allow_extraction=False,
        allow_planning=True,
        allow_tools=False,
        allow_recommendations=False,
        allow_memory_updates=False,
        allow_usage_metering=False,
        allow_question=False,
        response_mode="soft_response",
    )


def _resolution_repair_policy(*, authenticated: bool) -> TurnPolicy:
    return TurnPolicy(
        allow_extraction=False,
        allow_planning=True,
        allow_tools=False,
        allow_recommendations=False,
        allow_memory_updates=authenticated,
        allow_usage_metering=False,
        allow_question=True,
        response_mode="repair",
    )


def _expert_selection_mode(signal_snapshot: dict[str, Any]) -> str:
    mode = signal_snapshot.get("expert_selection_mode")
    if mode == "pending_category_preview":
        return "pending_category_preview"
    return "standard"


def _expert_retrieval_plan(state: InfinityGraphState) -> ExpertRetrievalPlan | None:
    strategy_bundle = state.get("strategy_bundle")
    if not strategy_bundle:
        return None
    strategy = getattr(strategy_bundle, "strategy", None)
    plan = getattr(strategy, "expert_retrieval_plan", None)
    if isinstance(plan, ExpertRetrievalPlan):
        return plan
    return None


def _expert_selection_mode_for_state(state: InfinityGraphState) -> str:
    plan = _expert_retrieval_plan(state)
    if plan is not None:
        return plan.selection_mode
    diagnosis = state.get("expert_selection_diagnosis") or {}
    if isinstance(diagnosis, dict):
        mode = diagnosis.get("selectionModeAfter") or diagnosis.get("selectionModeBefore")
        if isinstance(mode, str) and mode:
            return mode
    return _expert_selection_mode(state.get("signal_snapshot", {}))


def _expert_selection_intent_for_state(state: InfinityGraphState) -> str:
    plan = _expert_retrieval_plan(state)
    if plan is not None:
        return plan.selection_intent
    diagnosis = state.get("expert_selection_diagnosis") or {}
    if isinstance(diagnosis, dict):
        intent = diagnosis.get("planSelectionIntent")
        if isinstance(intent, str) and intent:
            return intent
    return _expert_selection_mode_for_state(state)


def _expert_max_selected_count(state: InfinityGraphState) -> int:
    plan = _expert_retrieval_plan(state)
    if plan is not None:
        return plan.max_selected_count
    return 3


def _controller_route_confidence(decision: dict[str, Any]) -> float:
    trace_metadata = decision.get("trace_metadata")
    candidates: list[Any] = [
        decision.get("confidence"),
        decision.get("routeConfidence"),
        decision.get("flowConfidence"),
    ]
    if isinstance(trace_metadata, dict):
        candidates.extend(
            [
                trace_metadata.get("confidence"),
                trace_metadata.get("routeConfidence"),
                trace_metadata.get("decisionConfidence"),
                trace_metadata.get("flowConfidence"),
            ]
        )
    for value in candidates:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue
    return 1.0


def _controller_actionable_target(state: InfinityGraphState) -> str | None:
    decision = state.get("turn_controller_decision") or {}
    if state.get("turn_controller_stopped_graph") or not decision.get("should_continue_graph"):
        return None
    route = (decision.get("conversation_act"), decision.get("active_flow"))
    if route not in ACTIONABLE_CONTROLLER_ROUTES:
        return None
    if _controller_route_confidence(decision) < CONTROLLER_CONFIDENCE_THRESHOLD:
        return None
    active_flow = str(decision.get("active_flow"))
    if active_flow == "expert_matching":
        if _is_policy_blocked_expert_request(state):
            return "generate_strategy"
        return "maybe_retrieve_experts"
    if active_flow == "resource_search":
        return "maybe_retrieve_resources"
    if active_flow == "goal_companion":
        return "goal_workbench"
    return None


def _has_specific_expert_context(signal_snapshot: dict[str, Any]) -> bool:
    for key in (
        "primary_intent",
        "intents",
        "outcomes",
        "stage",
        "geography",
        "industries",
        "constraints",
        "canonical_domains",
        "expertise_keywords",
        "mentor_category",
        "active_goal",
    ):
        value = signal_snapshot.get(key)
        if value not in (None, "", [], {}):
            return True
    return False


def _controller_expert_selection_intent(state: InfinityGraphState) -> str:
    decision = state.get("turn_controller_decision") or {}
    decision_intent = decision.get("expert_selection_intent")
    if decision_intent in {
        "specific_relevance",
        "open_discovery",
        "quality_first",
        "pending_category_preview",
    }:
        return str(decision_intent)
    trace_metadata = decision.get("trace_metadata")
    if isinstance(trace_metadata, dict):
        configured_intent = trace_metadata.get("selectionIntent") or trace_metadata.get(
            "expertSelectionIntent"
        )
        if configured_intent in {
            "specific_relevance",
            "open_discovery",
            "quality_first",
            "pending_category_preview",
        }:
            return str(configured_intent)
    signal_snapshot = state.get("signal_snapshot", {})
    snapshot_mode = signal_snapshot.get("expert_selection_mode")
    if snapshot_mode == "pending_category_preview":
        return "pending_category_preview"
    return "specific_relevance" if _has_specific_expert_context(signal_snapshot) else "open_discovery"


def _controller_strategy_bundle(state: InfinityGraphState) -> StrategyBundle | None:
    active_flow = state.get("active_flow")
    if active_flow == "expert_matching":
        selection_intent = _controller_expert_selection_intent(state)
        return StrategyBundle(
            strategy=ConversationStrategy(
                phase="expert_matching",
                should_retrieve_experts=True,
                should_generate_readiness=bool(state.get("actor", {}).get("authenticated")),
                expert_retrieval_plan=ExpertRetrievalPlan(
                    should_retrieve_experts=True,
                    needs_clarification=False,
                    clarification_question=None,
                    selection_intent=selection_intent,  # type: ignore[arg-type]
                    selection_mode=selection_intent,  # type: ignore[arg-type]
                    diversity_goal=None,
                    minimum_candidate_count=1,
                    max_selected_count=3,
                    internal_rationale="controller_actionable_expert_route",
                ),
                response_reason="controller_actionable_expert_route",
            ),
            memory_updates=MemoryUpdateDraft(),
        )
    if active_flow == "resource_search":
        return StrategyBundle(
            strategy=ConversationStrategy(
                phase="resource_search",
                should_retrieve_experts=False,
                response_reason="controller_actionable_resource_route",
            ),
            memory_updates=MemoryUpdateDraft(),
        )
    return None


def _llm_call_trace(kind: str, result: LlmCallResult[Any]) -> dict[str, Any]:
    metadata = result.metadata or {}
    return {
        "kind": kind,
        "provider": result.provider,
        "model": result.model,
        "promptId": result.prompt_id,
        "promptVersion": result.prompt_version,
        "promptHash": result.prompt_hash,
        "schemaName": result.schema_name,
        "responseId": result.response_id,
        "finishReason": result.finish_reason,
        "inputTokens": result.usage.get("prompt_token_count")
        or result.usage.get("prompt_tokens")
        or result.usage.get("input_tokens"),
        "outputTokens": result.usage.get("candidates_token_count")
        or result.usage.get("completion_tokens")
        or result.usage.get("output_tokens"),
        "totalTokens": result.usage.get("total_token_count")
        or result.usage.get("total_tokens"),
        "cachedTokens": result.usage.get("cached_content_token_count")
        or result.usage.get("cached_tokens"),
        "latencyMs": result.latency_ms,
        "retryCount": result.retry_count,
        "toolCalls": result.tool_calls or [],
        "usage": result.usage,
        "contextPack": metadata.get("contextPack"),
    }


def _normalize_memory_provenance(
    *,
    provenance: dict[str, Any] | None,
    trace_id: str,
    conversation_id: str,
    phase: str,
) -> dict[str, Any]:
    normalized = dict(provenance or {})
    normalized.setdefault("source", "conversation")
    normalized.setdefault("traceId", trace_id)
    normalized.setdefault("conversationId", conversation_id)
    normalized.setdefault("phase", phase)
    return normalized


def _signal_updates_payload(state: InfinityGraphState) -> list[dict[str, Any]]:
    return [
        {
            "signalType": update.signal_type,
            "signalValue": update.signal_value,
            "confidence": update.confidence,
            "evidence": [
                {
                    **{"source": evidence.source},
                    **({"excerpt": evidence.excerpt} if evidence.excerpt is not None else {}),
                    **({"detail": evidence.detail} if evidence.detail is not None else {}),
                }
                for evidence in update.evidence
            ],
        }
        for update in state.get("signal_updates", [])
    ]


def _is_policy_blocked_expert_request(state: InfinityGraphState) -> bool:
    platform_policy = state.get("policy_context", {}).get("policy", {})
    return (
        state.get("active_flow") == "expert_matching"
        and state.get("conversation_act") == "expert_request"
        and not bool(
            platform_policy.get(
                "canRecommendExperts",
                platform_policy.get("canBookSessions"),
            )
        )
    )


def _recommendation_run_payload(state: InfinityGraphState) -> dict[str, Any] | None:
    scored_candidates = state.get("scored_candidates", [])
    selected_candidates = state.get("selected_candidates", [])
    scored_resource_candidates = state.get("scored_resource_candidates", [])
    selected_resource_candidates = state.get("selected_resource_candidates", [])

    if scored_resource_candidates:
        return {
            "algorithmVersion": RESOURCE_ALGORITHM_VERSION,
            "candidateCount": len(scored_resource_candidates),
            "selectedCount": len(selected_resource_candidates),
            "traceMetadata": {
                "traceId": state["trace_id"],
                "graphRunId": state.get("graph_run_id"),
                "rankingVersion": RESOURCE_ALGORITHM_VERSION,
                "runType": "resources",
                "selectedResources": [
                    {
                        "resourceId": item.candidate.resourceId,
                        "resourceType": item.candidate.resourceType,
                        "href": item.candidate.href,
                        "slotType": item.slot_type,
                        "finalScore": item.final_score,
                    }
                    for item in selected_resource_candidates
                ],
                "scoredResources": [
                    {
                        "resourceId": item.candidate.resourceId,
                        "resourceType": item.candidate.resourceType,
                        "href": item.candidate.href,
                        "selected": item.selected,
                        "slotType": item.slot_type,
                        "finalScore": item.final_score,
                        "scoreExplanation": item.score_explanation,
                    }
                    for item in scored_resource_candidates
                ],
            },
            "candidates": [],
        }

    if not scored_candidates:
        return None

    return {
        "algorithmVersion": "infinity-v1",
        "candidateCount": len(scored_candidates),
        "selectedCount": len(selected_candidates),
        "traceMetadata": {
            "traceId": state["trace_id"],
            "graphRunId": state.get("graph_run_id"),
            "rankingVersion": "infinity-v1",
            "runType": "experts",
        },
        "candidates": [
            {
                "mentorProfileId": item.candidate.mentorProfileId,
                "mentorUserId": item.candidate.mentorUserId,
                "eligibilityStatus": "eligible",
                "intentMatchScore": item.intent_match_score,
                "outcomeMatchScore": item.outcome_match_score,
                "personaMatchScore": item.persona_match_score,
                "expertiseRelevanceScore": item.expertise_relevance_score,
                "conversionProbabilityScore": item.conversion_probability_score,
                "adminPriorityScore": item.admin_priority_score,
                "exposureBalancingScore": item.exposure_balancing_score,
                "finalScore": item.final_score,
                "slotType": item.slot_type,
                "selected": item.selected,
                "scoreExplanation": item.score_explanation,
            }
            for item in scored_candidates
        ],
    }


def resolve_persisted_conversation_phase(state: InfinityGraphState) -> str:
    phase_before = str(state.get("phase_before") or "discovery")
    phase_after = str(state.get("phase_after") or phase_before)

    if phase_after in FLOW_PHASE_NAMES:
        return phase_before if phase_before in VALID_CONVERSATION_PHASES else "discovery"

    if phase_after in VALID_CONVERSATION_PHASES:
        return phase_after

    return phase_before if phase_before in VALID_CONVERSATION_PHASES else "discovery"


def _state_updates_payload(state: InfinityGraphState) -> dict[str, Any]:
    strategy_bundle = state.get("strategy_bundle")
    if strategy_bundle:
        depth_mode = strategy_bundle.strategy.depth_mode
    else:
        depth_mode = (
            state.get("policy_context", {})
            .get("conversation", {})
            .get("depthMode", "light")
        )
    return {
        "phase": resolve_persisted_conversation_phase(state),
        "depthMode": depth_mode,
        "signalSnapshot": state["signal_snapshot"],
        "memorySnapshot": {
            "items": [
                *_response_memory_items(state)[:6],
                *state.get("memory_updates", [])[:4],
            ],
        },
        "readinessSnapshot": state.get("readiness_snapshot"),
    }


def _trace_metadata(state: InfinityGraphState) -> dict[str, Any]:
    return {
        "traceId": state["trace_id"],
        "graphRunId": state.get("graph_run_id"),
        "graphVersion": state.get("graph_version"),
        "conversationId": state["conversation_id"],
        "phaseBefore": state.get("phase_before"),
        "phaseAfter": state.get("phase_after"),
        "nodeTraces": state.get("node_traces", []),
        "llmCalls": state.get("model_calls", []),
        "conversationAct": state.get("conversation_act"),
        "activeFlow": state.get("active_flow"),
        "interruptedFlow": state.get("interrupted_flow"),
        "resumeAvailable": state.get("resume_available"),
        "turnPolicy": state.get("turn_policy", {}),
        "turnController": _safe_json(state.get("turn_controller_decision")),
        "turnControllerStoppedGraph": state.get("turn_controller_stopped_graph"),
        "pendingInteraction": _safe_json(state.get("pending_interaction")),
        "activeGoal": _safe_json(state.get("active_goal")),
        "turnResolution": _safe_json(state.get("turn_resolution_decision")),
        "goalWorkbench": _safe_json(state.get("goal_workbench_decision")),
        "turnSpec": _safe_json(state.get("turn_spec")),
        "signalSummary": _signal_summary(state.get("signal_snapshot", {})),
        "selectedExpertIds": state.get("selected_expert_ids", []),
        "expertSelectionDiagnosis": state.get("expert_selection_diagnosis"),
        "selectedResourceIds": state.get("selected_resource_ids", []),
        "candidateCount": state.get("candidate_count", 0),
        "resourceCandidateCount": len(state.get("scored_resource_candidates", [])),
        "qualityReport": _safe_json(state.get("quality_report")),
        "responseDiagnostic": _safe_json(state.get("response_diagnostic")),
        "stateAfter": _state_snapshot(state),
    }


def _trace_node(node_name: str, fn: NodeFn) -> NodeFn:
    async def wrapped(state: InfinityGraphState) -> dict[str, Any]:
        started_at = _iso_now()
        started_perf = perf_counter()
        try:
            update = await fn(state)
            summary = _safe_json(update.pop(NODE_SUMMARY_KEY, {}))
            trace = {
                "node": node_name,
                "startedAt": started_at,
                "completedAt": _iso_now(),
                "latencyMs": _elapsed_ms(started_perf),
                "status": "completed",
                "summary": summary,
            }
            return {
                **update,
                "node_traces": [*state.get("node_traces", []), trace],
            }
        except Exception as exc:
            trace = {
                "node": node_name,
                "startedAt": started_at,
                "completedAt": _iso_now(),
                "latencyMs": _elapsed_ms(started_perf),
                "status": "failed",
                "summary": {"errorType": type(exc).__name__, "error": str(exc)[:500]},
            }
            raise GraphNodeExecutionError(
                node_name=node_name,
                node_traces=[*state.get("node_traces", []), trace],
                state={**state, "node_traces": [*state.get("node_traces", []), trace]},
                original=exc,
            ) from exc

    return wrapped


async def _load_context(state: InfinityGraphState) -> dict[str, Any]:
    policy_context = await state["platform_client"].get_policy_context(
        conversation_id=state["conversation_id"],
        actor=state["actor"],
    )
    turns = policy_context.get("turns", [])
    signal_snapshot = policy_context["conversation"].get("signalSnapshot", {})
    pending_interaction = _open_pending_interaction(signal_snapshot)
    active_goal = _active_goal_state(signal_snapshot)
    raw_memory_items = policy_context.get("memoryItems", [])
    policy = policy_context.get("policy", {})
    feature_flags = policy.get("featureFlags") if isinstance(policy, dict) else {}
    cross_chat_memory_enabled = bool(
        isinstance(feature_flags, dict)
        and feature_flags.get("crossChatMemoryEnabled")
        and state.get("actor", {}).get("authenticated")
    )
    memory_items = raw_memory_items if cross_chat_memory_enabled else []
    context_profile = _build_context_profile(
        phase=policy_context["conversation"]["phase"],
        turns=turns,
        memory_items=memory_items,
        signal_snapshot=signal_snapshot,
        actor=state["actor"],
        policy_context=policy_context,
    )
    return {
        "policy_context": policy_context,
        "phase_before": policy_context["conversation"]["phase"],
        "phase_after": policy_context["conversation"]["phase"],
        "turns": turns,
        "memory_items": memory_items,
        "pending_interaction": pending_interaction,
        "active_goal": active_goal,
        "context_profile": context_profile,
        NODE_SUMMARY_KEY: {
            "phase": policy_context["conversation"]["phase"],
            "pendingInteraction": _safe_json(pending_interaction),
            "activeGoal": _safe_json(active_goal),
            "priorTurnCount": len(
                [turn for turn in turns if turn.get("id") != state.get("user_turn_id")]
            ),
            "memoryItemCount": len(memory_items),
            "contextProfile": context_profile.model_dump(mode="json"),
        },
    }


async def _classify_conversation_act(state: InfinityGraphState) -> dict[str, Any]:
    policy_context = state["policy_context"]
    supervisor_result = await classify_conversation_turn(
        state["provider"],
        user_message=state["user_message"],
        phase=state["phase_before"],
        turns=_prior_turns(state),
        signal_snapshot=policy_context["conversation"].get("signalSnapshot", {}),
    )
    decision = supervisor_result.parsed
    budget = TurnBudget.for_flow(decision.active_flow)
    effective_policy = decision.turn_policy
    if not state["actor"].get("authenticated"):
        effective_policy = effective_policy.model_copy(
            update={"allow_memory_updates": False}
        )
    platform_policy = policy_context.get("policy", {})
    if decision.active_flow == "expert_matching" and not bool(
        platform_policy.get("canRecommendExperts", platform_policy.get("canBookSessions"))
    ):
        effective_policy = effective_policy.model_copy(
            update={
                "allow_extraction": False,
                "allow_planning": True,
                "allow_tools": False,
                "allow_recommendations": False,
                "allow_memory_updates": False,
                "allow_usage_metering": False,
                "allow_question": False,
                "response_mode": "soft_response",
            }
        )
    if decision.active_flow == "resource_search" and not bool(
        platform_policy.get("canRecommendResources", True)
    ):
        effective_policy = effective_policy.model_copy(
            update={
                "allow_tools": False,
                "allow_recommendations": False,
                "allow_usage_metering": False,
            }
        )
    turn_policy = effective_policy.model_dump(mode="json")
    signal_snapshot = policy_context["conversation"].get("signalSnapshot", {})
    turn_spec = InfinityTurnSpec(
        conversation_id=state["conversation_id"],
        user_message=state["user_message"],
        actor=state["actor"],
        surface=str(state["actor"].get("surface") or "landing_page"),
        conversation_act=decision.conversation_act,
        active_flow=decision.active_flow,
        turn_policy=effective_policy,
        prior_phase=state["phase_before"],
        prior_signal_snapshot=signal_snapshot,
        memory_items=_response_memory_items(state),
        platform_policy=policy_context.get("policy", {}),
        context_profile=state["context_profile"],
        budget=budget,
    )
    return {
        "turn_spec": turn_spec.model_dump(mode="json"),
        "conversation_act": decision.conversation_act,
        "active_flow": decision.active_flow,
        "interrupted_flow": decision.interrupted_flow,
        "resume_available": decision.resume_available,
        "flow_confidence": decision.flow_confidence,
        "turn_policy": turn_policy,
        "signal_snapshot": signal_snapshot,
        "signal_updates": [],
        "tool_calls": [],
        "response_repair_attempts": 0,
        "phase_after": state["phase_before"],
        "model_calls": [
            *state.get("model_calls", []),
            _llm_call_trace("classify_conversation_act", supervisor_result),
        ],
        NODE_SUMMARY_KEY: {
            **_turn_policy_summary(
                {
                    **state,
                    "conversation_act": decision.conversation_act,
                    "active_flow": decision.active_flow,
                    "interrupted_flow": decision.interrupted_flow,
                    "resume_available": decision.resume_available,
                    "flow_confidence": decision.flow_confidence,
                    "turn_policy": turn_policy,
                }
            ),
            "schemaName": supervisor_result.schema_name,
            "rationale": decision.rationale,
            "turnSpec": turn_spec.model_dump(mode="json"),
        },
    }


def _controller_response_blocks(decision: Any) -> list[dict[str, Any]]:
    return [
        block.model_dump(mode="json", exclude_none=True, exclude_defaults=True)
        for block in decision.response_blocks
    ]


async def _turn_resolution(state: InfinityGraphState) -> dict[str, Any]:
    pending = state.get("pending_interaction")
    if pending is None:
        return {
            "turn_resolution_decision": None,
            "turn_resolution_route": "new_user_intent",
            NODE_SUMMARY_KEY: {"skipped": True, "reason": "no_open_pending_interaction"},
        }
    if pending.status == "expired":
        snapshot = _snapshot_with_pending(
            state["policy_context"]["conversation"].get("signalSnapshot", {}),
            pending,
        )
        return {
            "pending_interaction": pending,
            "signal_snapshot": snapshot,
            "turn_resolution_decision": None,
            "turn_resolution_route": "new_user_intent",
            NODE_SUMMARY_KEY: {"skipped": True, "reason": "pending_interaction_expired"},
        }

    resolution_result = await resolve_pending_turn(
        state["provider"],
        user_message=state["user_message"],
        pending_interaction=pending,
        turns=_prior_turns(state),
        signal_snapshot=state["policy_context"]["conversation"].get("signalSnapshot", {}),
        actor=state["actor"],
        platform_policy=state["policy_context"].get("policy", {}),
        memory_item_count=len(_response_memory_items(state)),
    )
    decision = resolution_result.parsed
    route = decision.resolution_type
    signal_snapshot = state["policy_context"]["conversation"].get("signalSnapshot", {})
    turn_policy: TurnPolicy | None = None
    conversation_act = decision.conversation_act
    active_flow = decision.active_flow
    pending_update = pending

    if decision.resolution_type == "interrupt":
        conversation_act = conversation_act or "chitchat"
        active_flow = active_flow or "soft_response"
        turn_policy = _resolution_soft_policy()
        pending_update = pending.model_copy(update={"turns_elapsed": pending.turns_elapsed + 1})
    elif decision.resolution_type == "unsupported":
        conversation_act = conversation_act or "unsupported"
        active_flow = active_flow or "safety"
        turn_policy = _resolution_soft_policy().model_copy(update={"response_mode": "safety"})
        pending_update = pending.model_copy(update={"turns_elapsed": pending.turns_elapsed + 1})
    elif decision.resolution_type == "correction":
        conversation_act = "correction"
        active_flow = "repair"
        turn_policy = _resolution_repair_policy(authenticated=bool(state["actor"].get("authenticated")))
        pending_update = pending.model_copy(update={"turns_elapsed": pending.turns_elapsed + 1})

    if turn_policy and conversation_act and active_flow:
        signal_snapshot = _snapshot_with_pending(signal_snapshot, pending_update)
        turn_spec = _turn_spec_for_state(
            state,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
            signal_snapshot=signal_snapshot,
        )
        return {
            "turn_resolution_decision": decision.model_dump(mode="json"),
            "turn_resolution_route": route,
            "pending_interaction": pending_update,
            "conversation_act": conversation_act,
            "active_flow": active_flow,
            "interrupted_flow": pending.target_flow,
            "resume_available": True,
            "flow_confidence": decision.confidence,
            "turn_policy": turn_policy.model_dump(mode="json"),
            "turn_spec": turn_spec.model_dump(mode="json"),
            "signal_snapshot": signal_snapshot,
            "signal_updates": [],
            "tool_calls": [],
            "response_repair_attempts": 0,
            "phase_after": state["phase_before"],
            "model_calls": [
                *state.get("model_calls", []),
                _llm_call_trace("turn_resolution", resolution_result),
            ],
            NODE_SUMMARY_KEY: {
                "resolutionType": decision.resolution_type,
                "targetFlow": decision.target_flow,
                "skipSupervisor": decision.skip_supervisor,
                "contextPack": (resolution_result.metadata or {}).get("contextPack"),
                "pendingInteraction": pending_update.model_dump(mode="json"),
                "internalRationale": decision.internal_rationale,
            },
        }

    return {
        "turn_resolution_decision": decision.model_dump(mode="json"),
        "turn_resolution_route": route,
        "model_calls": [
            *state.get("model_calls", []),
            _llm_call_trace("turn_resolution", resolution_result),
        ],
        NODE_SUMMARY_KEY: {
            "resolutionType": decision.resolution_type,
            "targetFlow": decision.target_flow,
            "skipSupervisor": decision.skip_supervisor,
            "contextPack": (resolution_result.metadata or {}).get("contextPack"),
            "pendingInteraction": pending.model_dump(mode="json"),
            "internalRationale": decision.internal_rationale,
        },
    }


async def _apply_pending_answer(state: InfinityGraphState) -> dict[str, Any]:
    pending = state.get("pending_interaction")
    decision_payload = state.get("turn_resolution_decision") or {}
    decision = TurnResolutionDecision.model_validate(decision_payload)
    if pending is None:
        raise ValueError("pending answer route requires an open pending interaction")
    if decision.pending_interaction_id != pending.pending_interaction_id:
        raise ValueError("turn resolution pending interaction mismatch")
    target_flow = decision.target_flow or pending.target_flow
    signal_snapshot, slot_updates = _apply_slot_patch_to_snapshot(
        signal_snapshot=state["policy_context"]["conversation"].get("signalSnapshot", {}),
        pending=pending,
        patch=decision.slot_patch,
        status="answered" if decision.close_pending_interaction else "open",
    )
    if target_flow == "goal_companion":
        signal_snapshot = _normalize_active_goal_obligations(signal_snapshot)
    turn_policy = _pending_answer_policy(
        actor=state["actor"],
        target_flow=target_flow,
        cross_chat_memory_enabled=_cross_chat_memory_enabled(state),
    )
    conversation_act = (
        "expert_request"
        if target_flow == "expert_matching"
        else "resource_request"
        if target_flow == "resource_search"
        else "goal_help"
    )
    turn_spec = _turn_spec_for_state(
        state,
        conversation_act=conversation_act,
        active_flow=target_flow,
        turn_policy=turn_policy,
        signal_snapshot=signal_snapshot,
    )
    strategy = ConversationStrategy(
        phase=(
            "expert_elevation"
            if target_flow == "expert_matching"
            else "resource_search"
            if target_flow == "resource_search"
            else state["phase_before"]
        ),
        depth_mode="light",
        should_retrieve_experts=target_flow == "expert_matching",
        should_generate_readiness=target_flow == "expert_matching",
        expert_retrieval_plan=(
            ExpertRetrievalPlan(
                should_retrieve_experts=True,
                needs_clarification=False,
                clarification_question=None,
                selection_intent="pending_category_preview",
                selection_mode="pending_category_preview",
                diversity_goal="category_preview",
                minimum_candidate_count=1,
                max_selected_count=3,
                internal_rationale=decision.internal_rationale,
            )
            if target_flow == "expert_matching"
            else None
        ),
        response_reason=decision.internal_rationale,
    )
    return {
        "turn_spec": turn_spec.model_dump(mode="json"),
        "conversation_act": conversation_act,
        "active_flow": target_flow,
        "interrupted_flow": None,
        "resume_available": False,
        "flow_confidence": decision.confidence,
        "turn_policy": turn_policy.model_dump(mode="json"),
        "signal_snapshot": signal_snapshot,
        "signal_updates": slot_updates,
        "strategy_bundle": StrategyBundle(
            strategy=strategy,
            mini_framework=None,
            memory_updates=MemoryUpdateDraft(items=[]),
        ),
        "tool_calls": [],
        "memory_updates": [],
        "response_repair_attempts": 0,
        "phase_after": strategy.phase,
        NODE_SUMMARY_KEY: {
            "resolutionType": decision.resolution_type,
            "targetFlow": target_flow,
            "slotPatch": decision.slot_patch.model_dump(mode="json"),
            "expertRetrievalPlan": (
                strategy.expert_retrieval_plan.model_dump(mode="json")
                if strategy.expert_retrieval_plan
                else None
            ),
            "signalUpdateCount": len(slot_updates),
        },
    }


async def _goal_workbench(state: InfinityGraphState) -> dict[str, Any]:
    raw_signal_snapshot = (
        state.get("signal_snapshot")
        or state["policy_context"]["conversation"].get("signalSnapshot", {})
    )
    signal_snapshot = _goal_workbench_input_snapshot(raw_signal_snapshot)
    workbench_result = await compose_goal_workbench_response(
        state["provider"],
        user_message=state["user_message"],
        signal_snapshot=signal_snapshot,
        memory_items=_response_memory_items(state),
        phase=state["phase_after"],
        turns=_prior_turns(state),
        conversation_act=state.get("conversation_act", "goal_help"),
        active_flow="goal_companion",
        turn_policy=state.get("turn_policy", {}),
    )
    draft = GoalWorkbenchDraft.model_validate(
        (workbench_result.metadata or {}).get("goal_workbench_draft")
    )
    draft = _reconcile_goal_workbench_draft(
        signal_snapshot=signal_snapshot,
        draft=draft,
    )
    strategy_bundle = _strategy_bundle_from_goal_workbench_draft(
        workbench_result.parsed,
        draft,
    )
    route_target = draft.route_decision.target_flow
    platform_policy = state.get("policy_context", {}).get("policy", {})
    active_flow = (
        "resource_search"
        if route_target == "resource_search"
        else "expert_matching"
        if route_target == "expert_matching"
        else "goal_companion"
    )
    conversation_act = (
        "resource_request"
        if active_flow == "resource_search"
        else "expert_request"
        if active_flow == "expert_matching"
        else "goal_help"
    )
    turn_policy = TurnPolicy(
        allow_extraction=False,
        allow_planning=True,
        allow_tools=(
            active_flow == "resource_search"
            and bool(platform_policy.get("canRecommendResources", True))
        )
        or (
            active_flow == "expert_matching"
            and bool(platform_policy.get("canRecommendExperts", platform_policy.get("canBookSessions")))
        ),
        allow_recommendations=(
            active_flow == "resource_search"
            and bool(platform_policy.get("canRecommendResources", True))
        )
        or (
            active_flow == "expert_matching"
            and bool(platform_policy.get("canRecommendExperts", platform_policy.get("canBookSessions")))
        ),
        allow_memory_updates=_cross_chat_memory_enabled(state),
        allow_usage_metering=False,
        allow_question=bool(draft.clarification_question),
        response_mode="goal_companion",
    )

    response_blocks: list[dict[str, Any]] = []
    if route_target == "stay_goal_companion":
        response_blocks = build_response_blocks(
            strategy=strategy_bundle.strategy,
            mini_framework=strategy_bundle.mini_framework,
            recommendation_bundle=None,
            selected_candidates=[],
            selected_resource_candidates=[],
            memory_items=_response_memory_items(state),
            show_sign_in_cta=False,
        )

    updated_snapshot, signal_updates, active_goal, added_details = _apply_goal_workbench_to_snapshot(
        signal_snapshot=signal_snapshot,
        draft=draft,
        response_blocks=response_blocks or None,
    )
    pending_interaction = None
    if response_blocks:
        pending_interaction = _create_pending_interaction_if_needed(
            {
                **state,
                "active_flow": active_flow,
                "strategy_bundle": strategy_bundle,
                "selected_candidates": [],
                "selected_resource_candidates": [],
                "user_turn_id": state.get("user_turn_id"),
            },
            response_blocks,
        )
        if pending_interaction is not None:
            updated_snapshot = _snapshot_with_pending(updated_snapshot, pending_interaction)

    memory_updates = []
    if turn_policy.allow_memory_updates:
        memory_updates = [
            {
                "memoryType": item.memory_type,
                "content": item.content,
                "confidence": item.confidence,
                "provenance": _normalize_memory_provenance(
                    provenance=item.provenance,
                    trace_id=state["trace_id"],
                    conversation_id=state["conversation_id"],
                    phase=draft.phase,
                ),
            }
            for item in workbench_result.parsed.memory_updates.items
        ]
    turn_spec = _turn_spec_for_state(
        state,
        conversation_act=conversation_act,
        active_flow=active_flow,
        turn_policy=turn_policy,
        signal_snapshot=updated_snapshot,
    )
    return {
        "goal_workbench_decision": draft.model_dump(mode="json"),
        "goal_workbench_route": route_target,
        "goal_workbench_added_details": added_details,
        "active_goal": active_goal,
        "pending_interaction": pending_interaction or state.get("pending_interaction"),
        "turn_spec": turn_spec.model_dump(mode="json"),
        "conversation_act": conversation_act,
        "active_flow": active_flow,
        "interrupted_flow": None,
        "resume_available": False,
        "flow_confidence": state.get("flow_confidence", 1.0),
        "turn_policy": turn_policy.model_dump(mode="json"),
        "signal_snapshot": updated_snapshot,
        "signal_updates": signal_updates,
        "strategy_bundle": strategy_bundle,
        "tool_calls": [],
        "memory_updates": memory_updates,
        "response_repair_attempts": 0,
        "phase_after": draft.phase,
        "recommendation_run": None,
        **({"response_blocks": response_blocks} if response_blocks else {}),
        "model_calls": [
            *state.get("model_calls", []),
            _llm_call_trace("goal_workbench", workbench_result),
        ],
        NODE_SUMMARY_KEY: {
            "routeTarget": route_target,
            "activeGoalKey": active_goal.active_goal_key,
            "contextPack": (workbench_result.metadata or {}).get("contextPack"),
            "collectedFields": active_goal.collected_fields,
            "missingFields": active_goal.missing_fields,
            "nextAction": active_goal.next_action,
            "signalUpdateCount": len(signal_updates),
            "responseBlockTypes": [block.get("type") for block in response_blocks],
            "memoryUpdateCount": len(memory_updates),
        },
    }


async def _run_turn_controller(state: InfinityGraphState) -> dict[str, Any]:
    policy_context = state["policy_context"]
    signal_snapshot = policy_context["conversation"].get("signalSnapshot", {})
    controller_result = await run_turn_controller(
        state["provider"],
        user_message=state["user_message"],
        phase=state["phase_before"],
        turns=_prior_turns(state),
        signal_snapshot=signal_snapshot,
        memory_items=_response_memory_items(state),
        actor=state["actor"],
        platform_policy=policy_context.get("policy", {}),
        context_profile=state["context_profile"],
    )
    decision = controller_result.parsed
    if (decision.conversation_act, decision.active_flow) in ACTIONABLE_CONTROLLER_ROUTES:
        decision = decision.model_copy(
            update={
                "turn_policy": decision.turn_policy.model_copy(
                    update={"allow_extraction": False}
                ),
                "needs_signal_extraction": False,
            }
        )
    signal_snapshot, signal_updates = _apply_turn_controller_matching_context(
        signal_snapshot=signal_snapshot,
        patch=decision.matching_context,
        active_flow=decision.active_flow,
    )
    budget = TurnBudget.for_flow(decision.active_flow)
    turn_policy = decision.turn_policy.model_dump(mode="json")
    turn_spec = InfinityTurnSpec(
        conversation_id=state["conversation_id"],
        user_message=state["user_message"],
        actor=state["actor"],
        surface=str(state["actor"].get("surface") or "landing_page"),
        conversation_act=decision.conversation_act,
        active_flow=decision.active_flow,
        turn_policy=decision.turn_policy,
        prior_phase=state["phase_before"],
        prior_signal_snapshot=signal_snapshot,
        memory_items=_response_memory_items(state),
        platform_policy=policy_context.get("policy", {}),
        context_profile=state["context_profile"],
        budget=budget,
    )
    response_blocks = [] if decision.should_continue_graph else _controller_response_blocks(decision)
    decision_payload = decision.model_dump(mode="json")
    strategy_bundle = _controller_strategy_bundle(
        {
            **state,
            "turn_controller_decision": decision_payload,
            "active_flow": decision.active_flow,
            "signal_snapshot": signal_snapshot,
        }
    )
    return {
        "turn_controller_decision": decision_payload,
        "turn_controller_stopped_graph": not decision.should_continue_graph,
        "turn_spec": turn_spec.model_dump(mode="json"),
        "conversation_act": decision.conversation_act,
        "active_flow": decision.active_flow,
        "interrupted_flow": None,
        "resume_available": False,
        "flow_confidence": 1.0,
        "turn_policy": turn_policy,
        "signal_snapshot": signal_snapshot,
        "signal_updates": signal_updates,
        "tool_calls": [],
        "memory_updates": [],
        "recommendation_run": None,
        "response_repair_attempts": 0,
        "phase_after": state["phase_before"],
        **({"strategy_bundle": strategy_bundle} if strategy_bundle is not None else {}),
        **({"response_blocks": response_blocks} if response_blocks else {}),
        "model_calls": [
            *state.get("model_calls", []),
            _llm_call_trace("turn_controller", controller_result),
        ],
        NODE_SUMMARY_KEY: {
            "conversationAct": decision.conversation_act,
            "activeFlow": decision.active_flow,
            "shouldContinueGraph": decision.should_continue_graph,
            "stoppedGraph": not decision.should_continue_graph,
            "contextPack": (controller_result.metadata or {}).get("contextPack"),
            "needsSignalExtraction": decision.needs_signal_extraction,
            "needsTools": decision.needs_tools,
            "needsRecommendations": decision.needs_recommendations,
            "needsMemoryUpdate": decision.needs_memory_update,
            "responseBlockTypes": [block.get("type") for block in response_blocks],
            "rationale": decision.rationale,
            "traceMetadata": decision.trace_metadata,
            "matchingContext": decision.matching_context.model_dump(mode="json"),
            "matchingContextSignalUpdateCount": len(signal_updates),
            "turnPolicy": turn_policy,
        },
    }


def _route_after_turn_controller(state: InfinityGraphState) -> str:
    if state.get("turn_controller_stopped_graph"):
        return "validate_response"
    actionable_target = _controller_actionable_target(state)
    if actionable_target:
        return actionable_target
    return "classify_conversation_act"


def _route_after_load_context(state: InfinityGraphState) -> str:
    if state.get("pending_interaction") is not None:
        return "turn_resolution"
    if state.get("turn_controller_enabled"):
        return "turn_controller"
    return "classify_conversation_act"


def _route_after_turn_resolution(state: InfinityGraphState) -> str:
    route = state.get("turn_resolution_route")
    if route == "answer_to_pending_question":
        return "apply_pending_answer"
    if route == "interrupt" or route == "unsupported":
        return "generate_strategy"
    if route == "correction":
        return "patch_correction_context"
    return "classify_conversation_act"


def _route_after_pending_answer(state: InfinityGraphState) -> str:
    active_flow = state.get("active_flow")
    if active_flow == "expert_matching":
        if _is_policy_blocked_expert_request(state):
            return "generate_strategy"
        return "maybe_retrieve_experts"
    if active_flow == "resource_search":
        return "maybe_retrieve_resources"
    if active_flow == "goal_companion":
        return "goal_workbench"
    return "generate_strategy"


def _route_after_supervisor(state: InfinityGraphState) -> str:
    if state.get("conversation_act") == "correction":
        return "patch_correction_context"
    if state.get("active_flow") == "goal_companion":
        return "goal_workbench"
    if state.get("turn_policy", {}).get("allow_extraction"):
        return "extract_signals"
    return "generate_strategy"


def _route_after_goal_workbench(state: InfinityGraphState) -> str:
    route = state.get("goal_workbench_route")
    if route == "resource_search":
        return "maybe_retrieve_resources"
    if route == "expert_matching":
        if _is_policy_blocked_expert_request(state):
            return "assemble_response_blocks"
        return "maybe_retrieve_experts"
    return "validate_response"


def _route_after_strategy(state: InfinityGraphState) -> str:
    active_flow = state.get("active_flow")
    if _is_policy_blocked_expert_request(state):
        return "assemble_response_blocks"
    if active_flow in {
        "soft_response",
        "platform_help",
        "repair",
        "safety",
    }:
        return "assemble_response_blocks"
    if active_flow == "resource_search":
        return "maybe_retrieve_resources"
    return "maybe_generate_framework"


def _route_after_framework(state: InfinityGraphState) -> str:
    if (
        state.get("active_flow") == "expert_matching"
        and state.get("turn_policy", {}).get("allow_tools", False)
        and state.get("turn_policy", {}).get("allow_recommendations", False)
        and state["strategy_bundle"].strategy.should_retrieve_experts
    ):
        return "maybe_retrieve_experts"
    return "assemble_response_blocks"


async def _patch_correction_context(state: InfinityGraphState) -> dict[str, Any]:
    previous_snapshot = state["policy_context"]["conversation"].get("signalSnapshot", {})
    patch_result = await generate_correction_patch(
        state["provider"],
        user_message=state["user_message"],
        history=_prior_turns(state),
        signal_snapshot=previous_snapshot,
    )
    normalized = apply_correction_patch(
        patch_result.parsed,
        previous_snapshot,
        state["user_message"],
    )
    return {
        "extraction_result": None,
        "signal_snapshot": normalized.snapshot,
        "signal_updates": normalized.updates,
        "phase_after": state["phase_before"],
        "model_calls": [
            *state.get("model_calls", []),
            _llm_call_trace("patch_correction_context", patch_result),
        ],
        NODE_SUMMARY_KEY: {
            "schemaName": patch_result.schema_name,
            "updateCount": len(normalized.updates),
            "signalSummary": _signal_summary(normalized.snapshot),
            "patch": patch_result.parsed.model_dump(mode="json"),
        },
    }


async def _extract_signals(state: InfinityGraphState) -> dict[str, Any]:
    policy_context = state["policy_context"]
    extraction = await extract_signals(
        state["provider"],
        user_message=state["user_message"],
        history=_prior_turns(state),
        memory_items=_response_memory_items(state),
        signal_snapshot=policy_context["conversation"].get("signalSnapshot", {}),
    )
    return {
        "extraction_result": extraction.parsed,
        "model_calls": [
            *state.get("model_calls", []),
            _llm_call_trace("extract_signals", extraction),
        ],
        NODE_SUMMARY_KEY: {
            "schemaName": extraction.schema_name,
            "primaryIntent": extraction.parsed.primary_intent,
            "supportedUseCase": extraction.parsed.supported_use_case,
        },
    }


async def _normalize_signals(state: InfinityGraphState) -> dict[str, Any]:
    normalized = normalize_extracted_signals(
        state["extraction_result"],
        state["policy_context"]["conversation"].get("signalSnapshot", {}),
        state["user_message"],
    )
    return {
        "signal_snapshot": normalized.snapshot,
        "signal_updates": normalized.updates,
        NODE_SUMMARY_KEY: {
            "updateCount": len(normalized.updates),
            "signalSummary": _signal_summary(normalized.snapshot),
        },
    }


async def _choose_conversation_step(state: InfinityGraphState) -> dict[str, Any]:
    phase_after = choose_conversation_phase(
        phase_before=state["phase_before"],
        signal_snapshot=state["signal_snapshot"],
        turn_count=len(_prior_turns(state)) + 1,
    )
    return {
        "phase_after": phase_after,
        NODE_SUMMARY_KEY: {
            "phaseBefore": state["phase_before"],
            "phaseAfter": phase_after,
        },
    }


async def _generate_strategy(state: InfinityGraphState) -> dict[str, Any]:
    active_flow = state.get("active_flow", "goal_companion")
    conversation_act = state.get("conversation_act", "goal_help")
    composer = None

    if active_flow == "goal_companion":
        raise RuntimeError("goal_companion turns must execute through goal_workbench")

    if _is_policy_blocked_expert_request(state):
        composer = compose_blocked_expert_response
    elif active_flow == "safety" or conversation_act in {"unsupported", "platform_help"}:
        composer = compose_boundary_response
    elif active_flow == "soft_response":
        composer = compose_soft_response
    elif active_flow == "resource_search":
        composer = compose_resource_response
    elif active_flow == "expert_matching":
        composer = compose_expert_planning_response
    elif active_flow == "repair":
        composer = compose_correction_response

    if composer is None:
        raise RuntimeError(f"No strategy composer configured for active_flow={active_flow}")

    strategy_bundle_result = await composer(
        state["provider"],
        user_message=state["user_message"],
        signal_snapshot=state["signal_snapshot"],
        memory_items=_response_memory_items(state),
        phase=state["phase_after"],
        turns=_prior_turns(state),
        conversation_act=conversation_act,
        active_flow=active_flow,
        turn_policy=state.get("turn_policy", {}),
    )
    return {
        "strategy_bundle": strategy_bundle_result.parsed,
        "model_calls": [
            *state.get("model_calls", []),
            _llm_call_trace("generate_strategy", strategy_bundle_result),
        ],
        NODE_SUMMARY_KEY: {
            "schemaName": strategy_bundle_result.schema_name,
            "strategyPhase": strategy_bundle_result.parsed.strategy.phase,
            "shouldRetrieveExperts": strategy_bundle_result.parsed.strategy.should_retrieve_experts,
            "expertRetrievalPlan": (
                strategy_bundle_result.parsed.strategy.expert_retrieval_plan.model_dump(mode="json")
                if strategy_bundle_result.parsed.strategy.expert_retrieval_plan
                else None
            ),
            "memoryUpdateCount": len(strategy_bundle_result.parsed.memory_updates.items),
            "activeFlow": active_flow,
            "promptId": strategy_bundle_result.prompt_id,
        },
    }


async def _maybe_generate_framework(state: InfinityGraphState) -> dict[str, Any]:
    framework = state["strategy_bundle"].mini_framework
    return {
        NODE_SUMMARY_KEY: {
            "hasFramework": bool(framework and (framework.items or framework.intro)),
        },
    }


async def _maybe_retrieve_experts(state: InfinityGraphState) -> dict[str, Any]:
    turn_policy = state.get("turn_policy", {})
    if (
        not turn_policy.get("allow_tools", False)
        or not turn_policy.get("allow_recommendations", False)
        or not state["strategy_bundle"].strategy.should_retrieve_experts
    ):
        return {
            "expert_candidates": [],
            NODE_SUMMARY_KEY: {
                "skipped": True,
                "reason": "turn_policy_or_strategy_blocked_experts",
                "turnPolicy": turn_policy,
            },
        }

    expert_payload = await state["platform_client"].get_expert_candidates(
        conversation_id=state["conversation_id"],
        actor=state["actor"],
        signal_snapshot=state["signal_snapshot"],
    )
    candidates = [
        PlatformCandidate.model_validate(item)
        for item in expert_payload.get("candidates", [])
    ]
    return {
        "expert_candidates": candidates,
        "tool_calls": [
            *state.get("tool_calls", []),
            {
                "toolName": "get_expert_candidates",
                "candidateCount": len(candidates),
            },
        ],
        NODE_SUMMARY_KEY: {"candidateCount": len(candidates)},
    }


async def _maybe_retrieve_resources(state: InfinityGraphState) -> dict[str, Any]:
    turn_policy = state.get("turn_policy", {})
    platform_policy = state.get("policy_context", {}).get("policy", {})
    if (
        state.get("active_flow") != "resource_search"
        or not turn_policy.get("allow_tools", False)
        or not turn_policy.get("allow_recommendations", False)
        or not platform_policy.get("canRecommendResources", True)
    ):
        return {
            "resource_candidates": [],
            NODE_SUMMARY_KEY: {
                "skipped": True,
                "reason": "turn_policy_or_platform_policy_blocked_resources",
                "turnPolicy": turn_policy,
                "canRecommendResources": platform_policy.get("canRecommendResources", True),
            },
        }

    resource_payload = await state["platform_client"].get_resource_candidates(
        conversation_id=state["conversation_id"],
        actor=state["actor"],
        signal_snapshot=state["signal_snapshot"],
        user_message=state["user_message"],
    )
    candidates = [
        PlatformResourceCandidate.model_validate(item)
        for item in resource_payload.get("candidates", [])
    ]
    return {
        "resource_candidates": candidates,
        "tool_calls": [
            *state.get("tool_calls", []),
            {
                "toolName": "get_resource_candidates",
                "candidateCount": len(candidates),
                "visibility": resource_payload.get("visibility", "public"),
            },
        ],
        NODE_SUMMARY_KEY: {
            "candidateCount": len(candidates),
            "visibility": resource_payload.get("visibility", "public"),
        },
    }


async def _score_candidates(state: InfinityGraphState) -> dict[str, Any]:
    if not state.get("turn_policy", {}).get("allow_recommendations", False):
        return {
            "scored_candidates": [],
            "candidate_count": 0,
            NODE_SUMMARY_KEY: {"skipped": True, "reason": "turn_policy_blocked_scoring"},
        }

    scored_candidates = [
        score_candidate(state["signal_snapshot"], candidate)
        for candidate in state.get("expert_candidates", [])
    ]
    return {
        "scored_candidates": scored_candidates,
        "candidate_count": len(scored_candidates),
        NODE_SUMMARY_KEY: {
            "candidateCount": len(scored_candidates),
            "topScores": [
                {
                    "mentorProfileId": item.candidate.mentorProfileId,
                    "finalScore": item.final_score,
                }
                for item in sorted(scored_candidates, key=lambda item: item.final_score, reverse=True)[:5]
            ],
        },
    }


async def _score_resource_candidates(state: InfinityGraphState) -> dict[str, Any]:
    if (
        state.get("active_flow") != "resource_search"
        or not state.get("turn_policy", {}).get("allow_recommendations", False)
    ):
        return {
            "scored_resource_candidates": [],
            NODE_SUMMARY_KEY: {"skipped": True, "reason": "turn_policy_blocked_resource_scoring"},
        }

    scored_resource_candidates = [
        score_resource_candidate(state["signal_snapshot"], candidate)
        for candidate in state.get("resource_candidates", [])
    ]
    return {
        "scored_resource_candidates": scored_resource_candidates,
        NODE_SUMMARY_KEY: {
            "candidateCount": len(scored_resource_candidates),
            "topScores": [
                {
                    "resourceId": item.candidate.resourceId,
                    "resourceType": item.candidate.resourceType,
                    "finalScore": item.final_score,
                }
                for item in sorted(
                    scored_resource_candidates,
                    key=lambda item: item.final_score,
                    reverse=True,
                )[:5]
            ],
        },
    }


async def _allocate_slots(state: InfinityGraphState) -> dict[str, Any]:
    if not state.get("turn_policy", {}).get("allow_recommendations", False):
        return {
            "scored_candidates": [],
            "selected_candidates": [],
            "selected_expert_ids": [],
            NODE_SUMMARY_KEY: {"skipped": True, "reason": "turn_policy_blocked_allocation"},
        }

    selection_mode = _expert_selection_mode_for_state(state)
    max_selected_count = _expert_max_selected_count(state)
    slotted_candidates = select_slots(
        state.get("scored_candidates", []),
        selection_mode=selection_mode,
        max_selected_count=max_selected_count,
    )
    selected_candidates = [
        candidate for candidate in slotted_candidates if candidate.selected
    ][:max_selected_count]
    selected_expert_ids = [
        candidate.candidate.mentorProfileId for candidate in selected_candidates
    ]
    return {
        "scored_candidates": slotted_candidates,
        "selected_candidates": selected_candidates,
        "selected_expert_ids": selected_expert_ids,
        NODE_SUMMARY_KEY: {
            "selectionMode": selection_mode,
            "maxSelectedCount": max_selected_count,
            "selectedCount": len(selected_candidates),
            "selectedExperts": [
                {
                    "mentorProfileId": candidate.candidate.mentorProfileId,
                    "slotType": candidate.slot_type,
                    "finalScore": candidate.final_score,
                }
                for candidate in selected_candidates
            ],
        },
    }


async def _diagnose_expert_selection(state: InfinityGraphState) -> dict[str, Any]:
    selected_candidates = state.get("selected_candidates", [])
    scored_candidates = state.get("scored_candidates", [])
    expert_candidates = state.get("expert_candidates", [])
    turn_policy = state.get("turn_policy", {})
    selection_mode = _expert_selection_mode_for_state(state)
    plan = _expert_retrieval_plan(state)
    plan_intent = plan.selection_intent if plan else selection_mode
    can_retry_broad = plan_intent in {
        "open_discovery",
        "quality_first",
        "pending_category_preview",
    }

    diagnosis: dict[str, Any] = {
        "ran": True,
        "conversationAct": state.get("conversation_act"),
        "candidateCount": len(expert_candidates),
        "selectedCountBefore": len(selected_candidates),
        "selectionModeBefore": selection_mode,
        "planSelectionIntent": plan_intent,
        "retryApplied": False,
        "diagnosis": "selection_valid",
    }

    if (
        state.get("conversation_act") != "expert_request"
        or not turn_policy.get("allow_recommendations", False)
        or not expert_candidates
        or selected_candidates
    ):
        return {"expert_selection_diagnosis": diagnosis, NODE_SUMMARY_KEY: diagnosis}

    if not can_retry_broad:
        diagnosis["diagnosis"] = "strict_relevance_no_match"
        return {"expert_selection_diagnosis": diagnosis, NODE_SUMMARY_KEY: diagnosis}

    retry_mode = (
        "open_discovery"
        if plan_intent in {"open_discovery", "pending_category_preview"}
        else "quality_first"
    )
    max_selected_count = _expert_max_selected_count(state)
    slotted_candidates = select_slots(
        scored_candidates,
        selection_mode=retry_mode,
        max_selected_count=max_selected_count,
    )
    selected_after_retry = [
        candidate for candidate in slotted_candidates if candidate.selected
    ][:max_selected_count]
    selected_expert_ids = [
        candidate.candidate.mentorProfileId for candidate in selected_after_retry
    ]
    diagnosis.update(
        {
            "selectionModeAfter": retry_mode,
            "selectedCountAfter": len(selected_after_retry),
            "retryApplied": True,
            "diagnosis": (
                "selection_mode_too_strict_retried"
                if selected_after_retry
                else "retry_failed_no_selectable_candidates"
            ),
        }
    )
    return {
        "expert_selection_diagnosis": diagnosis,
        "expert_allocation_retry_count": state.get("expert_allocation_retry_count", 0) + 1,
        "scored_candidates": slotted_candidates,
        "selected_candidates": selected_after_retry,
        "selected_expert_ids": selected_expert_ids,
        NODE_SUMMARY_KEY: diagnosis,
    }


async def _allocate_resource_slots(state: InfinityGraphState) -> dict[str, Any]:
    if (
        state.get("active_flow") != "resource_search"
        or not state.get("turn_policy", {}).get("allow_recommendations", False)
    ):
        return {
            "scored_resource_candidates": [],
            "selected_resource_candidates": [],
            "selected_resource_ids": [],
            NODE_SUMMARY_KEY: {"skipped": True, "reason": "turn_policy_blocked_resource_allocation"},
        }

    slotted_candidates = select_resource_slots(state.get("scored_resource_candidates", []))
    selected_resource_candidates = [
        candidate for candidate in slotted_candidates if candidate.selected
    ][:3]
    selected_resource_ids = [
        candidate.candidate.resourceId for candidate in selected_resource_candidates
    ]
    return {
        "scored_resource_candidates": slotted_candidates,
        "selected_resource_candidates": selected_resource_candidates,
        "selected_resource_ids": selected_resource_ids,
        NODE_SUMMARY_KEY: {
            "selectedCount": len(selected_resource_candidates),
            "selectedResources": [
                {
                    "resourceId": candidate.candidate.resourceId,
                    "resourceType": candidate.candidate.resourceType,
                    "slotType": candidate.slot_type,
                    "finalScore": candidate.final_score,
                }
                for candidate in selected_resource_candidates
            ],
        },
    }


def _expert_retrieval_ran(state: InfinityGraphState) -> bool:
    return any(
        call.get("toolName") == "get_expert_candidates"
        for call in state.get("tool_calls", [])
        if isinstance(call, dict)
    )


async def _maybe_generate_expert_elevation(state: InfinityGraphState) -> dict[str, Any]:
    selected_candidates = state.get("selected_candidates", [])
    if not selected_candidates:
        if (
            state.get("conversation_act") == "expert_request"
            and state.get("turn_policy", {}).get("allow_recommendations", False)
            and _expert_retrieval_ran(state)
            and state.get("active_flow") == "expert_matching"
        ):
            no_match_result = await compose_expert_no_match_response(
                state["provider"],
                user_message=state["user_message"],
                signal_snapshot=state["signal_snapshot"],
                memory_items=_response_memory_items(state),
                phase=state["phase_after"],
                turns=_prior_turns(state),
                conversation_act=state.get("conversation_act", "expert_request"),
                active_flow="expert_matching",
                turn_policy=state.get("turn_policy", {}),
                candidate_count=len(state.get("expert_candidates", [])),
                selected_count=0,
                selection_diagnosis=state.get("expert_selection_diagnosis"),
            )
            return {
                "strategy_bundle": no_match_result.parsed,
                "recommendation_bundle_result": None,
                "model_calls": [
                    *state.get("model_calls", []),
                    _llm_call_trace("generate_expert_no_match", no_match_result),
                ],
                NODE_SUMMARY_KEY: {
                    "schemaName": no_match_result.schema_name,
                    "promptId": no_match_result.prompt_id,
                    "contextPack": (no_match_result.metadata or {}).get("contextPack"),
                    "candidateCount": len(state.get("expert_candidates", [])),
                    "selectedCount": 0,
                },
            }
        return {
            "recommendation_bundle_result": None,
            NODE_SUMMARY_KEY: {"skipped": True, "reason": "no_selected_experts"},
        }

    recommendation_bundle_result = await generate_recommendation_bundle(
        state["provider"],
        signal_snapshot=state["signal_snapshot"],
        selected_candidates=[
            {
                "name": candidate.candidate.name,
                "mentorProfileId": candidate.candidate.mentorProfileId,
                "title": candidate.candidate.title,
                "company": candidate.candidate.company,
                "headline": candidate.candidate.headline,
                "slot_type": candidate.slot_type,
            }
            for candidate in selected_candidates
        ],
        conversation_phase="expert_recommendation",
    )
    return {
        "phase_after": "expert_recommendation",
        "recommendation_bundle_result": recommendation_bundle_result.parsed,
        "model_calls": [
            *state.get("model_calls", []),
            _llm_call_trace("generate_expert_elevation", recommendation_bundle_result),
        ],
        NODE_SUMMARY_KEY: {
            "schemaName": recommendation_bundle_result.schema_name,
            "hasExpertElevation": bool(recommendation_bundle_result.parsed.expert_elevation),
            "hasSessionReadiness": bool(recommendation_bundle_result.parsed.session_readiness),
        },
    }


async def _maybe_generate_session_readiness(state: InfinityGraphState) -> dict[str, Any]:
    result = state.get("recommendation_bundle_result")
    if not result or not result.session_readiness:
        return {
            "readiness_snapshot": None,
            NODE_SUMMARY_KEY: {"skipped": True, "reason": "no_session_readiness"},
        }

    readiness = result.session_readiness
    readiness_snapshot = {
        "summary": readiness.summary,
        "focusAreas": readiness.focus_areas,
        "decisionsToClarify": readiness.decisions_to_clarify,
        "constraintsToShare": readiness.constraints_to_share,
        "questionsToAsk": readiness.questions_to_ask,
    }
    return {
        "phase_after": "session_readiness",
        "readiness_snapshot": readiness_snapshot,
        NODE_SUMMARY_KEY: {"focusAreaCount": len(readiness.focus_areas)},
    }


async def _assemble_response_blocks(state: InfinityGraphState) -> dict[str, Any]:
    turn_policy = state.get("turn_policy", {})
    platform_policy = state.get("policy_context", {}).get("policy", {})
    show_sign_in_cta = (
        not state.get("actor", {}).get("authenticated")
        and state.get("active_flow") == "expert_matching"
        and (
            not platform_policy.get("canRecommendExperts", False)
            or not platform_policy.get("canBookSessions", False)
            or platform_policy.get("requiresAuthForBooking", True)
        )
    )
    response_blocks = build_response_blocks(
        strategy=state["strategy_bundle"].strategy,
        mini_framework=state["strategy_bundle"].mini_framework,
        recommendation_bundle=(
            state["recommendation_bundle_result"]
            if state.get("recommendation_bundle_result")
            else None
        ),
        selected_candidates=state.get("selected_candidates", []),
        selected_resource_candidates=state.get("selected_resource_candidates", []),
        memory_items=_response_memory_items(state),
        show_sign_in_cta=show_sign_in_cta,
    )
    pending_interaction = _create_pending_interaction_if_needed(state, response_blocks)
    signal_snapshot = state["signal_snapshot"]
    if pending_interaction is not None:
        signal_snapshot = _snapshot_with_pending(signal_snapshot, pending_interaction)
    active_goal = _active_goal_state(signal_snapshot)
    memory_updates = []
    if turn_policy.get("allow_memory_updates", True) and _cross_chat_memory_enabled(state):
        memory_updates = [
            {
                "memoryType": item.memory_type,
                "content": item.content,
                "confidence": item.confidence,
                "provenance": _normalize_memory_provenance(
                    provenance=item.provenance,
                    trace_id=state["trace_id"],
                    conversation_id=state["conversation_id"],
                    phase=state["phase_after"],
                ),
            }
            for item in state["strategy_bundle"].memory_updates.items
        ]
    recommendation_run = _recommendation_run_payload(state)
    update = {
        "response_blocks": response_blocks,
        "memory_updates": memory_updates,
        "recommendation_run": recommendation_run,
        "pending_interaction": pending_interaction or state.get("pending_interaction"),
        "active_goal": active_goal,
        "signal_snapshot": signal_snapshot,
    }
    return {
        **update,
        NODE_SUMMARY_KEY: {
            "responseBlockTypes": [block.get("type") for block in response_blocks],
            "memoryUpdateCount": len(memory_updates),
            "hasRecommendationRun": recommendation_run is not None,
            "pendingInteraction": _safe_json(pending_interaction),
            "activeGoal": _safe_json(active_goal),
        },
    }


async def _validate_response(state: InfinityGraphState) -> dict[str, Any]:
    expert_selection_intent = _expert_selection_intent_for_state(state)
    report = evaluate_turn_quality(
        response_blocks=state.get("response_blocks", []),
        turn_policy=state.get("turn_policy", {}),
        conversation_act=state.get("conversation_act", "goal_help"),
        signal_updates=state.get("signal_updates", []),
        extracted_signals=(
            state["extraction_result"] if state.get("extraction_result") else None
        ),
        tool_calls=state.get("tool_calls", []),
        memory_updates=state.get("memory_updates", []),
        authenticated=bool(state.get("actor", {}).get("authenticated")),
        selected_candidates=[
            *state.get("selected_candidates", []),
            *state.get("selected_resource_candidates", []),
        ],
        deterministic_ranking_used=bool(state.get("selected_candidates", []))
        or not any(
            block.get("type") == "expert_cards"
            for block in state.get("response_blocks", [])
        ),
        recent_turns=_prior_turns(state),
        successful_response=True,
        expert_candidate_count=len(state.get("expert_candidates", [])),
        selected_expert_count=len(state.get("selected_candidates", [])),
        expert_selection_intent=expert_selection_intent,
        expert_no_match_is_legitimate=(
            not state.get("expert_candidates")
            or expert_selection_intent in {"specific_relevance", "standard"}
        ),
        user_added_concrete_details=bool(
            state.get("goal_workbench_added_details")
        ),
    )
    return {
        "quality_report": report,
        NODE_SUMMARY_KEY: {
            "passed": report.passed,
            "score": report.score,
            "failedGates": [gate.name for gate in report.gates if not gate.passed],
            "repairable": report.repairable,
            "repairAttempts": state.get("response_repair_attempts", 0),
        },
    }


def _route_after_validation(state: InfinityGraphState) -> str:
    report = state.get("quality_report")
    if report and report.passed:
        return "persist_turn_and_trace"
    if (
        report
        and report.repairable
        and state.get("response_repair_attempts", 0) < 1
    ):
        return "diagnose_response_failure"
    return "fail_response_quality"


async def _diagnose_response_failure(state: InfinityGraphState) -> dict[str, Any]:
    diagnostic = diagnose_response_failure(state["quality_report"])
    return {
        "response_diagnostic": diagnostic,
        NODE_SUMMARY_KEY: diagnostic.model_dump(mode="json"),
    }


async def _repair_response(state: InfinityGraphState) -> dict[str, Any]:
    repair_result = await repair_response_bundle(
        state["provider"],
        user_message=state["user_message"],
        signal_snapshot=state["signal_snapshot"],
        memory_items=_response_memory_items(state),
        phase=state["phase_after"],
        turns=_prior_turns(state),
        conversation_act=state.get("conversation_act", "goal_help"),
        active_flow=state.get("active_flow", "goal_companion"),
        turn_policy=state.get("turn_policy", {}),
        response_blocks=state.get("response_blocks", []),
        quality_report=state["quality_report"].model_dump(mode="json"),
    )
    return {
        "strategy_bundle": repair_result.parsed,
        "response_repair_attempts": state.get("response_repair_attempts", 0) + 1,
        "model_calls": [
            *state.get("model_calls", []),
            _llm_call_trace("repair_response", repair_result),
        ],
        NODE_SUMMARY_KEY: {
            "schemaName": repair_result.schema_name,
            "promptId": repair_result.prompt_id,
            "repairAttempt": state.get("response_repair_attempts", 0) + 1,
        },
    }


async def _fail_response_quality(state: InfinityGraphState) -> dict[str, Any]:
    raise ResponseQualityError(state["quality_report"])


async def _persist_turn_and_trace(state: InfinityGraphState) -> dict[str, Any]:
    started_at = _iso_now()
    started_perf = perf_counter()
    pending_trace = {
        "node": "persist_turn_and_trace",
        "startedAt": started_at,
        "status": "running",
        "summary": {
            "responseBlockCount": len(state.get("response_blocks", [])),
            "signalUpdateCount": len(state.get("signal_updates", [])),
        },
    }
    try:
        trace_metadata = {
            **_trace_metadata(state),
            "pendingPersistNodeTrace": pending_trace,
        }
        persist_payload = {
            "conversationId": state["conversation_id"],
            "actor": state["actor"],
            "userTurnId": state.get("user_turn_id"),
            "graphRunId": state.get("graph_run_id"),
            "userMessage": state["user_message"],
            "responseBlocks": state["response_blocks"],
            "stateUpdates": _state_updates_payload(state),
            "signalUpdates": _signal_updates_payload(state),
            "recommendationRun": state.get("recommendation_run"),
            "memoryUpdates": state.get("memory_updates", []),
            "traceMetadata": trace_metadata,
        }
        persisted = await state["platform_client"].persist(persist_payload)
        completed_trace = {
            **pending_trace,
            "completedAt": _iso_now(),
            "latencyMs": _elapsed_ms(started_perf),
            "status": "completed",
        }
        node_traces = [*state.get("node_traces", []), completed_trace]
        final_state = {**state, "node_traces": node_traces, "persisted": persisted}
        return {
            "persisted": persisted,
            "node_traces": node_traces,
            "trace_metadata": _trace_metadata(final_state),
        }
    except Exception as exc:
        failed_trace = {
            **pending_trace,
            "completedAt": _iso_now(),
            "latencyMs": _elapsed_ms(started_perf),
            "status": "failed",
            "summary": {"errorType": type(exc).__name__, "error": str(exc)[:500]},
        }
        raise GraphNodeExecutionError(
            node_name="persist_turn_and_trace",
            node_traces=[*state.get("node_traces", []), failed_trace],
            state={**state, "node_traces": [*state.get("node_traces", []), failed_trace]},
            original=exc,
        ) from exc


def build_infinity_graph(
    *,
    turn_controller_enabled: bool = False,
    provider: LlmProvider | None = None,
    platform_client: PlatformClient | None = None,
) -> Any:
    def with_runtime(fn: NodeFn) -> NodeFn:
        async def wrapped(state: InfinityGraphState) -> dict[str, Any]:
            if provider is None and platform_client is None:
                return await fn(state)
            runtime_state = dict(state)
            if provider is not None:
                runtime_state["provider"] = provider
            if platform_client is not None:
                runtime_state["platform_client"] = platform_client
            return await fn(runtime_state)

        return wrapped

    def traced(name: str, fn: NodeFn) -> NodeFn:
        return _trace_node(name, with_runtime(fn))

    graph = StateGraph(InfinityGraphState)
    graph.add_node("load_context", traced("load_context", _load_context))
    graph.add_node("turn_resolution", traced("turn_resolution", _turn_resolution))
    graph.add_node(
        "apply_pending_answer",
        traced("apply_pending_answer", _apply_pending_answer),
    )
    if turn_controller_enabled:
        graph.add_node("turn_controller", traced("turn_controller", _run_turn_controller))
    graph.add_node(
        "classify_conversation_act",
        traced("classify_conversation_act", _classify_conversation_act),
    )
    graph.add_node("goal_workbench", traced("goal_workbench", _goal_workbench))
    graph.add_node(
        "patch_correction_context",
        traced("patch_correction_context", _patch_correction_context),
    )
    graph.add_node("extract_signals", traced("extract_signals", _extract_signals))
    graph.add_node("normalize_signals", traced("normalize_signals", _normalize_signals))
    graph.add_node(
        "choose_conversation_step",
        traced("choose_conversation_step", _choose_conversation_step),
    )
    graph.add_node("generate_strategy", traced("generate_strategy", _generate_strategy))
    graph.add_node(
        "maybe_generate_framework",
        traced("maybe_generate_framework", _maybe_generate_framework),
    )
    graph.add_node(
        "maybe_retrieve_resources",
        traced("maybe_retrieve_resources", _maybe_retrieve_resources),
    )
    graph.add_node(
        "score_resource_candidates",
        traced("score_resource_candidates", _score_resource_candidates),
    )
    graph.add_node(
        "allocate_resource_slots",
        traced("allocate_resource_slots", _allocate_resource_slots),
    )
    graph.add_node(
        "maybe_retrieve_experts",
        traced("maybe_retrieve_experts", _maybe_retrieve_experts),
    )
    graph.add_node("score_candidates", traced("score_candidates", _score_candidates))
    graph.add_node("allocate_slots", traced("allocate_slots", _allocate_slots))
    graph.add_node(
        "diagnose_expert_selection",
        traced("diagnose_expert_selection", _diagnose_expert_selection),
    )
    graph.add_node(
        "maybe_generate_expert_elevation",
        traced("maybe_generate_expert_elevation", _maybe_generate_expert_elevation),
    )
    graph.add_node(
        "maybe_generate_session_readiness",
        traced(
            "maybe_generate_session_readiness",
            _maybe_generate_session_readiness,
        ),
    )
    graph.add_node(
        "assemble_response_blocks",
        traced("assemble_response_blocks", _assemble_response_blocks),
    )
    graph.add_node("validate_response", traced("validate_response", _validate_response))
    graph.add_node(
        "diagnose_response_failure",
        traced("diagnose_response_failure", _diagnose_response_failure),
    )
    graph.add_node("repair_response", traced("repair_response", _repair_response))
    graph.add_node(
        "fail_response_quality",
        traced("fail_response_quality", _fail_response_quality),
    )
    graph.add_node("persist_turn_and_trace", with_runtime(_persist_turn_and_trace))

    graph.add_edge(START, "load_context")
    load_context_targets = {
        "turn_resolution": "turn_resolution",
        "classify_conversation_act": "classify_conversation_act",
    }
    if turn_controller_enabled:
        load_context_targets["turn_controller"] = "turn_controller"
    graph.add_conditional_edges(
        "load_context",
        _route_after_load_context,
        load_context_targets,
    )
    turn_resolution_targets = {
        "apply_pending_answer": "apply_pending_answer",
        "classify_conversation_act": "classify_conversation_act",
        "generate_strategy": "generate_strategy",
        "patch_correction_context": "patch_correction_context",
    }
    graph.add_conditional_edges(
        "turn_resolution",
        _route_after_turn_resolution,
        turn_resolution_targets,
    )
    graph.add_conditional_edges(
        "apply_pending_answer",
        _route_after_pending_answer,
        {
            "maybe_retrieve_experts": "maybe_retrieve_experts",
            "maybe_retrieve_resources": "maybe_retrieve_resources",
            "goal_workbench": "goal_workbench",
            "generate_strategy": "generate_strategy",
        },
    )
    if turn_controller_enabled:
        graph.add_conditional_edges(
            "turn_controller",
            _route_after_turn_controller,
            {
                "validate_response": "validate_response",
                "classify_conversation_act": "classify_conversation_act",
                "generate_strategy": "generate_strategy",
                "goal_workbench": "goal_workbench",
                "maybe_retrieve_experts": "maybe_retrieve_experts",
                "maybe_retrieve_resources": "maybe_retrieve_resources",
            },
        )
    graph.add_conditional_edges(
        "classify_conversation_act",
        _route_after_supervisor,
        {
            "extract_signals": "extract_signals",
            "patch_correction_context": "patch_correction_context",
            "goal_workbench": "goal_workbench",
            "generate_strategy": "generate_strategy",
        },
    )
    graph.add_conditional_edges(
        "goal_workbench",
        _route_after_goal_workbench,
        {
            "validate_response": "validate_response",
            "maybe_retrieve_resources": "maybe_retrieve_resources",
            "maybe_retrieve_experts": "maybe_retrieve_experts",
            "assemble_response_blocks": "assemble_response_blocks",
        },
    )
    graph.add_edge("patch_correction_context", "generate_strategy")
    graph.add_edge("extract_signals", "normalize_signals")
    graph.add_edge("normalize_signals", "choose_conversation_step")
    graph.add_edge("choose_conversation_step", "generate_strategy")
    graph.add_conditional_edges(
        "generate_strategy",
        _route_after_strategy,
        {
            "maybe_generate_framework": "maybe_generate_framework",
            "maybe_retrieve_resources": "maybe_retrieve_resources",
            "assemble_response_blocks": "assemble_response_blocks",
        },
    )
    graph.add_edge("maybe_retrieve_resources", "score_resource_candidates")
    graph.add_edge("score_resource_candidates", "allocate_resource_slots")
    graph.add_edge("allocate_resource_slots", "assemble_response_blocks")
    graph.add_conditional_edges(
        "maybe_generate_framework",
        _route_after_framework,
        {
            "maybe_retrieve_experts": "maybe_retrieve_experts",
            "assemble_response_blocks": "assemble_response_blocks",
        },
    )
    graph.add_edge("maybe_retrieve_experts", "score_candidates")
    graph.add_edge("score_candidates", "allocate_slots")
    graph.add_edge("allocate_slots", "diagnose_expert_selection")
    graph.add_edge("diagnose_expert_selection", "maybe_generate_expert_elevation")
    graph.add_edge("maybe_generate_expert_elevation", "maybe_generate_session_readiness")
    graph.add_edge("maybe_generate_session_readiness", "assemble_response_blocks")
    graph.add_edge("assemble_response_blocks", "validate_response")
    graph.add_conditional_edges(
        "validate_response",
        _route_after_validation,
        {
            "persist_turn_and_trace": "persist_turn_and_trace",
            "diagnose_response_failure": "diagnose_response_failure",
            "fail_response_quality": "fail_response_quality",
        },
    )
    graph.add_edge("diagnose_response_failure", "repair_response")
    graph.add_edge("repair_response", "assemble_response_blocks")
    graph.add_edge(NODE_ORDER[-1], END)
    return graph.compile()


async def _run_infinity_graph_direct(
    initial_state: InfinityGraphState,
    *,
    provider: LlmProvider,
    platform_client: PlatformClient,
    turn_controller_enabled: bool,
) -> InfinityGraphState:
    state: InfinityGraphState = dict(initial_state)

    async def run_traced(node_name: str, fn: NodeFn) -> None:
        runtime_state: InfinityGraphState = {
            **state,
            "provider": provider,
            "platform_client": platform_client,
        }
        update = await _trace_node(node_name, fn)(runtime_state)
        state.update(update)

    async def run_raw(fn: NodeFn) -> None:
        runtime_state: InfinityGraphState = {
            **state,
            "provider": provider,
            "platform_client": platform_client,
        }
        update = await fn(runtime_state)
        state.update(update)

    await run_traced("load_context", _load_context)
    next_node = _route_after_load_context(state)
    steps = 0
    while True:
        steps += 1
        if steps > 80:
            raise RuntimeError("Infinity AI graph exceeded direct execution step limit")

        if next_node == "turn_resolution":
            await run_traced("turn_resolution", _turn_resolution)
            next_node = _route_after_turn_resolution(state)
        elif next_node == "apply_pending_answer":
            await run_traced("apply_pending_answer", _apply_pending_answer)
            next_node = _route_after_pending_answer(state)
        elif next_node == "turn_controller":
            if not turn_controller_enabled:
                next_node = "classify_conversation_act"
                continue
            await run_traced("turn_controller", _run_turn_controller)
            next_node = _route_after_turn_controller(state)
        elif next_node == "classify_conversation_act":
            await run_traced("classify_conversation_act", _classify_conversation_act)
            next_node = _route_after_supervisor(state)
        elif next_node == "goal_workbench":
            await run_traced("goal_workbench", _goal_workbench)
            next_node = _route_after_goal_workbench(state)
        elif next_node == "patch_correction_context":
            await run_traced("patch_correction_context", _patch_correction_context)
            next_node = "generate_strategy"
        elif next_node == "extract_signals":
            await run_traced("extract_signals", _extract_signals)
            next_node = "normalize_signals"
        elif next_node == "normalize_signals":
            await run_traced("normalize_signals", _normalize_signals)
            next_node = "choose_conversation_step"
        elif next_node == "choose_conversation_step":
            await run_traced("choose_conversation_step", _choose_conversation_step)
            next_node = "generate_strategy"
        elif next_node == "generate_strategy":
            await run_traced("generate_strategy", _generate_strategy)
            next_node = _route_after_strategy(state)
        elif next_node == "maybe_generate_framework":
            await run_traced("maybe_generate_framework", _maybe_generate_framework)
            next_node = _route_after_framework(state)
        elif next_node == "maybe_retrieve_resources":
            await run_traced("maybe_retrieve_resources", _maybe_retrieve_resources)
            next_node = "score_resource_candidates"
        elif next_node == "score_resource_candidates":
            await run_traced("score_resource_candidates", _score_resource_candidates)
            next_node = "allocate_resource_slots"
        elif next_node == "allocate_resource_slots":
            await run_traced("allocate_resource_slots", _allocate_resource_slots)
            next_node = "assemble_response_blocks"
        elif next_node == "maybe_retrieve_experts":
            await run_traced("maybe_retrieve_experts", _maybe_retrieve_experts)
            next_node = "score_candidates"
        elif next_node == "score_candidates":
            await run_traced("score_candidates", _score_candidates)
            next_node = "allocate_slots"
        elif next_node == "allocate_slots":
            await run_traced("allocate_slots", _allocate_slots)
            next_node = "diagnose_expert_selection"
        elif next_node == "diagnose_expert_selection":
            await run_traced("diagnose_expert_selection", _diagnose_expert_selection)
            next_node = "maybe_generate_expert_elevation"
        elif next_node == "maybe_generate_expert_elevation":
            await run_traced("maybe_generate_expert_elevation", _maybe_generate_expert_elevation)
            next_node = "maybe_generate_session_readiness"
        elif next_node == "maybe_generate_session_readiness":
            await run_traced("maybe_generate_session_readiness", _maybe_generate_session_readiness)
            next_node = "assemble_response_blocks"
        elif next_node == "assemble_response_blocks":
            await run_traced("assemble_response_blocks", _assemble_response_blocks)
            next_node = "validate_response"
        elif next_node == "validate_response":
            await run_traced("validate_response", _validate_response)
            next_node = _route_after_validation(state)
        elif next_node == "diagnose_response_failure":
            await run_traced("diagnose_response_failure", _diagnose_response_failure)
            next_node = "repair_response"
        elif next_node == "repair_response":
            await run_traced("repair_response", _repair_response)
            next_node = "assemble_response_blocks"
        elif next_node == "fail_response_quality":
            await run_traced("fail_response_quality", _fail_response_quality)
        elif next_node == "persist_turn_and_trace":
            await run_raw(_persist_turn_and_trace)
            return state
        else:
            raise RuntimeError(f"Unknown Infinity AI graph node: {next_node}")


async def run_graph_pipeline(
    *,
    provider: LlmProvider,
    platform_client: PlatformClient,
    conversation_id: str,
    user_message: str,
    actor: dict[str, Any],
    turn_controller_enabled: bool | None = None,
) -> dict[str, Any]:
    trace_id = str(uuid4())
    if turn_controller_enabled is None:
        turn_controller_enabled = get_settings().turn_controller_enabled
    state_before = {
        "traceId": trace_id,
        "graphVersion": GRAPH_VERSION,
        "conversationId": conversation_id,
        "surface": actor.get("surface"),
        "authenticated": actor.get("authenticated"),
        "userMessageLength": len(user_message),
        "turnControllerEnabled": turn_controller_enabled,
    }
    graph_run = await platform_client.start_graph_run(
        {
            "conversationId": conversation_id,
            "actor": actor,
            "userMessage": user_message,
            "graphVersion": GRAPH_VERSION,
            "traceId": trace_id,
            "stateBefore": state_before,
        }
    )
    initial_state: InfinityGraphState = {
        "trace_id": trace_id,
        "graph_version": GRAPH_VERSION,
        "graph_run_id": graph_run["graphRunId"],
        "user_turn_id": graph_run["userTurnId"],
        "conversation_id": conversation_id,
        "user_message": user_message,
        "actor": actor,
        "node_traces": [],
        "model_calls": [],
        "selected_expert_ids": [],
        "candidate_count": 0,
        "turn_controller_enabled": turn_controller_enabled,
    }

    try:
        final_state = await _run_infinity_graph_direct(
            initial_state,
            provider=provider,
            platform_client=platform_client,
            turn_controller_enabled=turn_controller_enabled,
        )
    except GraphNodeExecutionError as exc:
        failed_payload = {
            "conversationId": conversation_id,
            "actor": actor,
            "graphRunId": graph_run["graphRunId"],
            "userTurnId": graph_run["userTurnId"],
            "phaseBefore": exc.state.get("phase_before"),
            "phaseAfter": exc.state.get("phase_after"),
            "stateAfter": _state_snapshot(exc.state),
            "nodeTraces": exc.node_traces,
            "modelCalls": exc.state.get("model_calls", []),
            "selectedExpertIds": exc.state.get("selected_expert_ids", []),
            "error": {
                "node": exc.node_name,
                "type": type(exc.original).__name__,
                "message": str(exc.original)[:1000],
            },
        }
        capture_failed_turn(
            conversation_id=conversation_id,
            user_message=user_message,
            actor=actor,
            graph_run_id=graph_run["graphRunId"],
            user_turn_id=graph_run["userTurnId"],
            failed_node=exc.node_name,
            error=exc.original,
            node_traces=exc.node_traces,
            model_calls=exc.state.get("model_calls", []),
            state=exc.state,
            http_status=http_status_for_error(exc.original),
        )
        await platform_client.mark_graph_run_failed(failed_payload)
        raise exc.original from exc
    except Exception as exc:
        node_traces = [
            {
                "node": "graph_runtime",
                "startedAt": _iso_now(),
                "completedAt": _iso_now(),
                "latencyMs": 0,
                "status": "failed",
                "summary": {"errorType": type(exc).__name__, "error": str(exc)[:500]},
            }
        ]
        failed_payload = {
            "conversationId": conversation_id,
            "actor": actor,
            "graphRunId": graph_run["graphRunId"],
            "userTurnId": graph_run["userTurnId"],
            "phaseBefore": None,
            "phaseAfter": None,
            "stateAfter": state_before,
            "nodeTraces": node_traces,
            "modelCalls": [],
            "selectedExpertIds": [],
            "error": {
                "node": "graph_runtime",
                "type": type(exc).__name__,
                "message": str(exc)[:1000],
            },
        }
        capture_failed_turn(
            conversation_id=conversation_id,
            user_message=user_message,
            actor=actor,
            graph_run_id=graph_run["graphRunId"],
            user_turn_id=graph_run["userTurnId"],
            failed_node="graph_runtime",
            error=exc,
            node_traces=node_traces,
            model_calls=[],
            state=state_before,
            http_status=http_status_for_error(exc),
        )
        await platform_client.mark_graph_run_failed(failed_payload)
        raise

    persisted = final_state.get("persisted", {})
    capture_completed_turn(
        final_state=final_state,
        persisted=persisted,
        http_status=200,
    )
    return {
        "responseBlocks": final_state.get("response_blocks", []),
        "stateUpdates": _state_updates_payload(final_state),
        "signalUpdates": _signal_updates_payload(final_state),
        "recommendationRun": final_state.get("recommendation_run"),
        "memoryUpdates": final_state.get("memory_updates", []),
        "traceMetadata": final_state.get("trace_metadata", _trace_metadata(final_state)),
        "persistedConversation": persisted.get("conversation"),
        "persistedAssistantTurn": persisted.get("assistantTurn"),
        "persistedGraphRunId": persisted.get("graphRunId"),
        "persistedRecommendationRunId": persisted.get("recommendationRunId"),
    }
