from typing import Any

from app.adapters.platform_client import PlatformClient
from app.llm.provider import LlmProvider
from app.orchestration.graph import run_graph_pipeline


async def run_pipeline(
    *,
    provider: LlmProvider,
    platform_client: PlatformClient,
    conversation_id: str,
    user_message: str,
    actor: dict[str, Any],
) -> dict[str, Any]:
    return await run_graph_pipeline(
        provider=provider,
        platform_client=platform_client,
        conversation_id=conversation_id,
        user_message=user_message,
        actor=actor,
    )
