from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.core.errors import ProviderUnavailableError
from app.llm.openai_compatible_provider import OpenAICompatibleStructuredProvider


class OpenRouterProvider(OpenAICompatibleStructuredProvider):
    provider_name = "openrouter"
    base_url = "https://openrouter.ai/api/v1"

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        model: str | None = None,
        api_key: str | None = None,
        client: Any | None = None,
    ) -> None:
        resolved_settings = settings or get_settings()
        resolved_model = model or resolved_settings.model_for_task(
            provider="openrouter",
            task="composer",
        )
        resolved_api_key = (
            api_key
            if api_key is not None
            else resolved_settings.api_key_for_provider("openrouter")
        )
        super().__init__(
            settings=resolved_settings,
            model=resolved_model,
            api_key=resolved_api_key,
            client=client,
        )

    def _ensure_model_supports_structured_output(self) -> None:
        if not self._model:
            raise ProviderUnavailableError("OpenRouter requires an explicitly configured model")
        if not self._settings.openrouter_provider_order:
            raise ProviderUnavailableError(
                "OpenRouter requires INFINITY_AI_OPENROUTER_PROVIDER_ORDER"
            )

    def _completion_payload(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type[BaseModel],
    ) -> dict[str, Any]:
        payload = super()._completion_payload(
            system_prompt=system_prompt,
            user_payload=user_payload,
            response_model=response_model,
        )
        payload["extra_body"] = {
            "provider": {
                "order": self._settings.openrouter_provider_order,
                "allow_fallbacks": False,
                "require_parameters": True,
            }
        }
        return payload

    def _metadata_from_completion(self, completion: Any) -> dict[str, Any]:
        provider = getattr(completion, "provider", None)
        if isinstance(completion, dict):
            provider = completion.get("provider", provider)
        return {
            "actualModel": getattr(completion, "model", None)
            or (completion.get("model") if isinstance(completion, dict) else None)
            or self._model,
            "actualProvider": provider or "openrouter",
            "openrouterProviderOrder": self._settings.openrouter_provider_order,
            "openrouterAllowFallbacks": False,
            "openrouterRequireParameters": True,
        }
