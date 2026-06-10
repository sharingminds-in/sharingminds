from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

LlmProviderName = Literal["openai", "gemini", "groq", "openrouter", "azure", "router"]
LlmTaskName = Literal["planner", "composer", "extractor", "summarizer", "repair"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    service_name: str = "infinity-ai"
    log_level: str = "INFO"
    internal_secret: str = Field(default="", alias="INFINITY_AI_INTERNAL_SECRET")
    llm_provider: LlmProviderName = Field(default="gemini", alias="INFINITY_AI_LLM_PROVIDER")
    llm_provider_order_raw: str = Field(default="", alias="INFINITY_AI_LLM_PROVIDER_ORDER")
    llm_api_key: str = Field(default="", alias="INFINITY_AI_LLM_API_KEY")
    gemini_api_key: str = Field(default="", alias="INFINITY_AI_GEMINI_API_KEY")
    groq_api_key: str = Field(default="", alias="INFINITY_AI_GROQ_API_KEY")
    openrouter_api_key: str = Field(default="", alias="INFINITY_AI_OPENROUTER_API_KEY")
    openai_api_key: str = Field(default="", alias="INFINITY_AI_OPENAI_API_KEY")
    azure_api_key: str = Field(default="", alias="INFINITY_AI_AZURE_API_KEY")
    azure_endpoint: str = Field(default="", alias="INFINITY_AI_AZURE_ENDPOINT")
    azure_api_version: str = Field(default="2024-05-01-preview", alias="INFINITY_AI_AZURE_API_VERSION")
    llm_model: str | None = Field(default=None, alias="INFINITY_AI_LLM_MODEL")
    llm_planner_model: str | None = Field(default=None, alias="INFINITY_AI_LLM_PLANNER_MODEL")
    llm_composer_model: str | None = Field(default=None, alias="INFINITY_AI_LLM_COMPOSER_MODEL")
    llm_extractor_model: str | None = Field(default=None, alias="INFINITY_AI_LLM_EXTRACTOR_MODEL")
    llm_summarizer_model: str | None = Field(default=None, alias="INFINITY_AI_LLM_SUMMARIZER_MODEL")
    llm_repair_model: str | None = Field(default=None, alias="INFINITY_AI_LLM_REPAIR_MODEL")
    gemini_planner_model: str | None = Field(default=None, alias="INFINITY_AI_GEMINI_PLANNER_MODEL")
    gemini_composer_model: str | None = Field(default=None, alias="INFINITY_AI_GEMINI_COMPOSER_MODEL")
    gemini_extractor_model: str | None = Field(default=None, alias="INFINITY_AI_GEMINI_EXTRACTOR_MODEL")
    gemini_summarizer_model: str | None = Field(default=None, alias="INFINITY_AI_GEMINI_SUMMARIZER_MODEL")
    gemini_repair_model: str | None = Field(default=None, alias="INFINITY_AI_GEMINI_REPAIR_MODEL")
    groq_planner_model: str | None = Field(default=None, alias="INFINITY_AI_GROQ_PLANNER_MODEL")
    groq_composer_model: str | None = Field(default=None, alias="INFINITY_AI_GROQ_COMPOSER_MODEL")
    groq_extractor_model: str | None = Field(default=None, alias="INFINITY_AI_GROQ_EXTRACTOR_MODEL")
    groq_summarizer_model: str | None = Field(default=None, alias="INFINITY_AI_GROQ_SUMMARIZER_MODEL")
    groq_repair_model: str | None = Field(default=None, alias="INFINITY_AI_GROQ_REPAIR_MODEL")
    openrouter_model: str | None = Field(default=None, alias="INFINITY_AI_OPENROUTER_MODEL")
    openrouter_planner_model: str | None = Field(default=None, alias="INFINITY_AI_OPENROUTER_PLANNER_MODEL")
    openrouter_composer_model: str | None = Field(default=None, alias="INFINITY_AI_OPENROUTER_COMPOSER_MODEL")
    openrouter_extractor_model: str | None = Field(default=None, alias="INFINITY_AI_OPENROUTER_EXTRACTOR_MODEL")
    openrouter_summarizer_model: str | None = Field(default=None, alias="INFINITY_AI_OPENROUTER_SUMMARIZER_MODEL")
    openrouter_repair_model: str | None = Field(default=None, alias="INFINITY_AI_OPENROUTER_REPAIR_MODEL")
    openai_planner_model: str | None = Field(default=None, alias="INFINITY_AI_OPENAI_PLANNER_MODEL")
    openai_composer_model: str | None = Field(default=None, alias="INFINITY_AI_OPENAI_COMPOSER_MODEL")
    openai_extractor_model: str | None = Field(default=None, alias="INFINITY_AI_OPENAI_EXTRACTOR_MODEL")
    openai_summarizer_model: str | None = Field(default=None, alias="INFINITY_AI_OPENAI_SUMMARIZER_MODEL")
    openai_repair_model: str | None = Field(default=None, alias="INFINITY_AI_OPENAI_REPAIR_MODEL")
    azure_model: str | None = Field(default=None, alias="INFINITY_AI_AZURE_MODEL")
    azure_planner_model: str | None = Field(default=None, alias="INFINITY_AI_AZURE_PLANNER_MODEL")
    azure_composer_model: str | None = Field(default=None, alias="INFINITY_AI_AZURE_COMPOSER_MODEL")
    azure_extractor_model: str | None = Field(default=None, alias="INFINITY_AI_AZURE_EXTRACTOR_MODEL")
    azure_summarizer_model: str | None = Field(default=None, alias="INFINITY_AI_AZURE_SUMMARIZER_MODEL")
    azure_repair_model: str | None = Field(default=None, alias="INFINITY_AI_AZURE_REPAIR_MODEL")
    llm_allowed_fallback_models_raw: str = Field(default="", alias="INFINITY_AI_LLM_ALLOWED_FALLBACK_MODELS")
    llm_disallowed_providers_raw: str = Field(default="", alias="INFINITY_AI_LLM_DISALLOWED_PROVIDERS")
    llm_disallowed_models_raw: str = Field(default="", alias="INFINITY_AI_LLM_DISALLOWED_MODELS")
    llm_strict_structured_output: bool = Field(default=True, alias="INFINITY_AI_LLM_STRICT_STRUCTURED_OUTPUT")
    llm_request_timeout_seconds: float = Field(default=45.0, alias="INFINITY_AI_LLM_REQUEST_TIMEOUT_SECONDS")
    llm_max_retries: int = Field(default=1, alias="INFINITY_AI_LLM_MAX_RETRIES")
    llm_rate_limit_backoff_seconds: float = Field(default=0.75, alias="INFINITY_AI_LLM_RATE_LIMIT_BACKOFF_SECONDS")
    llm_circuit_breaker_failure_threshold: int = Field(default=2, alias="INFINITY_AI_LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD")
    llm_circuit_breaker_cooldown_seconds: float = Field(default=30.0, alias="INFINITY_AI_LLM_CIRCUIT_BREAKER_COOLDOWN_SECONDS")
    openrouter_provider_order_raw: str = Field(default="", alias="INFINITY_AI_OPENROUTER_PROVIDER_ORDER")
    openrouter_allowed_providers_raw: str = Field(default="", alias="INFINITY_AI_OPENROUTER_ALLOWED_PROVIDERS")
    require_llm: bool = Field(default=True, alias="INFINITY_AI_REQUIRE_LLM")
    trace_sample_rate: float = Field(default=1.0, alias="INFINITY_AI_TRACE_SAMPLE_RATE")
    turn_controller_enabled: bool = Field(default=False, alias="INFINITY_AI_TURN_CONTROLLER_ENABLED")

    @property
    def resolved_model(self) -> str:
        if self.llm_model:
            return self.llm_model
        if self.llm_provider == "openai":
            return "gpt-4.1-mini"
        if self.llm_provider == "groq":
            return "openai/gpt-oss-20b"
        if self.llm_provider == "openrouter":
            return self.openrouter_model or ""
        if self.llm_provider == "azure":
            return self.azure_model or ""
        return "gemini-2.5-flash-lite"

    @property
    def provider_order(self) -> list[str]:
        configured = _csv(self.llm_provider_order_raw)
        if configured:
            return configured
        if self.llm_provider == "router":
            return ["gemini"]
        return [self.llm_provider]

    @property
    def disallowed_providers(self) -> set[str]:
        return set(_csv(self.llm_disallowed_providers_raw))

    @property
    def disallowed_models(self) -> set[str]:
        return set(_csv(self.llm_disallowed_models_raw))

    @property
    def allowed_fallback_models(self) -> set[str]:
        return set(_csv(self.llm_allowed_fallback_models_raw))

    def fallback_models_for_provider(self, provider: str) -> list[str]:
        provider = provider.lower()
        fallback_models: list[str] = []
        for entry in _csv(self.llm_allowed_fallback_models_raw):
            entry_provider: str | None = None
            model = entry
            if ":" in entry:
                entry_provider, model = entry.split(":", 1)
            if entry_provider and entry_provider != provider:
                continue
            if model and model not in fallback_models:
                fallback_models.append(model)
        return fallback_models

    @property
    def openrouter_provider_order(self) -> list[str]:
        return _csv(self.openrouter_provider_order_raw or self.openrouter_allowed_providers_raw)

    def api_key_for_provider(self, provider: str) -> str:
        provider_keys = {
            "gemini": self.gemini_api_key,
            "groq": self.groq_api_key,
            "openrouter": self.openrouter_api_key,
            "openai": self.openai_api_key,
            "azure": self.azure_api_key,
        }
        provider_key = provider_keys.get(provider, "")
        if provider_key:
            return provider_key
        if self.llm_provider == provider or not any(provider_keys.values()):
            return self.llm_api_key
        return ""

    def model_for_task(self, *, provider: str, task: LlmTaskName) -> str:
        provider_specific = getattr(self, f"{provider}_{task}_model", None)
        if provider_specific:
            return provider_specific

        generic_task_model = getattr(self, f"llm_{task}_model", None)
        if generic_task_model:
            return generic_task_model

        if provider == "openrouter" and self.openrouter_model:
            return self.openrouter_model
        if provider == "azure" and self.azure_model:
            return self.azure_model

        if self.llm_model:
            return self.llm_model

        if provider == "openai":
            return "gpt-4.1-mini"
        if provider == "groq":
            return "openai/gpt-oss-20b"
        if provider == "gemini":
            return "gemini-2.5-flash-lite"
        return ""

    def models_for_task(self, *, provider: str, task: LlmTaskName) -> list[str]:
        primary_model = self.model_for_task(provider=provider, task=task)
        models: list[str] = []
        if primary_model:
            models.append(primary_model)
        for fallback_model in self.fallback_models_for_provider(provider):
            if fallback_model and fallback_model not in models:
                models.append(fallback_model)
        return models


def _csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip().lower() for item in value.split(",") if item.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
