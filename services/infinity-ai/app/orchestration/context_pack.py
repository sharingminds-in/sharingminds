from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.llm.schemas import PendingInteraction


CHARS_PER_TOKEN = 4
TURN_CONTROLLER_TOKEN_BUDGET = 3_000
TURN_RESOLUTION_TOKEN_BUDGET = 2_500
GOAL_WORKBENCH_TOKEN_BUDGET = 5_000
NO_MATCH_TOKEN_BUDGET = 3_000


class ContextBudgetError(ValueError):
    pass


class ContextPackTrace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contextPackName: str
    packedCharCount: int
    approximateTokenBudget: int
    approximateTokenCount: int
    rawContextOmitted: bool = True
    compactedTurnCount: int = 0
    memoryItemCountBefore: int = 0
    memoryItemCountAfter: int = 0
    activeGoalIncluded: bool = False


class PackedContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    payload: dict[str, Any]
    trace: ContextPackTrace


def _json_size(value: Any) -> int:
    return len(json.dumps(value, ensure_ascii=True, sort_keys=True, default=str))


def _clip_text(value: Any, *, limit: int = 700) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


def _non_empty_payload(value: dict[str, Any]) -> dict[str, Any]:
    return {
        key: item
        for key, item in value.items()
        if item not in (None, "", [], {})
    }


def _ensure_budget(*, name: str, payload: dict[str, Any], token_budget: int) -> ContextPackTrace:
    char_count = _json_size(payload)
    token_count = max(1, (char_count + CHARS_PER_TOKEN - 1) // CHARS_PER_TOKEN)
    if char_count > token_budget * CHARS_PER_TOKEN:
        raise ContextBudgetError(
            f"{name} packed context exceeded budget: {char_count} chars "
            f"for ~{token_budget} tokens"
        )
    return ContextPackTrace(
        contextPackName=name,
        packedCharCount=char_count,
        approximateTokenBudget=token_budget,
        approximateTokenCount=token_count,
    )


def _pack(
    *,
    name: str,
    payload: dict[str, Any],
    token_budget: int,
    compacted_turn_count: int,
    memory_item_count_before: int,
    memory_item_count_after: int,
    active_goal_included: bool,
) -> PackedContext:
    trace = _ensure_budget(name=name, payload=payload, token_budget=token_budget)
    trace = trace.model_copy(
        update={
            "compactedTurnCount": compacted_turn_count,
            "memoryItemCountBefore": memory_item_count_before,
            "memoryItemCountAfter": memory_item_count_after,
            "activeGoalIncluded": active_goal_included,
        }
    )
    return PackedContext(name=name, payload=payload, trace=trace)


def compact_turns(turns: list[dict[str, Any]], *, limit: int = 3) -> list[dict[str, Any]]:
    compact: list[dict[str, Any]] = []
    for turn in turns[-limit:]:
        item: dict[str, Any] = {
            "actor": turn.get("actor") or turn.get("role"),
        }
        for source_key, target_key in (
            ("inputText", "inputText"),
            ("content", "content"),
            ("message", "message"),
        ):
            if turn.get(source_key):
                item[target_key] = _clip_text(turn.get(source_key), limit=500)
                break
        response_blocks = turn.get("responseBlocks")
        if isinstance(response_blocks, list):
            visible_parts: list[str] = []
            for block in response_blocks[:2]:
                if not isinstance(block, dict):
                    continue
                for key in ("content", "question", "title", "suggestedReply"):
                    if block.get(key):
                        visible_parts.append(_clip_text(block[key], limit=220))
                        break
            if visible_parts:
                item["assistantVisibleSummary"] = " | ".join(visible_parts)
        compact.append(_non_empty_payload(item))
    return compact


def compact_memory_items(
    memory_items: list[dict[str, Any]],
    *,
    limit: int = 2,
) -> list[dict[str, Any]]:
    compact: list[dict[str, Any]] = []
    for item in memory_items[:limit]:
        compact.append(
            _non_empty_payload(
                {
                    "memoryType": item.get("memoryType") or item.get("memory_type"),
                    "content": _clip_text(item.get("content"), limit=420),
                    "confidence": item.get("confidence"),
                }
            )
        )
    return compact


def compact_active_goal(active_goal: Any, *, include_collected_values: bool = True) -> dict[str, Any] | None:
    if not isinstance(active_goal, dict):
        return None
    allowed = {
        "active_goal_key",
        "goal_type",
        "goal_summary",
        "expected_next_step",
        "next_action",
        "missing_fields",
        "plan_version",
    }
    compact = {
        key: active_goal.get(key)
        for key in allowed
        if active_goal.get(key) not in (None, "", [], {})
    }
    collected_fields = active_goal.get("collected_fields")
    if isinstance(collected_fields, dict):
        allowed_collected_fields = {
            "budget",
            "study_level",
            "subject_field",
            "geography",
            "timeline",
            "constraints",
            "feasibility_flags",
        }
        if include_collected_values:
            compact["collected_fields"] = {
                key: _clip_nested_value(value)
                for key, value in collected_fields.items()
                if key in allowed_collected_fields and value not in (None, "", [], {})
            }
        else:
            compact["collected_field_names"] = sorted(
                key
                for key, value in collected_fields.items()
                if key in allowed_collected_fields and value not in (None, "", [], {})
            )[:12]
    return compact or None


def _clip_nested_value(value: Any) -> Any:
    if isinstance(value, str):
        return _clip_text(value, limit=420)
    if isinstance(value, list):
        return [_clip_nested_value(item) for item in value[:8]]
    if isinstance(value, dict):
        return {
            str(key): _clip_nested_value(item)
            for key, item in value.items()
            if item not in (None, "", [], {})
        }
    return value


def compact_signal_snapshot(
    signal_snapshot: dict[str, Any],
    *,
    include_active_goal: bool = True,
    goal_focused: bool = False,
) -> dict[str, Any]:
    allowed = {
        "primary_intent",
        "intents",
        "outcomes",
        "stage",
        "geography",
        "industries",
        "constraints",
        "canonical_domains",
        "expertise_keywords",
        "expert_selection_mode",
        "resource_focus",
        "mentor_category",
    }
    if goal_focused:
        allowed.update(
            {
                "budget",
                "budget_confirmed_literal",
                "study_level",
                "subject_field",
                "timeline",
                "feasibility_flags",
            }
        )
    compact = {
        key: signal_snapshot.get(key)
        for key in allowed
        if signal_snapshot.get(key) not in (None, "", [], {})
    }
    if include_active_goal:
        active_goal = compact_active_goal(
            signal_snapshot.get("active_goal"),
            include_collected_values=goal_focused,
        )
        if active_goal:
            compact["active_goal"] = active_goal
    return compact


def compact_pending_interaction(pending_interaction: PendingInteraction) -> dict[str, Any]:
    expected_answer_schema = pending_interaction.expected_answer_schema or {}
    allowed_slot_patch_fields = expected_answer_schema.get("allowed_slot_patch_fields")
    if not isinstance(allowed_slot_patch_fields, list):
        allowed_slot_patch_fields = pending_interaction.slot_targets
    return _non_empty_payload(
        {
            "pending_interaction_id": pending_interaction.pending_interaction_id,
            "target_flow": pending_interaction.target_flow,
            "question_type": pending_interaction.question_type,
            "original_question_text": _clip_text(
                pending_interaction.original_question_text,
                limit=500,
            ),
            "slot_targets": pending_interaction.slot_targets[:10],
            "allowed_slot_patch_fields": [str(item) for item in allowed_slot_patch_fields[:18]],
        }
    )


def compact_policy_card(policy: dict[str, Any], actor: dict[str, Any] | None = None) -> dict[str, Any]:
    actor = actor or {}
    return {
        "authenticated": bool(actor.get("authenticated")),
        "canBookSessions": bool(policy.get("canBookSessions")),
        "canRecommendExperts": bool(
            policy.get("canRecommendExperts", policy.get("canBookSessions"))
        ),
        "canRecommendResources": bool(policy.get("canRecommendResources", True)),
        "requiresAuthForBooking": bool(policy.get("requiresAuthForBooking", True)),
        "resourceVisibility": policy.get("resourceVisibility"),
    }


def pack_turn_controller_context(
    *,
    user_message: str,
    phase: str,
    turns: list[dict[str, Any]],
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    actor: dict[str, Any],
    platform_policy: dict[str, Any],
    context_profile: Any,
    allowed_conversation_acts: list[str],
    allowed_active_flows: list[str],
) -> PackedContext:
    recent_turns = compact_turns(turns, limit=3)
    compact_memory = compact_memory_items(memory_items, limit=2)
    compact_signal = compact_signal_snapshot(signal_snapshot, include_active_goal=True)
    payload = {
        "user_message": user_message,
        "current_phase": phase,
        "recent_turns": recent_turns,
        "current_signal_snapshot": compact_signal,
        "memory_items": compact_memory,
        "memory_item_count": len(memory_items),
        "actor": {
            "authenticated": bool(actor.get("authenticated")),
            "surface": actor.get("surface"),
        },
        "policy_card": compact_policy_card(platform_policy, actor),
        "context_profile": context_profile.model_dump(mode="json")
        if hasattr(context_profile, "model_dump")
        else context_profile,
        "allowed_conversation_acts": allowed_conversation_acts,
        "allowed_active_flows": allowed_active_flows,
    }
    return _pack(
        name="turn_controller",
        payload=payload,
        token_budget=TURN_CONTROLLER_TOKEN_BUDGET,
        compacted_turn_count=len(recent_turns),
        memory_item_count_before=len(memory_items),
        memory_item_count_after=len(compact_memory),
        active_goal_included=bool(compact_signal.get("active_goal")),
    )


def pack_turn_resolution_context(
    *,
    user_message: str,
    pending_interaction: PendingInteraction,
    turns: list[dict[str, Any]],
    signal_snapshot: dict[str, Any],
    memory_item_count: int,
    actor: dict[str, Any],
    platform_policy: dict[str, Any],
    allowed_resolution_types: list[str],
) -> PackedContext:
    last_turns = compact_turns(turns, limit=2)
    active_goal = compact_active_goal(
        signal_snapshot.get("active_goal"),
        include_collected_values=True,
    )
    payload = {
        "user_message": user_message,
        "pending_question": compact_pending_interaction(pending_interaction),
        "active_goal_card": active_goal,
        "last_turns": last_turns,
        "policy_card": compact_policy_card(platform_policy, actor),
        "memory_item_count": memory_item_count,
        "allowed_resolution_types": allowed_resolution_types,
    }
    return _pack(
        name="turn_resolution",
        payload=payload,
        token_budget=TURN_RESOLUTION_TOKEN_BUDGET,
        compacted_turn_count=len(last_turns),
        memory_item_count_before=memory_item_count,
        memory_item_count_after=0,
        active_goal_included=bool(active_goal),
    )


def pack_goal_workbench_context(
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> PackedContext:
    recent_turns = compact_turns(turns, limit=4)
    compact_memory = compact_memory_items(memory_items, limit=3)
    compact_signal = compact_signal_snapshot(
        signal_snapshot,
        include_active_goal=True,
        goal_focused=True,
    )
    payload = {
        "user_message": user_message,
        "current_turn_contract": _current_turn_contract(
            user_message=user_message,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
        ),
        "signal_snapshot": compact_signal,
        "active_goal": compact_signal.get("active_goal"),
        "memory_items": compact_memory,
        "memory_item_count": len(memory_items),
        "current_phase": phase,
        "recent_turns": recent_turns,
        "prior_turn_count": len(turns),
        "conversation_act": conversation_act,
        "active_flow": active_flow,
        "turn_policy": turn_policy,
    }
    return _pack(
        name="goal_workbench",
        payload=payload,
        token_budget=GOAL_WORKBENCH_TOKEN_BUDGET,
        compacted_turn_count=len(recent_turns),
        memory_item_count_before=len(memory_items),
        memory_item_count_after=len(compact_memory),
        active_goal_included=bool(compact_signal.get("active_goal")),
    )


def pack_no_match_context(
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
    candidate_count: int,
    selected_count: int,
    selection_diagnosis: dict[str, Any] | None,
) -> PackedContext:
    recent_turns = compact_turns(turns, limit=2)
    compact_signal = compact_signal_snapshot(
        signal_snapshot,
        include_active_goal=True,
        goal_focused=True,
    )
    payload = {
        "user_message": user_message,
        "current_turn_contract": _current_turn_contract(
            user_message=user_message,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
        ),
        "signal_snapshot": compact_signal,
        "memory_item_count": len(memory_items),
        "current_phase": phase,
        "recent_turns": recent_turns,
        "prior_turn_count": len(turns),
        "conversation_act": conversation_act,
        "active_flow": active_flow,
        "turn_policy": turn_policy,
        "expert_no_match_context": {
            "candidate_count": candidate_count,
            "selected_count": selected_count,
            "selection_diagnosis": selection_diagnosis or {},
        },
    }
    return _pack(
        name="expert_no_match",
        payload=payload,
        token_budget=NO_MATCH_TOKEN_BUDGET,
        compacted_turn_count=len(recent_turns),
        memory_item_count_before=len(memory_items),
        memory_item_count_after=0,
        active_goal_included=bool(compact_signal.get("active_goal")),
    )


def _current_turn_contract(
    *,
    user_message: str,
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> dict[str, Any]:
    return {
        "user_message": user_message,
        "conversation_act": conversation_act,
        "active_flow": active_flow,
        "response_mode": turn_policy.get("response_mode"),
        "questions_allowed": bool(turn_policy.get("allow_question", True)),
        "tools_allowed": bool(turn_policy.get("allow_tools", False)),
        "recommendations_allowed": bool(turn_policy.get("allow_recommendations", False)),
        "memory_updates_allowed": bool(turn_policy.get("allow_memory_updates", True)),
        "history_role": "recent_turns are reference context only; answer the current user_message",
    }
