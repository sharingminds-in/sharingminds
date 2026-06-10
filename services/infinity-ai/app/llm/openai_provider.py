import json
from typing import Any, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.core.errors import LlmValidationError, ProviderUnavailableError
from app.llm.provider import (
    LlmCallResult,
    LlmProvider,
    elapsed_ms,
    prompt_hash,
    timed,
)

T = TypeVar("T", bound=BaseModel)


class OpenAIProvider(LlmProvider):
    provider_name = "openai"

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        model: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._api_key = api_key if api_key is not None else self._settings.api_key_for_provider("openai")
        self._client = AsyncOpenAI(
            api_key=self._api_key,
            timeout=self._settings.llm_request_timeout_seconds,
            max_retries=0,
        )
        self._model = model or self._settings.model_for_task(provider="openai", task="composer")

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type[T],
        prompt_id: str,
        prompt_version: str = "v1",
    ) -> LlmCallResult[T]:
        if self._settings.require_llm and not self._api_key:
            raise ProviderUnavailableError("OpenAI API key is required")
        started_at = timed()
        try:
            completion = await self._client.chat.completions.parse(
                model=self._model,
                temperature=0.2,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
                ],
                response_format=response_model,
            )
        except Exception as exc:
            raise ProviderUnavailableError("OpenAI request failed") from exc
        message = completion.choices[0].message
        if message.parsed is None:
            raise LlmValidationError("OpenAI structured response did not parse")
        usage = completion.usage.model_dump() if completion.usage else {}
        return LlmCallResult(
            parsed=message.parsed,
            provider=self.provider_name,
            model=self._model,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            prompt_hash=prompt_hash(system_prompt),
            schema_name=response_model.__name__,
            latency_ms=elapsed_ms(started_at),
            usage=usage,
            response_id=completion.id,
            finish_reason=completion.choices[0].finish_reason,
            tool_calls=[],
        )
