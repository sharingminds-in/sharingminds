from __future__ import annotations

import json
from typing import Any
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import Settings, get_settings
from app.core.errors import (
    LlmValidationError,
    ProviderRequestError,
    ProviderRateLimitError,
    ProviderUnavailableError,
)
from app.llm.openai_compatible_provider import (
    _safe_error_text,
    _schema_name,
    _strict_json_schema,
)
from app.llm.openai_compatible_provider import OpenAICompatibleStructuredProvider
from app.llm.provider import LlmCallResult, elapsed_ms, prompt_hash, timed

T = TypeVar("T", bound=BaseModel)


class AzureFoundryProvider(OpenAICompatibleStructuredProvider):
    provider_name = "azure"

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        model: str | None = None,
        api_key: str | None = None,
        client: Any | None = None,
        responses_client: Any | None = None,
    ) -> None:
        resolved_settings = settings or get_settings()
        self._endpoint = _normalize_azure_base_url(resolved_settings.azure_endpoint)
        self._responses_client = responses_client
        resolved_model = model or resolved_settings.model_for_task(
            provider="azure",
            task="composer",
        )
        resolved_api_key = (
            api_key if api_key is not None else resolved_settings.api_key_for_provider("azure")
        )
        super().__init__(
            settings=resolved_settings,
            model=resolved_model,
            api_key=resolved_api_key,
            client=client,
            default_headers={"api-key": resolved_api_key} if resolved_api_key else None,
            default_query=(
                {"api-version": resolved_settings.azure_api_version}
                if _endpoint_mode(self._endpoint) == "foundry_models"
                else None
            ),
        )

    @property
    def base_url(self) -> str:
        return self._endpoint or "http://127.0.0.1"

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type[T],
        prompt_id: str,
        prompt_version: str = "v1",
    ) -> LlmCallResult[T]:
        if _endpoint_mode(self._endpoint) == "responses_api":
            return await self._generate_responses_structured(
                system_prompt=system_prompt,
                user_payload=user_payload,
                response_model=response_model,
                prompt_id=prompt_id,
                prompt_version=prompt_version,
            )
        return await super().generate_structured(
            system_prompt=system_prompt,
            user_payload=user_payload,
            response_model=response_model,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
        )

    def _ensure_model_supports_structured_output(self) -> None:
        if not self._endpoint:
            raise ProviderUnavailableError(
                "Azure AI Foundry requires INFINITY_AI_AZURE_ENDPOINT"
            )
        if not self._model:
            raise ProviderUnavailableError(
                "Azure AI Foundry requires INFINITY_AI_AZURE_MODEL or task-specific model env"
            )
        return None

    def _metadata_from_completion(self, completion: Any) -> dict[str, Any]:
        metadata = super()._metadata_from_completion(completion)
        metadata["azureEndpointConfigured"] = bool(self._endpoint)
        metadata["azureEndpointMode"] = _endpoint_mode(self._endpoint)
        if _endpoint_mode(self._endpoint) == "foundry_models":
            metadata["azureApiVersion"] = self._settings.azure_api_version
        return metadata

    async def _generate_responses_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type[T],
        prompt_id: str,
        prompt_version: str,
    ) -> LlmCallResult[T]:
        if self._settings.require_llm and not self._api_key:
            raise ProviderUnavailableError("Azure AI Foundry API key is required")
        self._ensure_model_supports_structured_output()

        payload = {
            "model": self._model,
            "input": [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": system_prompt}],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": json.dumps(user_payload, ensure_ascii=True),
                        }
                    ],
                },
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": _schema_name(response_model.__name__),
                    "strict": self._settings.llm_strict_structured_output,
                    "schema": _strict_json_schema(response_model.model_json_schema()),
                }
            },
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        started_at = timed()
        response_json = await self._post_responses_payload(payload=payload, headers=headers)
        content = _responses_content(response_json)
        try:
            parsed = response_model.model_validate_json(content)
        except ValidationError as exc:
            raise LlmValidationError(
                f"azure response failed {response_model.__name__} validation"
            ) from exc

        return LlmCallResult(
            parsed=parsed,
            provider=self.provider_name,
            model=str(response_json.get("model") or self._model),
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            prompt_hash=prompt_hash(system_prompt),
            schema_name=response_model.__name__,
            latency_ms=elapsed_ms(started_at),
            usage=_responses_usage(response_json),
            response_id=response_json.get("id"),
            finish_reason=_responses_finish_reason(response_json),
            retry_count=0,
            tool_calls=[],
            metadata={
                "actualModel": response_json.get("model") or self._model,
                "actualProvider": self.provider_name,
                "azureEndpointConfigured": True,
                "azureEndpointMode": "responses_api",
            },
        )

    async def _post_responses_payload(
        self,
        *,
        payload: dict[str, Any],
        headers: dict[str, str],
    ) -> dict[str, Any]:
        if self._responses_client is not None:
            response = await self._responses_client.post(
                self._endpoint,
                headers=headers,
                json=payload,
            )
        else:
            async with httpx.AsyncClient(
                timeout=self._settings.llm_request_timeout_seconds,
            ) as client:
                response = await client.post(
                    self._endpoint,
                    headers=headers,
                    json=payload,
                )
        if response.status_code == 429:
            raise ProviderRateLimitError("azure request was rate limited")
        if response.status_code >= 400:
            detail = _safe_error_text(_response_error_payload(response))
            if response.status_code in {400, 401, 403, 404}:
                raise ProviderRequestError(
                    f"azure request failed with status {response.status_code}: {detail}"
                )
            raise ProviderUnavailableError(
                f"azure request failed with status {response.status_code}: {detail}"
            )
        return response.json()


def _normalize_azure_base_url(endpoint: str) -> str:
    value = endpoint.strip().rstrip("/")
    if not value:
        return ""
    if "/openai/responses" in value:
        return value
    if value.endswith("/openai/v1") or value.endswith("/models"):
        return value
    if ".services.ai.azure.com" in value:
        return f"{value}/models"
    return f"{value}/openai/v1"


def _endpoint_mode(endpoint: str) -> str:
    if "/openai/responses" in endpoint:
        return "responses_api"
    if endpoint.endswith("/models"):
        return "foundry_models"
    if endpoint.endswith("/openai/v1"):
        return "openai_v1"
    return "custom"


def _responses_content(response_json: dict[str, Any]) -> str:
    output_text = response_json.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    output = response_json.get("output")
    if isinstance(output, list):
        parts: list[str] = []
        for item in output:
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, dict):
                    continue
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text)
        if parts:
            return "\n".join(parts)

    raise LlmValidationError("azure responses API returned no structured text")


def _responses_usage(response_json: dict[str, Any]) -> dict[str, Any]:
    usage = response_json.get("usage")
    if not isinstance(usage, dict):
        return {}
    normalized = dict(usage)
    input_tokens = normalized.get("input_tokens") or normalized.get("prompt_tokens")
    output_tokens = normalized.get("output_tokens") or normalized.get("completion_tokens")
    if "prompt_tokens" not in normalized and isinstance(input_tokens, int):
        normalized["prompt_tokens"] = input_tokens
    if "completion_tokens" not in normalized and isinstance(output_tokens, int):
        normalized["completion_tokens"] = output_tokens
    if "total_tokens" not in normalized:
        if isinstance(input_tokens, int) and isinstance(output_tokens, int):
            normalized["total_tokens"] = input_tokens + output_tokens
        elif isinstance(normalized.get("totalTokens"), int):
            normalized["total_tokens"] = normalized["totalTokens"]
    return normalized


def _responses_finish_reason(response_json: dict[str, Any]) -> str | None:
    status = response_json.get("status")
    if isinstance(status, str):
        return status
    return None


def _response_error_payload(response: Any) -> Any:
    try:
        return response.json()
    except Exception:
        return getattr(response, "text", "") or "unknown provider error"
