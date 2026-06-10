from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.llm.schemas import TurnPolicy


QualityGateName = Literal[
    "schema_valid",
    "route_policy_compliant",
    "no_stale_soft_response",
    "no_duplicate_response_after_new_details",
    "no_internal_field_leakage",
    "question_allowed",
    "no_fake_signals",
    "no_tool_calls_when_blocked",
    "recommendation_earned",
    "expert_recommendation_execution_valid",
    "candidate_ids_valid",
    "selected_count_cap",
    "deterministic_ranking_used",
    "memory_allowed",
    "response_non_empty",
    "platform_boundary_preserved",
]

GateSeverity = Literal["blocker", "high", "medium", "low"]

SOFT_CONVERSATION_ACTS = {
    "chitchat",
    "meta_question",
    "repeat",
    "cancel_or_restart",
    "unsupported",
    "safety",
}

PLATFORM_OWNED_DECISION_KEYS = {
    "bookingDecision",
    "booking_decision",
    "bookingId",
    "booking_id",
    "canBookSessions",
    "can_book_sessions",
    "consumeFeature",
    "consume_feature",
    "paymentRequired",
    "payment_required",
    "policyOverride",
    "policy_override",
    "sessionId",
    "session_id",
    "subscriptionDecision",
    "subscription_decision",
    "subscriptionStatus",
    "subscription_status",
    "usageMetering",
    "usage_metering",
}


INTERNAL_ONLY_RESPONSE_KEYS = {
    "internal_rationale",
    "plannerExplanation",
    "planner_explanation",
    "policySummary",
    "policy_summary",
    "rationale",
    "responseReason",
    "response_reason",
    "signalSummary",
    "signal_summary",
    "traceMetadata",
    "trace_metadata",
}


class ValidationResult(BaseModel):
    name: QualityGateName
    passed: bool
    severity: GateSeverity = "blocker"
    message: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class TurnQualityGate(ValidationResult):
    score: float = Field(default=1.0, ge=0, le=1)


class TurnQualityReport(BaseModel):
    passed: bool
    score: float = Field(ge=0, le=1)
    gates: list[TurnQualityGate]
    repairable: bool = False
    repair_reason: str | None = None
    plateau: bool = False

    @classmethod
    def from_gates(cls, gates: Sequence[TurnQualityGate]) -> "TurnQualityReport":
        gate_list = list(gates)
        failed_gates = [gate for gate in gate_list if not gate.passed]
        score = (
            sum(gate.score for gate in gate_list) / len(gate_list)
            if gate_list
            else 1.0
        )
        return cls(
            passed=not failed_gates,
            score=round(score, 4),
            gates=gate_list,
            repairable=any(_is_repairable(gate.name) for gate in failed_gates),
            repair_reason=", ".join(gate.name for gate in failed_gates) or None,
        )


def evaluate_turn_quality(
    *,
    response_blocks: Sequence[Mapping[str, Any]],
    turn_policy: TurnPolicy | Mapping[str, Any],
    conversation_act: str,
    schema_is_valid: bool = True,
    route_policy_compliant: bool = True,
    signal_updates: Sequence[Any] | None = None,
    extracted_signals: Any | None = None,
    tool_calls: Sequence[Any] | None = None,
    memory_updates: Sequence[Any] | None = None,
    authenticated: bool = False,
    selected_candidates: Sequence[Any] | None = None,
    deterministic_ranking_used: bool = True,
    platform_decisions: Mapping[str, Any] | Sequence[str] | None = None,
    recent_turns: Sequence[Mapping[str, Any]] | None = None,
    successful_response: bool = True,
    max_selected_experts: int = 3,
    expert_candidate_count: int = 0,
    selected_expert_count: int = 0,
    expert_selection_intent: str | None = None,
    expert_no_match_is_legitimate: bool = True,
    user_added_concrete_details: bool = False,
) -> TurnQualityReport:
    policy = _policy_to_dict(turn_policy)
    blocks = list(response_blocks)

    gates = [
        gate_schema_valid(schema_is_valid),
        gate_route_policy_compliant(route_policy_compliant),
        gate_no_stale_soft_response(
            blocks,
            recent_turns=recent_turns or [],
            conversation_act=conversation_act,
        ),
        gate_no_duplicate_response_after_new_details(
            blocks,
            recent_turns=recent_turns or [],
            user_added_concrete_details=user_added_concrete_details,
        ),
        gate_no_internal_field_leakage(blocks),
        gate_question_allowed(blocks, allow_question=bool(policy.get("allow_question", True))),
        gate_no_fake_signals(
            conversation_act=conversation_act,
            allow_extraction=bool(policy.get("allow_extraction", True)),
            signal_updates=signal_updates or [],
            extracted_signals=extracted_signals,
        ),
        gate_no_tool_calls_when_blocked(
            allow_tools=bool(policy.get("allow_tools", False)),
            tool_calls=tool_calls or [],
        ),
        gate_recommendation_earned(
            blocks,
            allow_recommendations=bool(policy.get("allow_recommendations", False)),
        ),
        gate_expert_recommendation_execution_valid(
            conversation_act=conversation_act,
            allow_recommendations=bool(policy.get("allow_recommendations", False)),
            expert_candidate_count=expert_candidate_count,
            selected_expert_count=selected_expert_count,
            selection_intent=expert_selection_intent,
            no_match_is_legitimate=expert_no_match_is_legitimate,
        ),
        gate_candidate_ids_valid(blocks, selected_candidates=selected_candidates or []),
        gate_selected_count_cap(blocks, max_selected_experts=max_selected_experts),
        gate_deterministic_ranking_used(
            blocks,
            deterministic_ranking_used=deterministic_ranking_used,
        ),
        gate_memory_allowed(
            allow_memory_updates=bool(policy.get("allow_memory_updates", True)),
            authenticated=authenticated,
            memory_updates=memory_updates or [],
        ),
        gate_response_non_empty(blocks, successful_response=successful_response),
        gate_platform_boundary_preserved(
            response_blocks=blocks,
            platform_decisions=platform_decisions,
        ),
    ]

    return TurnQualityReport.from_gates(gates)


def gate_schema_valid(schema_is_valid: bool) -> TurnQualityGate:
    return _gate(
        "schema_valid",
        passed=schema_is_valid,
        message="Structured response failed schema validation.",
    )


def gate_route_policy_compliant(route_policy_compliant: bool) -> TurnQualityGate:
    return _gate(
        "route_policy_compliant",
        passed=route_policy_compliant,
        message="Turn output violated the supervisor route policy.",
    )


def gate_no_stale_soft_response(
    response_blocks: Sequence[Mapping[str, Any]],
    *,
    recent_turns: Sequence[Mapping[str, Any]],
    conversation_act: str,
) -> TurnQualityGate:
    if conversation_act not in SOFT_CONVERSATION_ACTS or conversation_act == "repeat":
        return _gate(
            "no_stale_soft_response",
            passed=True,
            message="Soft response repeated a prior assistant turn.",
        )

    current_texts = [
        _normalize_text(text)
        for text in _iter_user_visible_text(response_blocks)
        if len(_normalize_text(text)) >= 20
    ]
    prior_assistant_texts = _prior_assistant_texts(recent_turns)
    repeated = sorted(
        {
            text
            for text in current_texts
            if text and text in prior_assistant_texts
        }
    )

    return _gate(
        "no_stale_soft_response",
        passed=not repeated,
        message="Soft response repeated a prior assistant turn instead of answering the current user message.",
        evidence={"repeated": repeated},
    )


def gate_no_duplicate_response_after_new_details(
    response_blocks: Sequence[Mapping[str, Any]],
    *,
    recent_turns: Sequence[Mapping[str, Any]],
    user_added_concrete_details: bool,
) -> TurnQualityGate:
    if not user_added_concrete_details:
        return _gate(
            "no_duplicate_response_after_new_details",
            passed=True,
            message="Assistant repeated the prior response after the user added concrete details.",
        )

    previous_text = _last_assistant_visible_text(recent_turns)
    current_text = _visible_text_digest(response_blocks)
    similarity = _token_similarity(previous_text, current_text)
    repeated = bool(previous_text and current_text) and (
        previous_text == current_text or similarity >= 0.85
    )
    return _gate(
        "no_duplicate_response_after_new_details",
        passed=not repeated,
        message="Assistant repeated the prior response after the user added concrete details.",
        evidence={
            "similarity": round(similarity, 4),
            "previousTextLength": len(previous_text),
            "currentTextLength": len(current_text),
        },
    )


def gate_no_internal_field_leakage(
    response_blocks: Sequence[Mapping[str, Any]],
) -> TurnQualityGate:
    leaked_fields = _internal_fields_in_value(response_blocks)
    return _gate(
        "no_internal_field_leakage",
        passed=not leaked_fields,
        message="User-visible response blocks contain internal-only fields.",
        evidence={"fields": leaked_fields},
    )


def gate_question_allowed(
    response_blocks: Sequence[Mapping[str, Any]],
    *,
    allow_question: bool,
) -> TurnQualityGate:
    questions = _explicit_question_fields(response_blocks)
    return _gate(
        "question_allowed",
        passed=allow_question or not questions,
        message="Turn policy disallows explicit question blocks.",
        evidence={"questions": questions},
    )


def gate_no_fake_signals(
    *,
    conversation_act: str,
    allow_extraction: bool,
    signal_updates: Sequence[Any],
    extracted_signals: Any | None,
) -> TurnQualityGate:
    non_pending_signal_updates = [
        update
        for update in signal_updates
        if not _signal_update_has_only_bounded_context_evidence(update)
    ]
    signal_evidence = {
        "signalUpdates": _safe_jsonable_list(signal_updates),
        "extractedSignals": _safe_jsonable(extracted_signals),
    }
    signals_present = bool(non_pending_signal_updates) or _has_extracted_signal_content(extracted_signals)
    extraction_blocked = not allow_extraction or conversation_act in SOFT_CONVERSATION_ACTS
    return _gate(
        "no_fake_signals",
        passed=not (extraction_blocked and signals_present),
        message="Signals were extracted or updated for a turn that disallows extraction.",
        evidence=signal_evidence,
    )


def gate_no_tool_calls_when_blocked(
    *,
    allow_tools: bool,
    tool_calls: Sequence[Any],
) -> TurnQualityGate:
    return _gate(
        "no_tool_calls_when_blocked",
        passed=allow_tools or not tool_calls,
        message="Tool calls were recorded for a turn whose policy blocks tools.",
        evidence={"toolCalls": _safe_jsonable_list(tool_calls)},
    )


def gate_recommendation_earned(
    response_blocks: Sequence[Mapping[str, Any]],
    *,
    allow_recommendations: bool,
) -> TurnQualityGate:
    recommendation_types = _recommendation_block_types(response_blocks)
    return _gate(
        "recommendation_earned",
        passed=allow_recommendations or not recommendation_types,
        message="Recommendation blocks were emitted when recommendations are not allowed.",
        evidence={"recommendationBlockTypes": recommendation_types},
    )


def gate_expert_recommendation_execution_valid(
    *,
    conversation_act: str,
    allow_recommendations: bool,
    expert_candidate_count: int,
    selected_expert_count: int,
    selection_intent: str | None,
    no_match_is_legitimate: bool,
) -> TurnQualityGate:
    broad_intents = {"open_discovery", "quality_first", "pending_category_preview"}
    failed_execution = (
        conversation_act == "expert_request"
        and allow_recommendations
        and expert_candidate_count > 0
        and selected_expert_count == 0
        and (
            selection_intent in broad_intents
            or not no_match_is_legitimate
        )
    )
    return _gate(
        "expert_recommendation_execution_valid",
        passed=not failed_execution,
        message=(
            "Expert request had eligible candidates but produced no selected expert cards."
        ),
        evidence={
            "expertCandidateCount": expert_candidate_count,
            "selectedExpertCount": selected_expert_count,
            "selectionIntent": selection_intent,
            "noMatchIsLegitimate": no_match_is_legitimate,
        },
    )


def gate_candidate_ids_valid(
    response_blocks: Sequence[Mapping[str, Any]],
    *,
    selected_candidates: Sequence[Any],
) -> TurnQualityGate:
    problems: list[dict[str, Any]] = []
    selected_expert_ids = _selected_expert_ids(selected_candidates)
    selected_resource_ids = _selected_resource_ids(selected_candidates)

    for block in response_blocks:
        if block.get("type") == "expert_cards":
            experts = block.get("experts")
            if not isinstance(experts, list) or not experts:
                problems.append({"type": "expert_cards", "reason": "missing experts"})
                continue
            for expert in experts:
                if not isinstance(expert, Mapping):
                    problems.append({"type": "expert_cards", "reason": "invalid expert"})
                    continue
                profile_id = _non_empty_string(expert.get("mentorProfileId"))
                user_id = _non_empty_string(expert.get("mentorUserId"))
                if not profile_id or not user_id:
                    problems.append(
                        {
                            "type": "expert_cards",
                            "reason": "missing canonical mentor ids",
                            "expert": dict(expert),
                        }
                    )
                elif selected_expert_ids and profile_id not in selected_expert_ids:
                    problems.append(
                        {
                            "type": "expert_cards",
                            "reason": "expert was not in deterministic selected candidates",
                            "mentorProfileId": profile_id,
                        }
                    )
                elif not selected_expert_ids:
                    problems.append(
                        {
                            "type": "expert_cards",
                            "reason": "expert cards require selected candidates",
                            "mentorProfileId": profile_id,
                        }
                    )

        if block.get("type") == "resource_cards":
            resources = block.get("resources") or block.get("items")
            if not isinstance(resources, list) or not resources:
                problems.append({"type": "resource_cards", "reason": "missing resources"})
                continue
            for resource in resources:
                if not isinstance(resource, Mapping):
                    problems.append({"type": "resource_cards", "reason": "invalid resource"})
                    continue
                resource_id = _non_empty_string(resource.get("resourceId") or resource.get("id"))
                resource_type = _non_empty_string(resource.get("resourceType") or resource.get("type"))
                href = _non_empty_string(resource.get("href"))
                if not resource_id or not resource_type or not href:
                    problems.append(
                        {
                            "type": "resource_cards",
                            "reason": "missing canonical resource fields",
                            "resource": dict(resource),
                        }
                    )
                elif selected_resource_ids and resource_id not in selected_resource_ids:
                    problems.append(
                        {
                            "type": "resource_cards",
                            "reason": "resource was not in deterministic selected candidates",
                            "resourceId": resource_id,
                        }
                    )

    return _gate(
        "candidate_ids_valid",
        passed=not problems,
        message="Recommendation cards are missing canonical candidate identifiers.",
        evidence={"problems": problems},
    )


def gate_selected_count_cap(
    response_blocks: Sequence[Mapping[str, Any]],
    *,
    max_selected_experts: int,
) -> TurnQualityGate:
    expert_count = sum(
        len(block.get("experts") or [])
        for block in response_blocks
        if block.get("type") == "expert_cards"
    )
    return _gate(
        "selected_count_cap",
        passed=expert_count <= max_selected_experts,
        message="Expert recommendation blocks exceed the selected expert cap.",
        evidence={"expertCount": expert_count, "maxSelectedExperts": max_selected_experts},
    )


def gate_deterministic_ranking_used(
    response_blocks: Sequence[Mapping[str, Any]],
    *,
    deterministic_ranking_used: bool,
) -> TurnQualityGate:
    has_expert_cards = any(block.get("type") == "expert_cards" for block in response_blocks)
    return _gate(
        "deterministic_ranking_used",
        passed=not has_expert_cards or deterministic_ranking_used,
        message="Expert recommendations require deterministic selected candidates.",
    )


def gate_memory_allowed(
    *,
    allow_memory_updates: bool,
    authenticated: bool,
    memory_updates: Sequence[Any],
) -> TurnQualityGate:
    memory_blocked = bool(memory_updates) and (not allow_memory_updates or not authenticated)
    return _gate(
        "memory_allowed",
        passed=not memory_blocked,
        message="Durable memory updates were proposed for a turn that cannot persist memory.",
        evidence={
            "authenticated": authenticated,
            "allowMemoryUpdates": allow_memory_updates,
            "memoryUpdateCount": len(memory_updates),
        },
    )


def gate_response_non_empty(
    response_blocks: Sequence[Mapping[str, Any]],
    *,
    successful_response: bool,
) -> TurnQualityGate:
    has_renderable_content = any(_block_has_renderable_content(block) for block in response_blocks)
    return _gate(
        "response_non_empty",
        passed=not successful_response or has_renderable_content,
        message="Successful assistant response has no renderable response blocks.",
        evidence={"responseBlockCount": len(response_blocks)},
    )


def gate_platform_boundary_preserved(
    *,
    response_blocks: Sequence[Mapping[str, Any]],
    platform_decisions: Mapping[str, Any] | Sequence[str] | None = None,
) -> TurnQualityGate:
    explicit_keys = _platform_decision_keys(platform_decisions)
    block_keys = _platform_owned_keys_in_value(response_blocks)
    keys = sorted(explicit_keys | block_keys)
    return _gate(
        "platform_boundary_preserved",
        passed=not keys,
        message="Python output contains platform-owned booking, policy, payment, or usage decisions.",
        evidence={"platformOwnedKeys": keys},
    )


def _gate(
    name: QualityGateName,
    *,
    passed: bool,
    message: str,
    evidence: dict[str, Any] | None = None,
    severity: GateSeverity = "blocker",
) -> TurnQualityGate:
    return TurnQualityGate(
        name=name,
        passed=passed,
        severity=severity,
        message=None if passed else message,
        evidence=evidence or {},
        score=1.0 if passed else 0.0,
    )


def _policy_to_dict(turn_policy: TurnPolicy | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(turn_policy, TurnPolicy):
        return turn_policy.model_dump()
    return dict(turn_policy)


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _iter_user_visible_text(value: Any) -> list[str]:
    texts: list[str] = []
    if isinstance(value, Mapping):
        for key, item in value.items():
            if key in {"body", "content", "description", "question", "suggestedReply", "title"}:
                if isinstance(item, str) and item.strip():
                    texts.append(item)
            elif key == "items":
                texts.extend(_iter_user_visible_text(item))
    elif isinstance(value, Sequence) and not isinstance(value, str):
        for item in value:
            texts.extend(_iter_user_visible_text(item))
    return texts


def _internal_fields_in_value(value: Any, *, path: str = "$") -> list[str]:
    fields: list[str] = []
    if isinstance(value, Mapping):
        for key, item in value.items():
            key_path = f"{path}.{key}"
            if str(key) in INTERNAL_ONLY_RESPONSE_KEYS:
                fields.append(key_path)
            fields.extend(_internal_fields_in_value(item, path=key_path))
    elif isinstance(value, Sequence) and not isinstance(value, str):
        for index, item in enumerate(value):
            fields.extend(_internal_fields_in_value(item, path=f"{path}[{index}]"))
    return fields


def _prior_assistant_texts(recent_turns: Sequence[Mapping[str, Any]]) -> set[str]:
    texts: set[str] = set()
    for turn in recent_turns:
        if turn.get("actor") != "assistant":
            continue
        blocks = turn.get("responseBlocks") or turn.get("response_blocks") or []
        for text in _iter_user_visible_text(blocks):
            normalized = _normalize_text(text)
            if len(normalized) >= 20:
                texts.add(normalized)
    return texts


def _last_assistant_visible_text(recent_turns: Sequence[Mapping[str, Any]]) -> str:
    for turn in reversed(recent_turns):
        if turn.get("actor") != "assistant":
            continue
        blocks = turn.get("responseBlocks") or turn.get("response_blocks") or []
        return _visible_text_digest(blocks)
    return ""


def _visible_text_digest(response_blocks: Sequence[Mapping[str, Any]] | Any) -> str:
    return _normalize_text(" ".join(_iter_user_visible_text(response_blocks)))


def _token_similarity(left: str, right: str) -> float:
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _explicit_question_fields(response_blocks: Sequence[Mapping[str, Any]]) -> list[str]:
    questions: list[str] = []
    for block in response_blocks:
        explicit_question = _non_empty_string(block.get("question"))
        if explicit_question:
            questions.append(explicit_question)
    return questions


def _signal_update_has_only_bounded_context_evidence(update: Any) -> bool:
    evidence = None
    if isinstance(update, Mapping):
        evidence = update.get("evidence")
    else:
        evidence = getattr(update, "evidence", None)
    if not evidence:
        return False
    if not isinstance(evidence, Sequence) or isinstance(evidence, str):
        return False
    bounded_sources = {
        "pending_interaction_answer",
        "goal_workbench",
        "turn_controller_matching_context",
    }
    for item in evidence:
        source = item.get("source") if isinstance(item, Mapping) else getattr(item, "source", None)
        if source not in bounded_sources:
            return False
    return True


def _has_extracted_signal_content(value: Any | None) -> bool:
    if value is None:
        return False
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    if not isinstance(value, Mapping):
        return bool(value)
    ignored_defaults = {
        "supported_use_case": True,
        "clarity_level": "low",
        "consent_signal": "unsure",
        "explicit_expert_request": False,
    }
    for key, item in value.items():
        if key in ignored_defaults and item == ignored_defaults[key]:
            continue
        if item not in (None, "", [], {}, False):
            return True
    return False


def _recommendation_block_types(response_blocks: Sequence[Mapping[str, Any]]) -> list[str]:
    return [
        str(block.get("type"))
        for block in response_blocks
        if block.get("type") in {"expert_cards", "resource_cards"}
    ]


def _selected_expert_ids(selected_candidates: Sequence[Any]) -> set[str]:
    ids: set[str] = set()
    for candidate in selected_candidates:
        value = _candidate_field(candidate, "mentorProfileId")
        if value:
            ids.add(value)
    return ids


def _selected_resource_ids(selected_candidates: Sequence[Any]) -> set[str]:
    ids: set[str] = set()
    for candidate in selected_candidates:
        value = _candidate_field(candidate, "resourceId") or _candidate_field(candidate, "id")
        if value:
            ids.add(value)
    return ids


def _candidate_field(candidate: Any, field_name: str) -> str | None:
    if isinstance(candidate, Mapping):
        if field_name in candidate:
            return _non_empty_string(candidate.get(field_name))
        nested = candidate.get("candidate")
        if isinstance(nested, Mapping):
            return _non_empty_string(nested.get(field_name))

    nested_candidate = getattr(candidate, "candidate", None)
    if nested_candidate is not None:
        return _non_empty_string(getattr(nested_candidate, field_name, None))

    return _non_empty_string(getattr(candidate, field_name, None))


def _block_has_renderable_content(block: Mapping[str, Any]) -> bool:
    if block.get("type") == "sign_in_cta":
        return True

    for key in ("content", "question", "suggestedReply"):
        if _non_empty_string(block.get(key)):
            return True

    if _title_is_visible(block) and _non_empty_string(block.get("title")):
        return True

    for key in ("items", "experts", "resources"):
        value = block.get(key)
        if isinstance(value, Sequence) and not isinstance(value, str) and len(value) > 0:
            return True
    return False


def _title_is_visible(block: Mapping[str, Any]) -> bool:
    block_type = block.get("type")
    return block_type not in {"expert_cards", "resource_cards"}


def _platform_decision_keys(
    platform_decisions: Mapping[str, Any] | Sequence[str] | None,
) -> set[str]:
    if platform_decisions is None:
        return set()
    if isinstance(platform_decisions, Mapping):
        return {
            str(key)
            for key, value in platform_decisions.items()
            if key in PLATFORM_OWNED_DECISION_KEYS and value not in (None, False)
        }
    return {
        str(item)
        for item in platform_decisions
        if str(item) in PLATFORM_OWNED_DECISION_KEYS
    }


def _platform_owned_keys_in_value(value: Any) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, Mapping):
        for key, item in value.items():
            if str(key) in PLATFORM_OWNED_DECISION_KEYS and item not in (None, False):
                keys.add(str(key))
            keys.update(_platform_owned_keys_in_value(item))
    elif isinstance(value, Sequence) and not isinstance(value, str):
        for item in value:
            keys.update(_platform_owned_keys_in_value(item))
    return keys


def _safe_jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, Mapping):
        return {str(key): _safe_jsonable(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str):
        return [_safe_jsonable(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _safe_jsonable_list(values: Sequence[Any]) -> list[Any]:
    return [_safe_jsonable(value) for value in values]


def _non_empty_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _is_repairable(name: QualityGateName) -> bool:
    return name in {
        "schema_valid",
        "no_stale_soft_response",
        "no_duplicate_response_after_new_details",
        "question_allowed",
        "response_non_empty",
    }
