from app.core.config import get_settings
from app.llm.provider import LlmProvider


def build_provider() -> LlmProvider:
    settings = get_settings()
    from app.llm.router import InfinityLlmRouter

    return InfinityLlmRouter(settings=settings)
