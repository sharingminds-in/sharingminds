import json
from typing import Any, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.core.config import Settings, get_settings
from app.core.errors import (
    LlmValidationError,
    ProviderRateLimitError,
    ProviderUnavailableError,
)
from app.llm.provider import (
    LlmCallResult,
    LlmProvider,
    elapsed_ms,
    prompt_hash,
    timed,
)

T = TypeVar("T", bound=BaseModel)


class GeminiProvider(LlmProvider):
    provider_name = "gemini"

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        model: str | None = None,
        api_key: str | None = None,
        client: Any | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._api_key = api_key if api_key is not None else self._settings.api_key_for_provider("gemini")
        self._client = client or genai.Client(api_key=self._api_key)
        self._model = model or self._settings.model_for_task(provider="gemini", task="composer")

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
            raise ProviderUnavailableError("Gemini API key is required")
        started_at = timed()
        schema_json = json.dumps(response_model.model_json_schema(), ensure_ascii=True)
        try:
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=json.dumps(user_payload, ensure_ascii=True),
                config=types.GenerateContentConfig(
                    system_instruction=(
                        f"{system_prompt}\n\n"
                        "Return only valid JSON. Do not wrap it in markdown.\n"
                        f"Match this JSON schema exactly: {schema_json}"
                    ),
                    temperature=0.2,
                    response_mime_type="application/json",
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
        except Exception as exc:
            status_code = getattr(exc, "status_code", None)
            response = getattr(exc, "response", None)
            if status_code is None and response is not None:
                status_code = getattr(response, "status_code", None)
            if status_code == 429:
                raise ProviderRateLimitError("Gemini request was rate limited") from exc
            raise ProviderUnavailableError("Gemini request failed") from exc
        try:
            parsed = response_model.model_validate_json(response.text)
        except ValidationError as exc:
            raise LlmValidationError(
                f"Gemini response failed {response_model.__name__} validation"
            ) from exc
        usage = {}
        if getattr(response, "usage_metadata", None):
            usage = response.usage_metadata.model_dump()
        response_id = getattr(response, "response_id", None) or getattr(response, "id", None)
        finish_reason = None
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            finish_reason_value = getattr(candidates[0], "finish_reason", None)
            finish_reason = str(finish_reason_value) if finish_reason_value is not None else None
        return LlmCallResult(
            parsed=parsed,
            provider=self.provider_name,
            model=self._model,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            prompt_hash=prompt_hash(system_prompt),
            schema_name=response_model.__name__,
            latency_ms=elapsed_ms(started_at),
            usage=usage,
            response_id=response_id,
            finish_reason=finish_reason,
            tool_calls=[],
        )
