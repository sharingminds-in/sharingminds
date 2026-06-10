from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.llm.prompts import PROMPTS, build_turn_controller_prompt
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import TurnControllerDecision, TurnPolicy
from app.orchestration.context_pack import pack_turn_controller_context
from app.orchestration.state import ContextProfile


class TurnControllerPolicyError(ValueError):
    pass


async def run_turn_controller(
    provider: LlmProvider,
    *,
    user_message: str,
    phase: str,
    turns: list[dict[str, Any]],
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    actor: dict[str, Any],
    platform_policy: dict[str, Any],
    context_profile: ContextProfile,
) -> LlmCallResult[TurnControllerDecision]:
    allowed_conversation_acts = [
        "goal_help",
        "expert_request",
        "resource_request",
        "platform_help",
        "chitchat",
        "meta_question",
        "correction",
        "cancel_or_restart",
        "repeat",
        "resume_previous_flow",
        "unsupported",
        "safety",
    ]
    allowed_active_flows = [
        "goal_companion",
        "expert_matching",
        "resource_search",
        "platform_help",
        "soft_response",
        "repair",
        "safety",
    ]
    context_pack = pack_turn_controller_context(
        user_message=user_message,
        phase=phase,
        turns=turns,
        signal_snapshot=signal_snapshot,
        memory_items=memory_items,
        actor=actor,
        platform_policy=platform_policy,
        context_profile=context_profile,
        allowed_conversation_acts=allowed_conversation_acts,
        allowed_active_flows=allowed_active_flows,
    )
    result = await provider.generate_structured(
        system_prompt=build_turn_controller_prompt(),
        user_payload=context_pack.payload,
        response_model=TurnControllerDecision,
        prompt_id=PROMPTS["turn_controller"].prompt_id,
        prompt_version=PROMPTS["turn_controller"].version,
    )
    return replace(
        result,
        parsed=enforce_turn_controller_policy(
            result.parsed,
            actor=actor,
            platform_policy=platform_policy,
        ),
        metadata={**(result.metadata or {}), "contextPack": context_pack.trace.model_dump(mode="json")},
    )


def enforce_turn_controller_policy(
    decision: TurnControllerDecision,
    *,
    actor: dict[str, Any],
    platform_policy: dict[str, Any],
) -> TurnControllerDecision:
    effective_policy = _effective_turn_policy(
        decision.turn_policy,
        actor=actor,
        active_flow=decision.active_flow,
        platform_policy=platform_policy,
    )
    route_requires_tools = decision.active_flow in {"expert_matching", "resource_search"}
    route_can_use_tools = (
        route_requires_tools
        and effective_policy.allow_tools
        and effective_policy.allow_recommendations
    )
    needs_memory_update = (
        decision.needs_memory_update
        and bool(actor.get("authenticated"))
        and effective_policy.allow_memory_updates
    )
    needs_tools = (decision.needs_tools or route_can_use_tools) and effective_policy.allow_tools
    needs_recommendations = (
        (decision.needs_recommendations or route_can_use_tools)
        and effective_policy.allow_recommendations
    )
    should_continue_graph = (
        decision.should_continue_graph
        or decision.needs_signal_extraction
        or needs_tools
        or needs_recommendations
        or needs_memory_update
        or decision.active_flow in {"goal_companion", "expert_matching", "resource_search", "repair"}
    )

    if not should_continue_graph:
        if needs_tools or needs_recommendations:
            raise TurnControllerPolicyError(
                "direct Turn Controller responses cannot require tools or recommendations"
            )
        if _contains_recommendation_blocks(decision.response_blocks):
            raise TurnControllerPolicyError(
                "direct Turn Controller responses cannot include recommendation blocks"
            )
        effective_policy = effective_policy.model_copy(
            update={
                "allow_extraction": False,
                "allow_planning": False,
                "allow_tools": False,
                "allow_recommendations": False,
                "allow_memory_updates": False,
                "allow_usage_metering": False,
                "response_mode": "safety"
                if decision.active_flow == "safety"
                else "soft_response",
            }
        )

    return decision.model_copy(
        update={
            "turn_policy": effective_policy,
            "needs_tools": needs_tools,
            "needs_recommendations": needs_recommendations,
            "needs_memory_update": needs_memory_update,
            "should_continue_graph": should_continue_graph,
        }
    )


def _effective_turn_policy(
    policy: TurnPolicy,
    *,
    actor: dict[str, Any],
    active_flow: str,
    platform_policy: dict[str, Any],
) -> TurnPolicy:
    updates: dict[str, Any] = {}
    feature_flags = platform_policy.get("featureFlags")
    cross_chat_memory_enabled = (
        bool(feature_flags.get("crossChatMemoryEnabled"))
        if isinstance(feature_flags, dict)
        else False
    )
    if not actor.get("authenticated") or not cross_chat_memory_enabled:
        updates["allow_memory_updates"] = False

    if active_flow == "expert_matching":
        can_recommend_experts = bool(
            platform_policy.get("canRecommendExperts", platform_policy.get("canBookSessions"))
        )
        if can_recommend_experts:
            updates.update(
                {
                    "allow_tools": True,
                    "allow_recommendations": True,
                    "allow_usage_metering": bool(
                        actor.get("authenticated")
                        and policy.allow_usage_metering
                    ),
                }
            )
        else:
            updates.update(
                {
                    "allow_tools": False,
                    "allow_recommendations": False,
                    "allow_usage_metering": False,
                }
            )

    if active_flow == "resource_search":
        if bool(platform_policy.get("canRecommendResources", True)):
            updates.update(
                {
                    "allow_tools": True,
                    "allow_recommendations": True,
                }
            )
        else:
            updates.update(
                {
                    "allow_tools": False,
                    "allow_recommendations": False,
                    "allow_usage_metering": False,
                }
            )

    return policy.model_copy(update=updates) if updates else policy


def _contains_recommendation_blocks(blocks: list[Any]) -> bool:
    for block in blocks:
        block_type = getattr(block, "type", None)
        if block_type in {"expert_cards", "resource_cards"}:
            return True
    return False
