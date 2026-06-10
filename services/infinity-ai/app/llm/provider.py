from abc import ABC, abstractmethod
from dataclasses import dataclass
from hashlib import sha256
from time import perf_counter
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import ProviderUnavailableError
from app.core.logging import get_logger

T = TypeVar("T", bound=BaseModel)

logger = get_logger(__name__)


@dataclass
class LlmCallResult(Generic[T]):
    parsed: T
    provider: str
    model: str
    prompt_id: str
    prompt_version: str
    prompt_hash: str
    schema_name: str
    latency_ms: int
    usage: dict[str, Any]
    response_id: str | None = None
    finish_reason: str | None = None
    retry_count: int = 0
    tool_calls: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


class LlmProvider(ABC):
    provider_name: str

    @abstractmethod
    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type[T],
        prompt_id: str,
        prompt_version: str = "v1",
    ) -> LlmCallResult[T]:
        raise NotImplementedError


def require_llm_available(provider_name: str | None = None) -> None:
    settings = get_settings()
    configured = (
        bool(settings.api_key_for_provider(provider_name))
        if provider_name
        else bool(settings.llm_api_key)
    )
    if settings.require_llm and not configured:
        raise ProviderUnavailableError(
            "A configured LLM API key is required when INFINITY_AI_REQUIRE_LLM=true"
        )


def timed() -> float:
    return perf_counter()


def elapsed_ms(started_at: float) -> int:
    return int((perf_counter() - started_at) * 1000)


def prompt_hash(system_prompt: str) -> str:
    return sha256(system_prompt.encode("utf-8")).hexdigest()
