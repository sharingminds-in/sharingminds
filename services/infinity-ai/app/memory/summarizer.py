from app.llm.prompts import build_strategy_prompt
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import StrategyBundle


async def generate_strategy_bundle(
    provider: LlmProvider,
    *,
    user_message: str,
    signal_snapshot: dict,
    memory_items: list[dict],
    phase: str,
    turns: list[dict],
    conversation_act: str,
    active_flow: str,
    turn_policy: dict,
) -> LlmCallResult[StrategyBundle]:
    payload = {
        "user_message": user_message,
        "signal_snapshot": signal_snapshot,
        "memory_items": memory_items[:6],
        "current_phase": phase,
        "recent_turns": turns[-6:],
        "conversation_act": conversation_act,
        "active_flow": active_flow,
        "turn_policy": turn_policy,
    }
    return await provider.generate_structured(
        system_prompt=build_strategy_prompt(),
        user_payload=payload,
        response_model=StrategyBundle,
        prompt_id="strategy_bundle",
        prompt_version="v1",
    )
