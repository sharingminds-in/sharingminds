from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.llm.prompts import (
    PROMPTS,
    build_blocked_expert_response_prompt,
    build_boundary_response_prompt,
    build_correction_prompt,
    build_expert_matching_planner_prompt,
    build_expert_no_match_response_prompt,
    build_goal_workbench_prompt,
    build_resource_response_prompt,
    build_response_repair_prompt,
    build_soft_response_prompt,
)
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import (
    BoundaryResponseDraft,
    BlockedExpertResponseDraft,
    ConversationStrategy,
    CorrectionResponseDraft,
    ExpertPlanningDraft,
    ExpertNoMatchDraft,
    GoalWorkbenchDraft,
    MemoryUpdateDraft,
    ResourceResponseDraft,
    ResponseRepairBundle,
    SoftResponseDraft,
    StrategyBundle,
)
from app.orchestration.context_pack import (
    compact_memory_items,
    compact_signal_snapshot,
    compact_turns,
    pack_goal_workbench_context,
    pack_no_match_context,
)


def _base_payload(
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> dict[str, Any]:
    compact_signal = compact_signal_snapshot(
        signal_snapshot,
        include_active_goal=True,
        goal_focused=True,
    )
    compact_memory = compact_memory_items(memory_items, limit=3)
    recent_turns = compact_turns(turns, limit=4)
    return {
        "user_message": user_message,
        "current_turn_contract": {
            "user_message": user_message,
            "conversation_act": conversation_act,
            "active_flow": active_flow,
            "response_mode": turn_policy.get("response_mode"),
            "questions_allowed": bool(turn_policy.get("allow_question", True)),
            "tools_allowed": bool(turn_policy.get("allow_tools", False)),
            "recommendations_allowed": bool(turn_policy.get("allow_recommendations", False)),
            "memory_updates_allowed": bool(turn_policy.get("allow_memory_updates", True)),
            "history_role": (
                "recent_turns are reference context only; answer the current user_message"
            ),
        },
        "signal_snapshot": compact_signal,
        "memory_items": compact_memory,
        "memory_item_count": len(memory_items),
        "current_phase": phase,
        "recent_turns": recent_turns,
        "prior_turn_count": len(turns),
        "conversation_act": conversation_act,
        "active_flow": active_flow,
        "turn_policy": turn_policy,
    }


def _empty_memory() -> MemoryUpdateDraft:
    return MemoryUpdateDraft(items=[])


def _strategy_from_goal_workbench_draft(draft: GoalWorkbenchDraft) -> ConversationStrategy:
    suggested_replies = [
        reply.text for reply in draft.suggested_replies if reply.kind == "meaningful_action"
    ]
    micro_consent_suggested_reply = (
        draft.micro_consent_suggested_reply.text
        if draft.micro_consent_suggested_reply
        and draft.micro_consent_suggested_reply.kind == "meaningful_action"
        else None
    )
    return ConversationStrategy(
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
    )


def _strategy_from_resource_draft(draft: ResourceResponseDraft) -> ConversationStrategy:
    return ConversationStrategy(
        phase=draft.phase,
        depth_mode=draft.depth_mode,
        reflection_text=draft.reflection_text,
        clarification_question=draft.clarification_question,
        insight_text=draft.insight_text,
        direction_text=draft.direction_text,
        transition_text=draft.transition_text,
        micro_consent_prompt=draft.micro_consent_prompt,
        micro_consent_suggested_reply=draft.micro_consent_suggested_reply,
        should_offer_framework=draft.should_offer_framework,
        should_retrieve_experts=False,
        should_generate_readiness=False,
        response_reason=draft.response_reason,
    )


def _strategy_from_expert_planning_draft(draft: ExpertPlanningDraft) -> ConversationStrategy:
    plan = draft.retrieval_plan
    return ConversationStrategy(
        phase=draft.phase,
        depth_mode=draft.depth_mode,
        clarification_question=plan.clarification_question if plan and plan.needs_clarification else None,
        should_retrieve_experts=bool(plan.should_retrieve_experts if plan else draft.should_retrieve_experts),
        should_generate_readiness=draft.should_generate_readiness,
        expert_retrieval_plan=plan,
        response_reason=draft.response_reason,
    )


def _strategy_from_correction_draft(draft: CorrectionResponseDraft) -> ConversationStrategy:
    return ConversationStrategy(
        phase=draft.phase,
        depth_mode=draft.depth_mode,
        reflection_text=draft.reflection_text,
        clarification_question=draft.clarification_question,
        insight_text=draft.insight_text,
        direction_text=draft.direction_text,
        should_retrieve_experts=False,
        should_generate_readiness=False,
        response_reason=draft.response_reason,
    )


def _strategy_from_soft_draft(draft: SoftResponseDraft) -> ConversationStrategy:
    return ConversationStrategy(
        phase=draft.phase,
        depth_mode="light",
        soft_response_text=draft.soft_response_text,
        should_retrieve_experts=False,
        should_generate_readiness=False,
        response_reason=draft.response_reason,
    )


def _strategy_from_boundary_draft(draft: BoundaryResponseDraft) -> ConversationStrategy:
    return ConversationStrategy(
        phase=draft.phase,
        depth_mode="light",
        soft_response_text=draft.soft_response_text,
        should_retrieve_experts=False,
        should_generate_readiness=False,
        response_reason=draft.response_reason,
    )


def _strategy_from_blocked_expert_draft(draft: BlockedExpertResponseDraft) -> ConversationStrategy:
    return ConversationStrategy(
        phase=draft.phase,
        depth_mode="light",
        soft_response_text=draft.user_response_text,
        should_retrieve_experts=False,
        should_generate_readiness=False,
        response_reason=draft.internal_rationale,
    )


def _strategy_from_expert_no_match_draft(draft: ExpertNoMatchDraft) -> ConversationStrategy:
    return ConversationStrategy(
        phase=draft.phase,
        depth_mode="light",
        soft_response_text=draft.user_response_text,
        should_retrieve_experts=False,
        should_generate_readiness=False,
        response_reason=draft.internal_rationale,
    )


def _strategy_bundle_result(
    result: LlmCallResult[Any],
    *,
    bundle: StrategyBundle,
    metadata: dict[str, Any] | None = None,
) -> LlmCallResult[StrategyBundle]:
    return replace(
        result,
        parsed=bundle,
        metadata={
            **(result.metadata or {}),
            **(metadata or {}),
        },
    )


async def compose_soft_response(
    provider: LlmProvider,
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> LlmCallResult[StrategyBundle]:
    result = await provider.generate_structured(
        system_prompt=build_soft_response_prompt(),
        user_payload=_base_payload(
            user_message=user_message,
            signal_snapshot=signal_snapshot,
            memory_items=memory_items,
            phase=phase,
            turns=turns,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
        ),
        response_model=SoftResponseDraft,
        prompt_id=PROMPTS["soft_response_composer"].prompt_id,
        prompt_version=PROMPTS["soft_response_composer"].version,
    )
    return _strategy_bundle_result(
        result,
        bundle=StrategyBundle(
            strategy=_strategy_from_soft_draft(result.parsed),
            memory_updates=_empty_memory(),
        ),
    )


async def compose_goal_workbench_response(
    provider: LlmProvider,
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> LlmCallResult[StrategyBundle]:
    context_pack = pack_goal_workbench_context(
        user_message=user_message,
        signal_snapshot=signal_snapshot,
        memory_items=memory_items,
        phase=phase,
        turns=turns,
        conversation_act=conversation_act,
        active_flow=active_flow,
        turn_policy=turn_policy,
    )
    result = await provider.generate_structured(
        system_prompt=build_goal_workbench_prompt(),
        user_payload=context_pack.payload,
        response_model=GoalWorkbenchDraft,
        prompt_id=PROMPTS["goal_workbench"].prompt_id,
        prompt_version=PROMPTS["goal_workbench"].version,
    )
    bundled = _strategy_bundle_result(
        result,
        bundle=StrategyBundle(
            strategy=_strategy_from_goal_workbench_draft(result.parsed),
            mini_framework=result.parsed.mini_framework,
            memory_updates=result.parsed.memory_updates,
        ),
        metadata={"goal_workbench_draft": result.parsed.model_dump(mode="json")},
    )
    return replace(
        bundled,
        metadata={
            **(bundled.metadata or {}),
            "contextPack": context_pack.trace.model_dump(mode="json"),
        },
    )


async def compose_blocked_expert_response(
    provider: LlmProvider,
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> LlmCallResult[StrategyBundle]:
    result = await provider.generate_structured(
        system_prompt=build_blocked_expert_response_prompt(),
        user_payload=_base_payload(
            user_message=user_message,
            signal_snapshot=signal_snapshot,
            memory_items=[],
            phase=phase,
            turns=turns,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
        ),
        response_model=BlockedExpertResponseDraft,
        prompt_id=PROMPTS["blocked_expert_response_composer"].prompt_id,
        prompt_version=PROMPTS["blocked_expert_response_composer"].version,
    )
    return _strategy_bundle_result(
        result,
        bundle=StrategyBundle(
            strategy=_strategy_from_blocked_expert_draft(result.parsed),
            memory_updates=_empty_memory(),
        ),
    )


async def compose_resource_response(
    provider: LlmProvider,
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> LlmCallResult[StrategyBundle]:
    result = await provider.generate_structured(
        system_prompt=build_resource_response_prompt(),
        user_payload=_base_payload(
            user_message=user_message,
            signal_snapshot=signal_snapshot,
            memory_items=memory_items,
            phase=phase,
            turns=turns,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
        ),
        response_model=ResourceResponseDraft,
        prompt_id=PROMPTS["resource_response_composer"].prompt_id,
        prompt_version=PROMPTS["resource_response_composer"].version,
    )
    return _strategy_bundle_result(
        result,
        bundle=StrategyBundle(
            strategy=_strategy_from_resource_draft(result.parsed),
            mini_framework=result.parsed.mini_framework,
            memory_updates=result.parsed.memory_updates,
        ),
    )


async def compose_expert_planning_response(
    provider: LlmProvider,
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> LlmCallResult[StrategyBundle]:
    result = await provider.generate_structured(
        system_prompt=build_expert_matching_planner_prompt(),
        user_payload=_base_payload(
            user_message=user_message,
            signal_snapshot=signal_snapshot,
            memory_items=memory_items,
            phase=phase,
            turns=turns,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
        ),
        response_model=ExpertPlanningDraft,
        prompt_id=PROMPTS["expert_matching_planner"].prompt_id,
        prompt_version=PROMPTS["expert_matching_planner"].version,
    )
    return _strategy_bundle_result(
        result,
        bundle=StrategyBundle(
            strategy=_strategy_from_expert_planning_draft(result.parsed),
            memory_updates=result.parsed.memory_updates,
        ),
    )


async def compose_expert_no_match_response(
    provider: LlmProvider,
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
    selection_diagnosis: dict[str, Any] | None = None,
) -> LlmCallResult[StrategyBundle]:
    context_pack = pack_no_match_context(
        user_message=user_message,
        signal_snapshot=signal_snapshot,
        memory_items=memory_items,
        phase=phase,
        turns=turns,
        conversation_act=conversation_act,
        active_flow=active_flow,
        turn_policy=turn_policy,
        candidate_count=candidate_count,
        selected_count=selected_count,
        selection_diagnosis=selection_diagnosis,
    )
    result = await provider.generate_structured(
        system_prompt=build_expert_no_match_response_prompt(),
        user_payload=context_pack.payload,
        response_model=ExpertNoMatchDraft,
        prompt_id=PROMPTS["expert_no_match_composer"].prompt_id,
        prompt_version=PROMPTS["expert_no_match_composer"].version,
    )
    bundled = _strategy_bundle_result(
        result,
        bundle=StrategyBundle(
            strategy=_strategy_from_expert_no_match_draft(result.parsed),
            memory_updates=_empty_memory(),
        ),
    )
    return replace(
        bundled,
        metadata={
            **(bundled.metadata or {}),
            "contextPack": context_pack.trace.model_dump(mode="json"),
        },
    )


async def compose_correction_response(
    provider: LlmProvider,
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> LlmCallResult[StrategyBundle]:
    result = await provider.generate_structured(
        system_prompt=build_correction_prompt(),
        user_payload=_base_payload(
            user_message=user_message,
            signal_snapshot=signal_snapshot,
            memory_items=memory_items,
            phase=phase,
            turns=turns,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
        ),
        response_model=CorrectionResponseDraft,
        prompt_id=PROMPTS["correction_composer"].prompt_id,
        prompt_version=PROMPTS["correction_composer"].version,
    )
    return _strategy_bundle_result(
        result,
        bundle=StrategyBundle(
            strategy=_strategy_from_correction_draft(result.parsed),
            memory_updates=result.parsed.memory_updates,
        ),
    )


async def compose_boundary_response(
    provider: LlmProvider,
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
) -> LlmCallResult[StrategyBundle]:
    result = await provider.generate_structured(
        system_prompt=build_boundary_response_prompt(),
        user_payload=_base_payload(
            user_message=user_message,
            signal_snapshot=signal_snapshot,
            memory_items=memory_items,
            phase=phase,
            turns=turns,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
        ),
        response_model=BoundaryResponseDraft,
        prompt_id=PROMPTS["boundary_composer"].prompt_id,
        prompt_version=PROMPTS["boundary_composer"].version,
    )
    return _strategy_bundle_result(
        result,
        bundle=StrategyBundle(
            strategy=_strategy_from_boundary_draft(result.parsed),
            memory_updates=_empty_memory(),
        ),
    )


async def repair_response_bundle(
    provider: LlmProvider,
    *,
    user_message: str,
    signal_snapshot: dict[str, Any],
    memory_items: list[dict[str, Any]],
    phase: str,
    turns: list[dict[str, Any]],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict[str, Any],
    response_blocks: list[dict[str, Any]],
    quality_report: dict[str, Any],
) -> LlmCallResult[StrategyBundle]:
    payload = {
        **_base_payload(
            user_message=user_message,
            signal_snapshot=signal_snapshot,
            memory_items=memory_items,
            phase=phase,
            turns=turns,
            conversation_act=conversation_act,
            active_flow=active_flow,
            turn_policy=turn_policy,
        ),
        "failed_response_blocks": response_blocks,
        "quality_report": quality_report,
        "grounded_context": {
            "active_goal": signal_snapshot.get("active_goal"),
            "budget": signal_snapshot.get("budget"),
            "study_level": signal_snapshot.get("study_level"),
            "subject_field": signal_snapshot.get("subject_field"),
            "geography": signal_snapshot.get("geography"),
            "constraints": signal_snapshot.get("constraints"),
            "feasibility_flags": signal_snapshot.get("feasibility_flags"),
        },
    }
    result = await provider.generate_structured(
        system_prompt=build_response_repair_prompt(),
        user_payload=payload,
        response_model=ResponseRepairBundle,
        prompt_id=PROMPTS["response_repair"].prompt_id,
        prompt_version=PROMPTS["response_repair"].version,
    )
    return _strategy_bundle_result(
        result,
        bundle=StrategyBundle(
            strategy=result.parsed.strategy,
            mini_framework=result.parsed.mini_framework,
            memory_updates=result.parsed.memory_updates,
        ),
    )
