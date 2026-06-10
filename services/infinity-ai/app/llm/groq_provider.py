from __future__ import annotations

from typing import Any

from app.core.config import Settings, get_settings
from app.core.errors import ProviderUnavailableError
from app.llm.openai_compatible_provider import OpenAICompatibleStructuredProvider

GROQ_STRICT_STRUCTURED_OUTPUT_MODELS = {
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
}


class GroqProvider(OpenAICompatibleStructuredProvider):
    provider_name = "groq"
    base_url = "https://api.groq.com/openai/v1"

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
            provider="groq",
            task="composer",
        )
        resolved_api_key = (
            api_key if api_key is not None else resolved_settings.api_key_for_provider("groq")
        )
        super().__init__(
            settings=resolved_settings,
            model=resolved_model,
            api_key=resolved_api_key,
            client=client,
        )

    def _ensure_model_supports_structured_output(self) -> None:
        if not self._settings.llm_strict_structured_output:
            return
        if self._model in GROQ_STRICT_STRUCTURED_OUTPUT_MODELS:
            return
        raise ProviderUnavailableError(
            f"Groq model {self._model} is not approved for strict structured output"
        )
