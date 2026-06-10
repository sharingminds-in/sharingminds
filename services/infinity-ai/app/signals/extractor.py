from app.llm.prompts import build_signal_extraction_prompt
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import ExtractedSignals


async def extract_signals(
    provider: LlmProvider,
    *,
    user_message: str,
    history: list[dict],
    memory_items: list[dict],
    signal_snapshot: dict,
) -> LlmCallResult[ExtractedSignals]:
    payload = {
        "user_message": user_message,
        "history": history[-6:],
        "memory_items": memory_items[:6],
        "current_signal_snapshot": signal_snapshot,
    }
    return await provider.generate_structured(
        system_prompt=build_signal_extraction_prompt(),
        user_payload=payload,
        response_model=ExtractedSignals,
        prompt_id="signal_extraction",
        prompt_version="v1",
    )
