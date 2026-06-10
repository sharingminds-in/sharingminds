from __future__ import annotations

import json
import re
from copy import deepcopy
from collections.abc import Mapping
from typing import Any, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from app.core.config import Settings, get_settings
from app.core.errors import (
    LlmValidationError,
    ProviderRequestError,
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


class OpenAICompatibleStructuredProvider(LlmProvider):
    provider_name = "openai-compatible"
    base_url = ""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        model: str,
        api_key: str,
        client: Any | None = None,
        default_headers: dict[str, str] | None = None,
        default_query: dict[str, str] | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._model = model
        self._api_key = api_key
        self._client = client or AsyncOpenAI(
            api_key=api_key,
            base_url=self.base_url,
            timeout=self._settings.llm_request_timeout_seconds,
            max_retries=0,
            default_headers=default_headers,
            default_query=default_query,
        )

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
            raise ProviderUnavailableError(f"{self.provider_name} API key is required")
        self._ensure_model_supports_structured_output()

        started_at = timed()
        try:
            completion = await self._client.chat.completions.create(
                **self._completion_payload(
                    system_prompt=system_prompt,
                    user_payload=user_payload,
                    response_model=response_model,
                )
            )
        except Exception as exc:
            self._raise_provider_error(exc)

        content = _completion_content(completion)
        try:
            parsed = response_model.model_validate_json(content)
        except ValidationError as exc:
            raise LlmValidationError(
                f"{self.provider_name} response failed {response_model.__name__} validation"
            ) from exc

        usage = self._normalized_usage(completion)
        actual_model = _get_value(completion, "model") or self._model
        metadata = self._metadata_from_completion(completion)
        return LlmCallResult(
            parsed=parsed,
            provider=self.provider_name,
            model=str(actual_model),
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            prompt_hash=prompt_hash(system_prompt),
            schema_name=response_model.__name__,
            latency_ms=elapsed_ms(started_at),
            usage=usage,
            response_id=_get_value(completion, "id"),
            finish_reason=_finish_reason(completion),
            retry_count=0,
            tool_calls=[],
            metadata=metadata,
        )

    def _completion_payload(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type[BaseModel],
    ) -> dict[str, Any]:
        return {
            "model": self._model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
            ],
            "response_format": _json_schema_response_format(
                response_model,
                strict=self._settings.llm_strict_structured_output,
            ),
        }

    def _ensure_model_supports_structured_output(self) -> None:
        return None

    def _metadata_from_completion(self, completion: Any) -> dict[str, Any]:
        return {
            "actualModel": _get_value(completion, "model") or self._model,
            "actualProvider": self.provider_name,
        }

    def _normalized_usage(self, completion: Any) -> dict[str, Any]:
        usage = _get_value(completion, "usage") or {}
        if hasattr(usage, "model_dump"):
            usage = usage.model_dump()
        if not isinstance(usage, dict):
            return {}
        normalized = dict(usage)
        if "total_tokens" not in normalized:
            prompt_tokens = normalized.get("prompt_tokens") or normalized.get("input_tokens")
            completion_tokens = (
                normalized.get("completion_tokens") or normalized.get("output_tokens")
            )
            if isinstance(prompt_tokens, int) and isinstance(completion_tokens, int):
                normalized["total_tokens"] = prompt_tokens + completion_tokens
        return normalized

    def _raise_provider_error(self, exc: Exception) -> None:
        status_code = getattr(exc, "status_code", None)
        if status_code == 429:
            raise ProviderRateLimitError(f"{self.provider_name} request was rate limited") from exc
        detail = _provider_error_detail(exc)
        status_part = f" with status {status_code}" if status_code else ""
        if status_code in {400, 401, 403, 404}:
            raise ProviderRequestError(
                f"{self.provider_name} request failed{status_part}: {detail}"
            ) from exc
        raise ProviderUnavailableError(
            f"{self.provider_name} request failed{status_part}: {detail}"
        ) from exc


def _json_schema_response_format(
    response_model: type[BaseModel],
    *,
    strict: bool,
) -> dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": _schema_name(response_model.__name__),
            "strict": strict,
            "schema": _strict_json_schema(response_model.model_json_schema()),
        },
    }


def _schema_name(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_]+", "_", value).strip("_").lower()
    return normalized or "structured_response"


def _strict_json_schema(schema: dict[str, Any]) -> dict[str, Any]:
    return _normalize_schema(_prune_optional_open_objects(deepcopy(schema)))


def _prune_optional_open_objects(value: Any) -> Any:
    if isinstance(value, list):
        for item in value:
            _prune_optional_open_objects(item)
        return value
    if not isinstance(value, dict):
        return value

    properties = value.get("properties")
    if isinstance(properties, dict):
        original_required = set(value.get("required") or [])
        for key, item in list(properties.items()):
            if key not in original_required and _is_open_object_schema(item):
                del properties[key]
                continue
            _prune_optional_open_objects(item)
        if isinstance(value.get("required"), list):
            value["required"] = [key for key in value["required"] if key in properties]

    for key, item in list(value.items()):
        if key == "properties":
            continue
        _prune_optional_open_objects(item)
    return value


def _is_open_object_schema(value: Any) -> bool:
    if not isinstance(value, Mapping):
        return False
    return (
        value.get("type") == "object"
        and not isinstance(value.get("properties"), dict)
        and bool(value.get("additionalProperties", False))
    )


def _normalize_schema(value: Any) -> Any:
    if isinstance(value, list):
        return [_normalize_schema(item) for item in value]
    if not isinstance(value, Mapping):
        return value

    normalized: dict[str, Any] = {}
    for key, item in value.items():
        if key == "default":
            continue
        normalized[str(key)] = _normalize_schema(item)

    properties = normalized.get("properties")
    if (
        normalized.get("type") == "object"
        or isinstance(properties, dict)
        or "additionalProperties" in normalized
    ):
        normalized["additionalProperties"] = False
    if isinstance(properties, dict):
        normalized["required"] = list(properties.keys())

    return normalized


def _completion_content(completion: Any) -> str:
    choices = _get_value(completion, "choices") or []
    if not choices:
        raise LlmValidationError("Structured provider returned no choices")
    message = _get_value(choices[0], "message") or {}
    content = _get_value(message, "content")
    if not isinstance(content, str) or not content.strip():
        raise LlmValidationError("Structured provider returned empty content")
    return content


def _finish_reason(completion: Any) -> str | None:
    choices = _get_value(completion, "choices") or []
    if not choices:
        return None
    value = _get_value(choices[0], "finish_reason")
    return str(value) if value is not None else None


def _get_value(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def _provider_error_detail(exc: Exception) -> str:
    body = getattr(exc, "body", None)
    if body:
        return _safe_error_text(body)
    response = getattr(exc, "response", None)
    if response is not None:
        try:
            return _safe_error_text(response.json())
        except Exception:
            text = getattr(response, "text", "")
            if text:
                return _safe_error_text(text)
    message = getattr(exc, "message", None) or str(exc)
    return _safe_error_text(message or type(exc).__name__)


def _safe_error_text(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=True)
    text = re.sub(
        r"(?i)(api[_-]?key|authorization|bearer)\s*[:=]\s*['\"]?[^,'\"}\s]+",
        r"\1=<redacted>",
        text,
    )
    return text[:1000]
