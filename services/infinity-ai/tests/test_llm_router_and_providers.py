from __future__ import annotations

import asyncio
from typing import Any

import pytest
from pydantic import BaseModel, Field

from app.core.config import Settings
from app.core.errors import (
    LlmValidationError,
    ProviderRequestError,
    ProviderRateLimitError,
    ProviderUnavailableError,
)
from app.llm.azure_provider import AzureFoundryProvider
from app.llm.gemini_provider import GeminiProvider
from app.llm.groq_provider import GroqProvider
from app.llm.openrouter_provider import OpenRouterProvider
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.router import (
    InfinityLlmRouter,
    ProviderRegistration,
    default_provider_registry,
)


class SimplePayload(BaseModel):
    answer: str


class NestedPayload(BaseModel):
    label: str | None = None
    tags: list[str] = Field(default_factory=list)


class StrictSchemaPayload(BaseModel):
    answer: str
    nested: NestedPayload = Field(default_factory=NestedPayload)


class MetadataPayload(BaseModel):
    answer: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ScriptedProvider(LlmProvider):
    def __init__(
        self,
        *,
        provider_name: str,
        model: str,
        calls: list[str],
        error: Exception | None = None,
    ) -> None:
        self.provider_name = provider_name
        self._model = model
        self._calls = calls
        self._error = error

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type,
        prompt_id: str,
        prompt_version: str = "v1",
    ) -> LlmCallResult:
        self._calls.append(f"{self.provider_name}:{self._model}")
        if self._error:
            raise self._error
        return LlmCallResult(
            parsed=response_model(answer=f"{self.provider_name}:{self._model} ok"),
            provider=self.provider_name,
            model=self._model,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            prompt_hash="hash",
            schema_name=response_model.__name__,
            latency_ms=2,
            usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            response_id=f"{self.provider_name}-response",
            finish_reason="stop",
        )


async def _no_sleep(seconds: float) -> None:
    return None


def _settings(**overrides: Any) -> Settings:
    defaults = {
        "llm_provider": "gemini",
        "require_llm": True,
        "llm_provider_order_raw": "gemini,groq",
        "gemini_api_key": "gemini-key",
        "groq_api_key": "groq-key",
        "azure_api_key": "",
        "azure_endpoint": "",
        "azure_api_version": "2024-05-01-preview",
        "llm_model": None,
        "llm_planner_model": None,
        "llm_composer_model": None,
        "llm_extractor_model": None,
        "llm_summarizer_model": None,
        "llm_repair_model": None,
        "gemini_planner_model": None,
        "gemini_composer_model": None,
        "gemini_extractor_model": None,
        "gemini_summarizer_model": None,
        "gemini_repair_model": None,
        "groq_planner_model": None,
        "groq_composer_model": None,
        "groq_extractor_model": None,
        "groq_summarizer_model": None,
        "groq_repair_model": None,
        "azure_model": None,
        "azure_planner_model": None,
        "azure_composer_model": None,
        "azure_extractor_model": None,
        "azure_summarizer_model": None,
        "azure_repair_model": None,
        "llm_allowed_fallback_models_raw": "",
        "llm_max_retries": 0,
        "llm_rate_limit_backoff_seconds": 0,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _registry(
    *,
    calls: list[str],
    gemini_error: Exception | None = None,
    groq_error: Exception | None = None,
    gemini_errors_by_model: dict[str, Exception] | None = None,
    gemini_structured: bool = True,
) -> dict[str, ProviderRegistration]:
    def factory(
        provider_name: str,
        error: Exception | None,
        errors_by_model: dict[str, Exception] | None = None,
    ):
        return lambda config: ScriptedProvider(
            provider_name=provider_name,
            model=config.model,
            calls=calls,
            error=(errors_by_model or {}).get(config.model) or error,
        )

    return {
        "gemini": ProviderRegistration(
            name="gemini",
            factory=factory("gemini", gemini_error, gemini_errors_by_model),
            supports_structured_output=gemini_structured,
        ),
        "groq": ProviderRegistration(
            name="groq",
            factory=factory("groq", groq_error),
        ),
    }


def test_router_chooses_first_healthy_configured_provider():
    calls: list[str] = []
    router = InfinityLlmRouter(
        settings=_settings(),
        registry=_registry(calls=calls),
        sleep=_no_sleep,
    )

    result = asyncio.run(
        router.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert result.provider == "gemini"
    assert result.parsed.answer == "gemini:gemini-2.5-flash-lite ok"
    assert calls == ["gemini:gemini-2.5-flash-lite"]


def test_router_skips_rate_limited_provider_and_uses_next_configured_provider():
    calls: list[str] = []
    router = InfinityLlmRouter(
        settings=_settings(),
        registry=_registry(
            calls=calls,
            gemini_error=ProviderRateLimitError("limited"),
        ),
        sleep=_no_sleep,
    )

    result = asyncio.run(
        router.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert result.provider == "groq"
    assert calls == ["gemini:gemini-2.5-flash-lite", "groq:openai/gpt-oss-20b"]
    assert result.usage["_infinity_ai_router"]["priorErrors"][0]["errorType"] == "ProviderRateLimitError"


def test_router_does_not_retry_rate_limited_provider_before_next_provider():
    calls: list[str] = []
    router = InfinityLlmRouter(
        settings=_settings(llm_max_retries=2),
        registry=_registry(
            calls=calls,
            gemini_error=ProviderRateLimitError("limited"),
        ),
        sleep=_no_sleep,
    )

    result = asyncio.run(
        router.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert result.provider == "groq"
    assert calls == ["gemini:gemini-2.5-flash-lite", "groq:openai/gpt-oss-20b"]


def test_router_does_not_retry_bad_request_provider_before_next_provider():
    calls: list[str] = []
    router = InfinityLlmRouter(
        settings=_settings(llm_max_retries=2),
        registry=_registry(
            calls=calls,
            gemini_error=ProviderRequestError("schema rejected"),
        ),
        sleep=_no_sleep,
    )

    result = asyncio.run(
        router.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert result.provider == "groq"
    assert calls == ["gemini:gemini-2.5-flash-lite", "groq:openai/gpt-oss-20b"]


def test_router_fails_closed_if_structured_output_is_unavailable():
    calls: list[str] = []
    router = InfinityLlmRouter(
        settings=_settings(llm_provider_order_raw="gemini"),
        registry=_registry(calls=calls, gemini_structured=False),
        sleep=_no_sleep,
    )

    with pytest.raises(ProviderUnavailableError):
        asyncio.run(
            router.generate_structured(
                system_prompt="Return JSON.",
                user_payload={"message": "hello"},
                response_model=SimplePayload,
                prompt_id="goal_workbench",
            )
        )

    assert calls == []


def test_router_does_not_fallback_to_deterministic_or_mock_without_provider_key():
    calls: list[str] = []
    router = InfinityLlmRouter(
        settings=_settings(
            llm_provider_order_raw="gemini",
            gemini_api_key="",
            groq_api_key="",
            llm_api_key="",
        ),
        registry=_registry(calls=calls),
        sleep=_no_sleep,
    )

    with pytest.raises(ProviderUnavailableError):
        asyncio.run(
            router.generate_structured(
                system_prompt="Return JSON.",
                user_payload={"message": "hello"},
                response_model=SimplePayload,
                prompt_id="goal_workbench",
            )
        )

    assert calls == []


def test_router_normalizes_provider_metadata():
    calls: list[str] = []
    settings = _settings()
    router = InfinityLlmRouter(
        settings=settings,
        registry=_registry(calls=calls),
        sleep=_no_sleep,
    )

    result = asyncio.run(
        router.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="signal_extraction",
        )
    )

    router_usage = result.usage["_infinity_ai_router"]
    assert router_usage["task"] == "extractor"
    assert router_usage["selectedProvider"] == "gemini"
    assert router_usage["selectedModel"] == settings.model_for_task(
        provider="gemini",
        task="extractor",
    )
    assert router_usage["attemptedProviderModels"] == [
        {
            "provider": "gemini",
            "model": settings.model_for_task(provider="gemini", task="extractor"),
            "attempt": 0,
            "status": "completed",
        }
    ]
    assert router_usage["routerLatencyMs"] >= 0
    assert result.metadata is not None
    assert result.metadata["router"] == router_usage


def test_default_gemini_model_is_flash_lite():
    settings = _settings(llm_provider_order_raw="gemini")

    assert settings.resolved_model == "gemini-2.5-flash-lite"
    assert settings.model_for_task(provider="gemini", task="composer") == (
        "gemini-2.5-flash-lite"
    )


def test_router_uses_explicit_ordered_model_fallback():
    calls: list[str] = []
    router = InfinityLlmRouter(
        settings=_settings(
            llm_provider_order_raw="gemini",
            gemini_composer_model="gemini-primary",
            llm_allowed_fallback_models_raw="gemini:gemini-2.5-flash",
        ),
        registry=_registry(
            calls=calls,
            gemini_errors_by_model={
                "gemini-primary": ProviderUnavailableError("primary unavailable")
            },
        ),
        sleep=_no_sleep,
    )

    result = asyncio.run(
        router.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert result.provider == "gemini"
    assert result.model == "gemini-2.5-flash"
    assert calls == ["gemini:gemini-primary", "gemini:gemini-2.5-flash"]
    router_usage = result.usage["_infinity_ai_router"]
    assert router_usage["selectedModel"] == "gemini-2.5-flash"
    assert router_usage["attemptedProviderModels"] == [
        {
            "provider": "gemini",
            "model": "gemini-primary",
            "attempt": 0,
            "status": "failed",
            "errorType": "ProviderUnavailableError",
            "error": "primary unavailable",
        },
        {
            "provider": "gemini",
            "model": "gemini-2.5-flash",
            "attempt": 0,
            "status": "completed",
        },
    ]


def test_router_does_not_use_unallowlisted_model_fallback():
    calls: list[str] = []
    router = InfinityLlmRouter(
        settings=_settings(
            llm_provider_order_raw="gemini",
            gemini_composer_model="gemini-primary",
            llm_allowed_fallback_models_raw="",
        ),
        registry=_registry(
            calls=calls,
            gemini_errors_by_model={
                "gemini-primary": ProviderUnavailableError("primary unavailable")
            },
        ),
        sleep=_no_sleep,
    )

    with pytest.raises(ProviderUnavailableError):
        asyncio.run(
            router.generate_structured(
                system_prompt="Return JSON.",
                user_payload={"message": "hello"},
                response_model=SimplePayload,
                prompt_id="goal_workbench",
            )
        )

    assert calls == ["gemini:gemini-primary"]


class FakeOpenAiCompatibleCompletions:
    def __init__(
        self,
        *,
        content: str,
        model: str = "test-model",
        error: Exception | None = None,
    ) -> None:
        self.content = content
        self.model = model
        self.error = error
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return {
            "id": "completion-1",
            "model": self.model,
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": self.content},
                }
            ],
            "usage": {
                "prompt_tokens": 11,
                "completion_tokens": 7,
                "total_tokens": 18,
            },
        }


class FakeOpenAiCompatibleClient:
    def __init__(self, completions: FakeOpenAiCompatibleCompletions) -> None:
        self.completions = completions
        self.chat = type("Chat", (), {"completions": completions})()


class FakeAzureResponsesResponse:
    def __init__(
        self,
        *,
        payload: dict[str, Any],
        status_code: int = 200,
    ) -> None:
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeAzureResponsesClient:
    def __init__(
        self,
        *,
        payload: dict[str, Any] | None = None,
        status_code: int = 200,
    ) -> None:
        self.payload = payload or {
            "id": "response-1",
            "model": "gpt-5.5-1",
            "status": "completed",
            "output_text": '{"answer":"structured"}',
            "usage": {
                "input_tokens": 13,
                "output_tokens": 5,
                "total_tokens": 18,
            },
        }
        self.status_code = status_code
        self.calls: list[dict[str, Any]] = []

    async def post(self, url: str, **kwargs: Any) -> FakeAzureResponsesResponse:
        self.calls.append({"url": url, **kwargs})
        return FakeAzureResponsesResponse(
            payload=self.payload,
            status_code=self.status_code,
        )


class FakeProviderBadRequest(Exception):
    status_code = 400
    body = {"error": {"message": "schema is invalid: additionalProperties is required"}}


class FakeGeminiModels:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return type(
            "FakeGeminiResponse",
            (),
            {
                "text": '{"answer":"structured"}',
                "usage_metadata": None,
                "candidates": [],
            },
        )()


class FakeGeminiClient:
    def __init__(self, models: FakeGeminiModels) -> None:
        self.aio = type("Aio", (), {"models": models})()


def test_gemini_flash_uses_no_thinking_config():
    models = FakeGeminiModels()
    provider = GeminiProvider(
        settings=_settings(llm_provider_order_raw="gemini"),
        model="gemini-2.5-flash",
        api_key="gemini-key",
        client=FakeGeminiClient(models),
    )

    result = asyncio.run(
        provider.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert result.provider == "gemini"
    assert result.model == "gemini-2.5-flash"
    config = models.calls[0]["config"]
    assert config.thinking_config.thinking_budget == 0


def test_groq_provider_mocked_structured_output_success():
    completions = FakeOpenAiCompatibleCompletions(
        content='{"answer":"structured"}',
        model="openai/gpt-oss-20b",
    )
    provider = GroqProvider(
        settings=_settings(),
        model="openai/gpt-oss-20b",
        api_key="groq-key",
        client=FakeOpenAiCompatibleClient(completions),
    )

    result = asyncio.run(
        provider.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert result.parsed.answer == "structured"
    assert result.provider == "groq"
    assert result.model == "openai/gpt-oss-20b"
    request = completions.calls[0]
    assert request["model"] == "openai/gpt-oss-20b"
    assert request["response_format"]["type"] == "json_schema"
    assert request["response_format"]["json_schema"]["strict"] is True
    assert request["response_format"]["json_schema"]["schema"]["title"] == "SimplePayload"


def test_groq_provider_disables_sdk_retries_so_router_controls_backoff():
    provider = GroqProvider(
        settings=_settings(),
        model="openai/gpt-oss-20b",
        api_key="groq-key",
    )

    assert provider._client.max_retries == 0


def test_groq_provider_sends_strict_json_schema_subset():
    completions = FakeOpenAiCompatibleCompletions(
        content='{"answer":"structured","nested":{"label":null,"tags":[]}}',
        model="openai/gpt-oss-20b",
    )
    provider = GroqProvider(
        settings=_settings(),
        model="openai/gpt-oss-20b",
        api_key="groq-key",
        client=FakeOpenAiCompatibleClient(completions),
    )

    asyncio.run(
        provider.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=StrictSchemaPayload,
            prompt_id="goal_workbench",
        )
    )

    schema = completions.calls[0]["response_format"]["json_schema"]["schema"]
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["answer", "nested"]
    assert schema["$defs"]["NestedPayload"]["additionalProperties"] is False
    assert schema["$defs"]["NestedPayload"]["required"] == ["label", "tags"]
    assert "default" not in str(schema)


def test_strict_schema_prunes_optional_arbitrary_metadata_objects():
    completions = FakeOpenAiCompatibleCompletions(
        content='{"answer":"structured","metadata":{}}',
        model="openai/gpt-oss-20b",
    )
    provider = GroqProvider(
        settings=_settings(),
        model="openai/gpt-oss-20b",
        api_key="groq-key",
        client=FakeOpenAiCompatibleClient(completions),
    )

    asyncio.run(
        provider.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=MetadataPayload,
            prompt_id="goal_workbench",
        )
    )

    schema = completions.calls[0]["response_format"]["json_schema"]["schema"]
    assert "metadata" not in schema["properties"]
    assert "metadata" not in schema["required"]
    assert "default" not in str(schema)


def test_groq_provider_bad_request_includes_safe_provider_detail():
    completions = FakeOpenAiCompatibleCompletions(
        content="",
        error=FakeProviderBadRequest(),
    )
    provider = GroqProvider(
        settings=_settings(),
        model="openai/gpt-oss-20b",
        api_key="groq-key",
        client=FakeOpenAiCompatibleClient(completions),
    )

    with pytest.raises(ProviderRequestError, match="schema is invalid"):
        asyncio.run(
            provider.generate_structured(
                system_prompt="Return JSON.",
                user_payload={"message": "hello"},
                response_model=SimplePayload,
                prompt_id="goal_workbench",
            )
        )


def test_groq_provider_invalid_json_or_schema_fails_loudly():
    completions = FakeOpenAiCompatibleCompletions(content='{"wrong":"field"}')
    provider = GroqProvider(
        settings=_settings(),
        model="openai/gpt-oss-20b",
        api_key="groq-key",
        client=FakeOpenAiCompatibleClient(completions),
    )

    with pytest.raises(LlmValidationError):
        asyncio.run(
            provider.generate_structured(
                system_prompt="Return JSON.",
                user_payload={"message": "hello"},
                response_model=SimplePayload,
                prompt_id="goal_workbench",
            )
        )


def test_openrouter_request_includes_strict_routing_and_schema_controls():
    completions = FakeOpenAiCompatibleCompletions(
        content='{"answer":"structured"}',
        model="openai/gpt-oss-20b",
    )
    provider = OpenRouterProvider(
        settings=_settings(
            llm_provider_order_raw="openrouter",
            openrouter_api_key="openrouter-key",
            openrouter_model="openai/gpt-oss-20b",
            openrouter_provider_order_raw="groq",
        ),
        model="openai/gpt-oss-20b",
        api_key="openrouter-key",
        client=FakeOpenAiCompatibleClient(completions),
    )

    result = asyncio.run(
        provider.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert result.provider == "openrouter"
    request = completions.calls[0]
    assert request["response_format"]["json_schema"]["strict"] is True
    assert request["extra_body"]["provider"] == {
        "order": ["groq"],
        "allow_fallbacks": False,
        "require_parameters": True,
    }
    assert result.metadata is not None
    assert result.metadata["openrouterRequireParameters"] is True


def test_default_provider_registry_includes_azure_foundry():
    registry = default_provider_registry(_settings())

    assert "azure" in registry
    assert registry["azure"].supports_strict_structured_output is True


def test_azure_provider_uses_foundry_models_endpoint_and_strict_schema():
    completions = FakeOpenAiCompatibleCompletions(
        content='{"answer":"structured"}',
        model="gpt-4o",
    )
    provider = AzureFoundryProvider(
        settings=_settings(
            llm_provider_order_raw="azure",
            azure_api_key="azure-key",
            azure_endpoint="https://foundry-resource.services.ai.azure.com",
            azure_model="gpt-4o",
        ),
        model="gpt-4o",
        api_key="azure-key",
        client=FakeOpenAiCompatibleClient(completions),
    )

    result = asyncio.run(
        provider.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert provider.base_url == "https://foundry-resource.services.ai.azure.com/models"
    assert result.provider == "azure"
    assert result.model == "gpt-4o"
    request = completions.calls[0]
    assert request["model"] == "gpt-4o"
    assert request["response_format"]["type"] == "json_schema"
    assert request["response_format"]["json_schema"]["strict"] is True
    assert result.metadata is not None
    assert result.metadata["azureEndpointMode"] == "foundry_models"
    assert result.metadata["azureApiVersion"] == "2024-05-01-preview"


def test_azure_provider_supports_explicit_openai_v1_endpoint():
    provider = AzureFoundryProvider(
        settings=_settings(
            llm_provider_order_raw="azure",
            azure_api_key="azure-key",
            azure_endpoint="https://aoai-resource.openai.azure.com",
            azure_model="gpt-4o-mini",
        ),
        model="gpt-4o-mini",
        api_key="azure-key",
        client=FakeOpenAiCompatibleClient(
            FakeOpenAiCompatibleCompletions(content='{"answer":"structured"}')
        ),
    )

    assert provider.base_url == "https://aoai-resource.openai.azure.com/openai/v1"


def test_azure_provider_fails_closed_without_endpoint():
    provider = AzureFoundryProvider(
        settings=_settings(
            llm_provider_order_raw="azure",
            azure_api_key="azure-key",
            azure_endpoint="",
            azure_model="gpt-4o",
        ),
        model="gpt-4o",
        api_key="azure-key",
        client=FakeOpenAiCompatibleClient(
            FakeOpenAiCompatibleCompletions(content='{"answer":"structured"}')
        ),
    )

    with pytest.raises(ProviderUnavailableError, match="INFINITY_AI_AZURE_ENDPOINT"):
        asyncio.run(
            provider.generate_structured(
                system_prompt="Return JSON.",
                user_payload={"message": "hello"},
                response_model=SimplePayload,
                prompt_id="goal_workbench",
            )
        )


def test_azure_provider_fails_closed_without_model():
    provider = AzureFoundryProvider(
        settings=_settings(
            llm_provider_order_raw="azure",
            azure_api_key="azure-key",
            azure_endpoint="https://foundry-resource.services.ai.azure.com",
            azure_model=None,
        ),
        model="",
        api_key="azure-key",
        client=FakeOpenAiCompatibleClient(
            FakeOpenAiCompatibleCompletions(content='{"answer":"structured"}')
        ),
    )

    with pytest.raises(ProviderUnavailableError, match="INFINITY_AI_AZURE_MODEL"):
        asyncio.run(
            provider.generate_structured(
                system_prompt="Return JSON.",
                user_payload={"message": "hello"},
                response_model=SimplePayload,
                prompt_id="goal_workbench",
            )
        )


def test_azure_provider_supports_full_responses_api_url_with_strict_schema():
    responses_client = FakeAzureResponsesClient()
    api_url = (
        "https://aimodel-advista.cognitiveservices.azure.com/openai/responses"
        "?api-version=2025-04-01-preview"
    )
    provider = AzureFoundryProvider(
        settings=_settings(
            llm_provider_order_raw="azure",
            azure_api_key="azure-key",
            azure_endpoint=api_url,
            azure_model="gpt-5.5-1",
        ),
        model="gpt-5.5-1",
        api_key="azure-key",
        responses_client=responses_client,
    )

    result = asyncio.run(
        provider.generate_structured(
            system_prompt="Return JSON.",
            user_payload={"message": "hello"},
            response_model=SimplePayload,
            prompt_id="goal_workbench",
        )
    )

    assert result.provider == "azure"
    assert result.model == "gpt-5.5-1"
    assert result.parsed.answer == "structured"
    assert result.usage["input_tokens"] == 13
    assert result.usage["prompt_tokens"] == 13
    assert result.metadata["azureEndpointMode"] == "responses_api"
    request = responses_client.calls[0]
    assert request["url"] == api_url
    assert request["headers"]["Authorization"] == "Bearer azure-key"
    assert request["json"]["model"] == "gpt-5.5-1"
    assert request["json"]["input"][0]["role"] == "system"
    assert request["json"]["input"][1]["role"] == "user"
    response_format = request["json"]["text"]["format"]
    assert response_format["type"] == "json_schema"
    assert response_format["name"] == "simplepayload"
    assert response_format["strict"] is True
    assert response_format["schema"]["additionalProperties"] is False
