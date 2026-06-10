from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.core.errors import (
    LlmValidationError,
    PlatformBridgeError,
    ProviderUnavailableError,
)

logger = logging.getLogger(__name__)

DEFAULT_SMOKE_LOG_PATH = Path(__file__).resolve().parents[2] / "logs" / "smoke-runs.jsonl"

SENSITIVE_KEY_PARTS = {
    "api_key",
    "apikey",
    "authorization",
    "auth_token",
    "bearer",
    "cookie",
    "csrf_token",
    "id_token",
    "internal_secret",
    "password",
    "refresh_token",
    "secret",
    "session_token",
    "service_role",
    "service-role",
}

SENSITIVE_COMPACT_KEYS = {
    "accesstoken",
    "apikey",
    "authtoken",
    "authorization",
    "bearer",
    "cookie",
    "csrftoken",
    "idtoken",
    "internalsecret",
    "refreshtoken",
    "sessiontoken",
    "servicerole",
    "servicerolekey",
}

TOKEN_USAGE_KEYS = {
    "cached_tokens",
    "cachedtokens",
    "completion_tokens",
    "completiontokens",
    "input_tokens",
    "inputtokens",
    "output_tokens",
    "outputtokens",
    "prompt_tokens",
    "prompttokens",
    "total_tokens",
    "totaltokens",
}

SECRET_PATTERNS = [
    (re.compile(r"(?i)\bbearer\s+[a-z0-9._~+/=-]{8,}"), "Bearer [REDACTED]"),
    (re.compile(r"AIza[0-9A-Za-z_-]{20,}"), "[REDACTED_API_KEY]"),
    (re.compile(r"sk-or-v1-[0-9A-Za-z_-]{16,}"), "[REDACTED_API_KEY]"),
    (re.compile(r"sk-[0-9A-Za-z_-]{16,}"), "[REDACTED_API_KEY]"),
    (re.compile(r"gsk_[0-9A-Za-z_-]{16,}"), "[REDACTED_API_KEY]"),
    (re.compile(r"(?i)(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(cookie\s*[:=]\s*)[^,\n\r]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(service[_-]?role[_-]?key\s*[:=]\s*)[^\s,;]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(internal[_-]?secret\s*[:=]\s*)[^\s,;]+"), r"\1[REDACTED]"),
]


def capture_completed_turn(
    *,
    final_state: Mapping[str, Any],
    persisted: Mapping[str, Any],
    http_status: int = 200,
    log_path: Path | None = None,
) -> bool:
    return append_smoke_record(
        build_completed_turn_record(
            final_state=final_state,
            persisted=persisted,
            http_status=http_status,
        ),
        log_path=log_path,
    )


def capture_failed_turn(
    *,
    conversation_id: str,
    user_message: str,
    actor: Mapping[str, Any],
    graph_run_id: str | None,
    user_turn_id: str | None,
    failed_node: str,
    error: Exception,
    node_traces: Sequence[Mapping[str, Any]],
    model_calls: Sequence[Mapping[str, Any]],
    state: Mapping[str, Any] | None = None,
    http_status: int | None = None,
    log_path: Path | None = None,
) -> bool:
    return append_smoke_record(
        build_failed_turn_record(
            conversation_id=conversation_id,
            user_message=user_message,
            actor=actor,
            graph_run_id=graph_run_id,
            user_turn_id=user_turn_id,
            failed_node=failed_node,
            error=error,
            node_traces=node_traces,
            model_calls=model_calls,
            state=state,
            http_status=http_status or http_status_for_error(error),
        ),
        log_path=log_path,
    )


def build_completed_turn_record(
    *,
    final_state: Mapping[str, Any],
    persisted: Mapping[str, Any],
    http_status: int = 200,
) -> dict[str, Any]:
    assistant_turn = persisted.get("assistantTurn")
    trace_metadata = final_state.get("trace_metadata") or {}
    return _redacted_record(
        {
            "timestamp": _timestamp(),
            "outcome": "completed",
            "final_http_status": http_status,
            "conversation_id": final_state.get("conversation_id"),
            "graph_run_id": final_state.get("graph_run_id") or persisted.get("graphRunId"),
            "user_turn_id": final_state.get("user_turn_id"),
            "assistant_turn_id": (
                assistant_turn.get("id")
                if isinstance(assistant_turn, Mapping)
                else None
            ),
            "actor_type": _actor_type(final_state.get("actor")),
            "user_message": final_state.get("user_message"),
            "response_blocks": final_state.get("response_blocks", []),
            "provider_model_attempts": _provider_model_attempts(
                final_state.get("model_calls", [])
            ),
            "llm_call_count": len(final_state.get("model_calls", [])),
            "llm_calls": _llm_calls(final_state.get("model_calls", [])),
            "node_traces": final_state.get("node_traces", []),
            "conversation_act": final_state.get("conversation_act"),
            "active_flow": final_state.get("active_flow"),
            "turn_policy": final_state.get("turn_policy", {}),
            "turn_controller": final_state.get("turn_controller_decision")
            or trace_metadata.get("turnController"),
            "turn_controller_stopped_graph": final_state.get("turn_controller_stopped_graph")
            if "turn_controller_stopped_graph" in final_state
            else trace_metadata.get("turnControllerStoppedGraph"),
            "signal_updates": final_state.get("signal_updates", []),
            "memory_updates_count": len(final_state.get("memory_updates", [])),
            "recommendation_run_summary": _recommendation_run_summary(
                final_state.get("recommendation_run")
            ),
            "failed_node": None,
            "error_type": None,
            "error_message": None,
            "trace_id": trace_metadata.get("traceId") or final_state.get("trace_id"),
        }
    )


def build_failed_turn_record(
    *,
    conversation_id: str,
    user_message: str,
    actor: Mapping[str, Any],
    graph_run_id: str | None,
    user_turn_id: str | None,
    failed_node: str,
    error: Exception,
    node_traces: Sequence[Mapping[str, Any]],
    model_calls: Sequence[Mapping[str, Any]],
    state: Mapping[str, Any] | None = None,
    http_status: int = 500,
) -> dict[str, Any]:
    state = state or {}
    return _redacted_record(
        {
            "timestamp": _timestamp(),
            "outcome": "failed",
            "final_http_status": http_status,
            "conversation_id": conversation_id,
            "graph_run_id": graph_run_id,
            "user_turn_id": user_turn_id,
            "assistant_turn_id": None,
            "actor_type": _actor_type(actor),
            "user_message": user_message,
            "response_blocks": state.get("response_blocks", []),
            "provider_model_attempts": _provider_model_attempts(model_calls),
            "llm_call_count": len(model_calls),
            "llm_calls": _llm_calls(model_calls),
            "node_traces": node_traces,
            "conversation_act": state.get("conversation_act"),
            "active_flow": state.get("active_flow"),
            "turn_policy": state.get("turn_policy", {}),
            "turn_controller": state.get("turn_controller_decision"),
            "turn_controller_stopped_graph": state.get("turn_controller_stopped_graph"),
            "signal_updates": state.get("signal_updates", []),
            "memory_updates_count": len(state.get("memory_updates", [])),
            "recommendation_run_summary": _recommendation_run_summary(
                state.get("recommendation_run")
            ),
            "failed_node": failed_node,
            "error_type": type(error).__name__,
            "error_message": sanitize_error_message(str(error)),
            "trace_id": state.get("trace_id"),
        }
    )


def append_smoke_record(
    record: Mapping[str, Any],
    *,
    log_path: Path | None = None,
) -> bool:
    target = log_path or DEFAULT_SMOKE_LOG_PATH
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(redact_secrets(record), ensure_ascii=True, default=str))
            handle.write("\n")
        return True
    except Exception as exc:
        logger.warning("Failed to write Infinity AI smoke log: %s", exc)
        return False


def http_status_for_error(error: Exception) -> int:
    if isinstance(error, ProviderUnavailableError):
        return 503
    if isinstance(error, (LlmValidationError, PlatformBridgeError)):
        return 502
    return 500


def sanitize_error_message(value: str) -> str:
    redacted = redact_secrets(value)
    return str(redacted)[:1000]


def redact_secrets(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return redact_secrets(value.model_dump(mode="json"))
    if isinstance(value, Mapping):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            key_str = str(key)
            if _is_sensitive_key(key_str):
                redacted[key_str] = "[REDACTED]"
            else:
                redacted[key_str] = redact_secrets(item)
        return redacted
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [redact_secrets(item) for item in value]
    if isinstance(value, str):
        redacted = value
        for pattern, replacement in SECRET_PATTERNS:
            redacted = pattern.sub(replacement, redacted)
        return redacted
    return value


def _redacted_record(record: Mapping[str, Any]) -> dict[str, Any]:
    return _safe_json(redact_secrets(record))


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _actor_type(actor: Any) -> str:
    if isinstance(actor, Mapping) and actor.get("authenticated"):
        return "authenticated"
    return "guest"


def _provider_model_attempts(model_calls: Any) -> list[dict[str, Any]]:
    attempts: list[dict[str, Any]] = []
    for call in model_calls if isinstance(model_calls, Sequence) else []:
        if not isinstance(call, Mapping):
            continue
        usage = call.get("usage") if isinstance(call.get("usage"), Mapping) else {}
        router = usage.get("_infinity_ai_router") if isinstance(usage, Mapping) else None
        router_attempts = (
            router.get("attemptedProviderModels")
            if isinstance(router, Mapping)
            else None
        )
        if isinstance(router_attempts, list) and router_attempts:
            for attempt in router_attempts:
                if isinstance(attempt, Mapping):
                    attempts.append(
                        {
                            "prompt_id": call.get("promptId"),
                            "provider": attempt.get("provider"),
                            "model": attempt.get("model"),
                            "attempt": attempt.get("attempt"),
                            "status": attempt.get("status"),
                            "error_type": attempt.get("errorType"),
                        }
                    )
            continue
        attempts.append(
            {
                "prompt_id": call.get("promptId"),
                "provider": call.get("provider"),
                "model": call.get("model"),
                "attempt": call.get("retryCount", 0),
                "status": "completed",
            }
        )
    return attempts


def _llm_calls(model_calls: Any) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    for call in model_calls if isinstance(model_calls, Sequence) else []:
        if not isinstance(call, Mapping):
            continue
        calls.append(
            {
                "prompt_id": call.get("promptId"),
                "prompt_version": call.get("promptVersion"),
                "provider": call.get("provider"),
                "model": call.get("model"),
                "schema_name": call.get("schemaName"),
                "response_id": call.get("responseId"),
                "finish_reason": call.get("finishReason"),
                "input_tokens": call.get("inputTokens"),
                "output_tokens": call.get("outputTokens"),
                "total_tokens": call.get("totalTokens"),
                "cached_tokens": call.get("cachedTokens"),
                "latency_ms": call.get("latencyMs"),
                "retry_count": call.get("retryCount"),
                "usage": call.get("usage", {}),
                "context_pack": call.get("contextPack"),
            }
        )
    return calls


def _recommendation_run_summary(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, Mapping):
        return None
    candidates = value.get("candidates")
    candidate_summaries: list[dict[str, Any]] = []
    if isinstance(candidates, Sequence) and not isinstance(candidates, (str, bytes)):
        for candidate in candidates:
            if not isinstance(candidate, Mapping):
                continue
            candidate_summaries.append(
                {
                    "mentorProfileId": candidate.get("mentorProfileId"),
                    "mentorUserId": candidate.get("mentorUserId"),
                    "finalScore": candidate.get("finalScore"),
                    "slotType": candidate.get("slotType"),
                    "selected": candidate.get("selected"),
                    "scoreExplanation": candidate.get("scoreExplanation"),
                }
            )
    return {
        "algorithmVersion": value.get("algorithmVersion"),
        "candidateCount": value.get("candidateCount"),
        "selectedCount": value.get("selectedCount"),
        "candidates": candidate_summaries,
    }


def _safe_json(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return _safe_json(value.model_dump(mode="json"))
    if isinstance(value, Mapping):
        return {str(key): _safe_json(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_safe_json(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _is_sensitive_key(key: str) -> bool:
    normalized = key.replace("-", "_").lower()
    compact = re.sub(r"[^a-z0-9]+", "", key.lower())
    if normalized in TOKEN_USAGE_KEYS or compact in TOKEN_USAGE_KEYS:
        return False
    return any(part in normalized for part in SENSITIVE_KEY_PARTS) or any(
        part in compact for part in SENSITIVE_COMPACT_KEYS
    )
