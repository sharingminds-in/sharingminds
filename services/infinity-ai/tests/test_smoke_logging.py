from __future__ import annotations

import json
from pathlib import Path

from app.core.errors import ProviderUnavailableError
from app.observability.smoke_log import (
    append_smoke_record,
    build_completed_turn_record,
    build_failed_turn_record,
    redact_secrets,
)


def test_redact_secrets_removes_tokens_headers_cookies_and_api_keys():
    payload = {
        "Authorization": "Bearer abcdefghijklmnopqrstuvwxyz123456",
        "access_token": "access-token-secret",
        "cookie": "session=private; other=value",
        "nested": {
            "api_key": "AIzaSyAifrABBHTaGGxRdlj7P2dku7JNRcxq4O4",
            "refreshToken": "refresh-token-secret",
            "serviceRoleKey": "service-role-secret-value",
            "text": (
                "use bearer zyxwvutsrqponmlkjihgfedcba987654 and "
                "sk-or-v1-abcdefghijklmnopqrstuvwxyz123456"
            ),
        },
        "usage": {
            "input_tokens": 10,
            "output_tokens": 5,
            "total_tokens": 15,
            "cached_tokens": 0,
            "prompt_tokens": 8,
            "completion_tokens": 7,
            "totalTokens": 15,
            "cachedTokens": 0,
        },
    }

    redacted = redact_secrets(payload)

    serialized = json.dumps(redacted)
    assert "abcdefghijklmnopqrstuvwxyz123456" not in serialized
    assert "AIzaSyAifrABBHTaGGxRdlj7P2dku7JNRcxq4O4" not in serialized
    assert "sk-or-v1-abcdefghijklmnopqrstuvwxyz123456" not in serialized
    assert "service-role-secret-value" not in serialized
    assert "access-token-secret" not in serialized
    assert "refresh-token-secret" not in serialized
    assert redacted["Authorization"] == "[REDACTED]"
    assert redacted["access_token"] == "[REDACTED]"
    assert redacted["cookie"] == "[REDACTED]"
    assert redacted["nested"]["api_key"] == "[REDACTED]"
    assert redacted["nested"]["refreshToken"] == "[REDACTED]"
    assert redacted["nested"]["serviceRoleKey"] == "[REDACTED]"
    assert redacted["usage"]["input_tokens"] == 10
    assert redacted["usage"]["output_tokens"] == 5
    assert redacted["usage"]["total_tokens"] == 15
    assert redacted["usage"]["cached_tokens"] == 0
    assert redacted["usage"]["prompt_tokens"] == 8
    assert redacted["usage"]["completion_tokens"] == 7
    assert redacted["usage"]["totalTokens"] == 15
    assert redacted["usage"]["cachedTokens"] == 0


def test_completed_record_contains_review_fields_without_private_actor_tokens():
    state = {
        "conversation_id": "conversation-1",
        "graph_run_id": "graph-1",
        "user_turn_id": "turn-1",
        "actor": {
            "authenticated": True,
            "Authorization": "Bearer abcdefghijklmnopqrstuvwxyz123456",
        },
        "user_message": "hello with gsk_abcdefghijklmnopqrstuvwxyz123456",
        "response_blocks": [{"type": "soft_response", "content": "model text"}],
        "model_calls": [
            {
                "promptId": "conversation_supervisor",
                "promptVersion": "v1",
                "provider": "gemini",
                "model": "gemini-2.5-flash-lite",
                "schemaName": "ConversationSupervisorDecision",
                "responseId": "response-1",
                "finishReason": "stop",
                "inputTokens": 10,
                "outputTokens": 5,
                "totalTokens": 15,
                "cachedTokens": 0,
                "latencyMs": 123,
                "retryCount": 0,
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 5,
                    "total_tokens": 15,
                    "cached_tokens": 0,
                    "_infinity_ai_router": {
                        "attemptedProviderModels": [
                            {
                                "provider": "gemini",
                                "model": "gemini-2.5-flash-lite",
                                "attempt": 0,
                                "status": "completed",
                            }
                        ]
                    }
                },
            }
        ],
        "node_traces": [{"node": "load_context", "status": "completed"}],
        "conversation_act": "chitchat",
        "active_flow": "soft_response",
        "turn_policy": {"allow_tools": False},
        "signal_updates": [],
        "memory_updates": [],
        "recommendation_run": None,
        "trace_metadata": {"traceId": "trace-1"},
    }
    record = build_completed_turn_record(
        final_state=state,
        persisted={"assistantTurn": {"id": "assistant-1"}},
    )

    assert record["outcome"] == "completed"
    assert record["final_http_status"] == 200
    assert record["actor_type"] == "authenticated"
    assert "actor" not in record
    assert record["assistant_turn_id"] == "assistant-1"
    assert record["llm_call_count"] == 1
    assert record["llm_calls"][0]["input_tokens"] == 10
    assert record["llm_calls"][0]["output_tokens"] == 5
    assert record["llm_calls"][0]["total_tokens"] == 15
    assert record["llm_calls"][0]["cached_tokens"] == 0
    assert record["llm_calls"][0]["usage"]["prompt_tokens"] == 10
    assert record["llm_calls"][0]["usage"]["completion_tokens"] == 5
    assert record["llm_calls"][0]["usage"]["total_tokens"] == 15
    assert record["llm_calls"][0]["usage"]["cached_tokens"] == 0
    assert record["provider_model_attempts"] == [
        {
            "prompt_id": "conversation_supervisor",
            "provider": "gemini",
            "model": "gemini-2.5-flash-lite",
            "attempt": 0,
            "status": "completed",
            "error_type": None,
        }
    ]
    assert "gsk_abcdefghijklmnopqrstuvwxyz123456" not in json.dumps(record)


def test_failed_record_includes_failure_context_and_redacted_error():
    error = ProviderUnavailableError(
        "Gemini failed with Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456"
    )
    record = build_failed_turn_record(
        conversation_id="conversation-1",
        user_message="hi",
        actor={"authenticated": False},
        graph_run_id="graph-1",
        user_turn_id="turn-1",
        failed_node="generate_strategy",
        error=error,
        node_traces=[{"node": "generate_strategy", "status": "failed"}],
        model_calls=[
            {
                "promptId": "strategy_bundle",
                "provider": "gemini",
                "model": "gemini-2.5-flash-lite",
                "inputTokens": 12,
                "outputTokens": 3,
                "totalTokens": 15,
                "cachedTokens": 1,
                "latencyMs": 98,
                "usage": {
                    "prompt_tokens": 12,
                    "completion_tokens": 3,
                    "total_tokens": 15,
                    "cached_tokens": 1,
                },
            }
        ],
        state={"conversation_act": "goal_help", "active_flow": "goal_companion"},
        http_status=503,
    )

    assert record["outcome"] == "failed"
    assert record["final_http_status"] == 503
    assert record["actor_type"] == "guest"
    assert record["failed_node"] == "generate_strategy"
    assert record["error_type"] == "ProviderUnavailableError"
    assert record["llm_calls"][0]["input_tokens"] == 12
    assert record["llm_calls"][0]["output_tokens"] == 3
    assert record["llm_calls"][0]["total_tokens"] == 15
    assert record["llm_calls"][0]["cached_tokens"] == 1
    assert record["llm_calls"][0]["usage"]["prompt_tokens"] == 12
    assert record["llm_calls"][0]["usage"]["completion_tokens"] == 3
    assert record["llm_calls"][0]["usage"]["total_tokens"] == 15
    assert record["llm_calls"][0]["usage"]["cached_tokens"] == 1
    assert "Bearer abcdefghijklmnopqrstuvwxyz123456" not in record["error_message"]
    assert "Authorization: [REDACTED]" in record["error_message"]


def test_append_smoke_record_writes_jsonl(tmp_path: Path):
    target = tmp_path / "logs" / "smoke-runs.jsonl"

    assert append_smoke_record(
        {
            "ok": True,
            "api_key": "secret",
            "llm_calls": [
                {
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "total_tokens": 15,
                    "cached_tokens": 0,
                }
            ],
        },
        log_path=target,
    )

    lines = target.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    parsed = json.loads(lines[0])
    assert parsed == {
        "ok": True,
        "api_key": "[REDACTED]",
        "llm_calls": [
            {
                "input_tokens": 10,
                "output_tokens": 5,
                "total_tokens": 15,
                "cached_tokens": 0,
            }
        ],
    }
    assert isinstance(parsed["llm_calls"][0]["total_tokens"], int)


def test_smoke_jsonl_is_gitignored():
    ignore_file = Path(__file__).resolve().parents[3] / ".gitignore"
    patterns = ignore_file.read_text(encoding="utf-8")

    assert "services/infinity-ai/logs/*.jsonl" in patterns
