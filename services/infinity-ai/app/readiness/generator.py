from app.llm.prompts import PROMPTS, build_expert_response_prompt
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import RecommendationBundle


async def generate_recommendation_bundle(
    provider: LlmProvider,
    *,
    signal_snapshot: dict,
    selected_candidates: list[dict],
    conversation_phase: str,
) -> LlmCallResult[RecommendationBundle]:
    payload = {
        "signal_snapshot": signal_snapshot,
        "selected_candidates": selected_candidates,
        "conversation_phase": conversation_phase,
    }
    return await provider.generate_structured(
        system_prompt=build_expert_response_prompt(),
        user_payload=payload,
        response_model=RecommendationBundle,
        prompt_id=PROMPTS["expert_elevation_composer"].prompt_id,
        prompt_version=PROMPTS["expert_elevation_composer"].version,
    )
