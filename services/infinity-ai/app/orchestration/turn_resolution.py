from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.llm.prompts import PROMPTS, build_turn_resolution_prompt
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import PendingInteraction, TurnResolutionDecision
from app.orchestration.context_pack import pack_turn_resolution_context


async def resolve_pending_turn(
    provider: LlmProvider,
    *,
    user_message: str,
    pending_interaction: PendingInteraction,
    turns: list[dict[str, Any]],
    signal_snapshot: dict[str, Any],
    actor: dict[str, Any],
    platform_policy: dict[str, Any],
    memory_item_count: int = 0,
) -> LlmCallResult[TurnResolutionDecision]:
    allowed_resolution_types = [
        "answer_to_pending_question",
        "new_user_intent",
        "interrupt",
        "correction",
        "unsupported",
    ]
    context_pack = pack_turn_resolution_context(
        user_message=user_message,
        pending_interaction=pending_interaction,
        turns=turns,
        signal_snapshot=signal_snapshot,
        memory_item_count=memory_item_count,
        actor=actor,
        platform_policy=platform_policy,
        allowed_resolution_types=allowed_resolution_types,
    )
    result = await provider.generate_structured(
        system_prompt=build_turn_resolution_prompt(),
        user_payload=context_pack.payload,
        response_model=TurnResolutionDecision,
        prompt_id=PROMPTS["turn_resolution"].prompt_id,
        prompt_version=PROMPTS["turn_resolution"].version,
    )
    return replace(
        result,
        metadata={**(result.metadata or {}), "contextPack": context_pack.trace.model_dump(mode="json")},
    )
