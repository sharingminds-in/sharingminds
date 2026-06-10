from __future__ import annotations

import asyncio
from dataclasses import dataclass, field, replace
from time import monotonic
from typing import Any, Awaitable, Callable, Literal, TypeVar

from pydantic import BaseModel

from app.core.config import LlmTaskName, Settings, get_settings
from app.core.errors import (
    LlmValidationError,
    ProviderRequestError,
    ProviderRateLimitError,
    ProviderUnavailableError,
)
from app.llm.provider import LlmCallResult, LlmProvider, elapsed_ms, timed

T = TypeVar("T", bound=BaseModel)

ProviderFactory = Callable[["ProviderBuildConfig"], LlmProvider]
SleepFn = Callable[[float], Awaitable[None]]


@dataclass(frozen=True)
class ProviderBuildConfig:
    provider_name: str
    task: LlmTaskName
    model: str
    api_key: str
    settings: Settings


@dataclass(frozen=True)
class ProviderRegistration:
    name: str
    factory: ProviderFactory
    supports_structured_output: bool = True
    supports_strict_structured_output: bool = True


@dataclass
class CircuitState:
    failure_count: int = 0
    opened_until: float = 0.0
    last_error: str | None = None


@dataclass
class LlmCircuitBreaker:
    failure_threshold: int
    cooldown_seconds: float
    now: Callable[[], float] = monotonic
    states: dict[str, CircuitState] = field(default_factory=dict)

    def is_open(self, provider_name: str) -> bool:
        state = self.states.get(provider_name)
        if not state:
            return False
        if state.opened_until <= self.now():
            return False
        return True

    def record_success(self, provider_name: str) -> None:
        self.states[provider_name] = CircuitState()

    def record_failure(self, provider_name: str, error: Exception) -> None:
        state = self.states.setdefault(provider_name, CircuitState())
        state.failure_count += 1
        state.last_error = f"{type(error).__name__}: {str(error)[:300]}"
        if state.failure_count >= self.failure_threshold:
            state.opened_until = self.now() + self.cooldown_seconds


class InfinityLlmRouter(LlmProvider):
    provider_name = "router"

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        registry: dict[str, ProviderRegistration] | None = None,
        circuit_breaker: LlmCircuitBreaker | None = None,
        sleep: SleepFn = asyncio.sleep,
    ) -> None:
        self._settings = settings or get_settings()
        self._registry = registry or default_provider_registry(self._settings)
        self._circuit_breaker = circuit_breaker or LlmCircuitBreaker(
            failure_threshold=self._settings.llm_circuit_breaker_failure_threshold,
            cooldown_seconds=self._settings.llm_circuit_breaker_cooldown_seconds,
        )
        self._sleep = sleep

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type[T],
        prompt_id: str,
        prompt_version: str = "v1",
    ) -> LlmCallResult[T]:
        started_at = timed()
        task = task_for_prompt(prompt_id)
        candidates = self._configured_candidates(task)
        if not candidates:
            raise ProviderUnavailableError(
                f"No configured LLM provider satisfies task={task} prompt={prompt_id}"
            )

        errors: list[dict[str, str]] = []
        attempt_traces: list[dict[str, Any]] = []
        for config, registration in candidates:
            if self._circuit_breaker.is_open(config.provider_name):
                errors.append(
                    {
                        "provider": config.provider_name,
                        "model": config.model,
                        "error": "circuit_open",
                    }
                )
                continue

            provider = registration.factory(config)
            max_retries = max(0, self._settings.llm_max_retries)
            for attempt in range(max_retries + 1):
                attempt_trace = {
                    "provider": config.provider_name,
                    "model": config.model,
                    "attempt": attempt,
                    "status": "started",
                }
                attempt_traces.append(attempt_trace)
                try:
                    result = await provider.generate_structured(
                        system_prompt=system_prompt,
                        user_payload=user_payload,
                        response_model=response_model,
                        prompt_id=prompt_id,
                        prompt_version=prompt_version,
                    )
                    self._circuit_breaker.record_success(config.provider_name)
                    attempt_trace["status"] = "completed"
                    return _with_router_metadata(
                        result,
                        router_latency_ms=elapsed_ms(started_at),
                        task=task,
                        provider_order=self._settings.provider_order,
                        selected_provider=config.provider_name,
                        selected_model=config.model,
                        attempt=attempt,
                        errors=errors,
                        attempts=attempt_traces,
                    )
                except LlmValidationError:
                    raise
                except ProviderRequestError as exc:
                    attempt_trace.update(
                        {
                            "status": "failed",
                            "errorType": type(exc).__name__,
                            "error": str(exc)[:300],
                        }
                    )
                    errors.append(_error_record(config, exc, attempt))
                    self._circuit_breaker.record_failure(config.provider_name, exc)
                    break
                except ProviderRateLimitError as exc:
                    attempt_trace.update(
                        {
                            "status": "failed",
                            "errorType": type(exc).__name__,
                            "error": str(exc)[:300],
                        }
                    )
                    errors.append(_error_record(config, exc, attempt))
                    self._circuit_breaker.record_failure(config.provider_name, exc)
                    break
                except ProviderUnavailableError as exc:
                    attempt_trace.update(
                        {
                            "status": "failed",
                            "errorType": type(exc).__name__,
                            "error": str(exc)[:300],
                        }
                    )
                    errors.append(_error_record(config, exc, attempt))
                    if attempt < max_retries:
                        await self._sleep(self._backoff_seconds(attempt))
                        continue
                    self._circuit_breaker.record_failure(config.provider_name, exc)
                    break

        raise ProviderUnavailableError(
            f"No configured LLM provider completed task={task} prompt={prompt_id}: {errors}"
        )

    def _configured_candidates(
        self,
        task: LlmTaskName,
    ) -> list[tuple[ProviderBuildConfig, ProviderRegistration]]:
        candidates: list[tuple[ProviderBuildConfig, ProviderRegistration]] = []
        for provider_name in self._settings.provider_order:
            if provider_name in self._settings.disallowed_providers:
                continue
            registration = self._registry.get(provider_name)
            if not registration:
                continue
            if not registration.supports_structured_output:
                continue
            if (
                self._settings.llm_strict_structured_output
                and not registration.supports_strict_structured_output
            ):
                continue
            api_key = self._settings.api_key_for_provider(provider_name)
            if self._settings.require_llm and not api_key:
                continue
            for model in self._settings.models_for_task(provider=provider_name, task=task):
                if not model or model.lower() in self._settings.disallowed_models:
                    continue
                candidates.append(
                    (
                        ProviderBuildConfig(
                            provider_name=provider_name,
                            task=task,
                            model=model,
                            api_key=api_key,
                            settings=self._settings,
                        ),
                        registration,
                    )
                )
        return candidates

    def _backoff_seconds(self, attempt: int) -> float:
        base = max(0.0, self._settings.llm_rate_limit_backoff_seconds)
        return base * (2**attempt)


def default_provider_registry(settings: Settings | None = None) -> dict[str, ProviderRegistration]:
    resolved_settings = settings or get_settings()

    def gemini_factory(config: ProviderBuildConfig) -> LlmProvider:
        from app.llm.gemini_provider import GeminiProvider

        return GeminiProvider(
            settings=resolved_settings,
            model=config.model,
            api_key=config.api_key,
        )

    def groq_factory(config: ProviderBuildConfig) -> LlmProvider:
        from app.llm.groq_provider import GroqProvider

        return GroqProvider(
            settings=resolved_settings,
            model=config.model,
            api_key=config.api_key,
        )

    def openrouter_factory(config: ProviderBuildConfig) -> LlmProvider:
        from app.llm.openrouter_provider import OpenRouterProvider

        return OpenRouterProvider(
            settings=resolved_settings,
            model=config.model,
            api_key=config.api_key,
        )

    def openai_factory(config: ProviderBuildConfig) -> LlmProvider:
        from app.llm.openai_provider import OpenAIProvider

        return OpenAIProvider(
            settings=resolved_settings,
            model=config.model,
            api_key=config.api_key,
        )

    def azure_factory(config: ProviderBuildConfig) -> LlmProvider:
        from app.llm.azure_provider import AzureFoundryProvider

        return AzureFoundryProvider(
            settings=resolved_settings,
            model=config.model,
            api_key=config.api_key,
        )

    return {
        "gemini": ProviderRegistration(name="gemini", factory=gemini_factory),
        "groq": ProviderRegistration(name="groq", factory=groq_factory),
        "openrouter": ProviderRegistration(name="openrouter", factory=openrouter_factory),
        "openai": ProviderRegistration(name="openai", factory=openai_factory),
        "azure": ProviderRegistration(name="azure", factory=azure_factory),
    }


def task_for_prompt(prompt_id: str) -> LlmTaskName:
    prompt = prompt_id.lower()
    if prompt in {"signal_extraction", "correction_patch"}:
        return "extractor"
    if prompt in {"conversation_supervisor", "expert_matching_planner"}:
        return "planner"
    if prompt == "strategy_bundle":
        return "summarizer"
    if prompt == "response_repair":
        return "repair"
    return "composer"


def _with_router_metadata(
    result: LlmCallResult[T],
    *,
    router_latency_ms: int,
    task: LlmTaskName,
    provider_order: list[str],
    selected_provider: str,
    selected_model: str,
    attempt: int,
    errors: list[dict[str, str]],
    attempts: list[dict[str, Any]],
) -> LlmCallResult[T]:
    usage = dict(result.usage or {})
    usage["_infinity_ai_router"] = {
        "task": task,
        "providerOrder": provider_order,
        "selectedProvider": selected_provider,
        "selectedModel": selected_model,
        "providerAttempt": attempt,
        "routerLatencyMs": router_latency_ms,
        "costUsd": None,
        "priorErrors": errors,
        "attemptedProviderModels": attempts,
    }
    metadata = dict(result.metadata or {})
    metadata["router"] = usage["_infinity_ai_router"]
    return replace(
        result,
        retry_count=max(result.retry_count, attempt),
        usage=usage,
        metadata=metadata,
    )


def _error_record(
    config: ProviderBuildConfig,
    exc: Exception,
    attempt: int,
) -> dict[str, str]:
    return {
        "provider": config.provider_name,
        "model": config.model,
        "attempt": str(attempt),
        "errorType": type(exc).__name__,
        "error": str(exc)[:300],
    }
