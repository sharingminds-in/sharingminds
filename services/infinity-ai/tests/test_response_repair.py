import asyncio
from typing import Any

import pytest

from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import (
    ConversationStrategy,
    ConversationSupervisorDecision,
    ResponseRepairBundle,
    SoftResponseDraft,
    TurnPolicy,
)
from app.orchestration.graph import ResponseQualityError, run_graph_pipeline


class RepairFakeProvider(LlmProvider):
    provider_name = "fake"

    def __init__(self, *, repair_succeeds: bool) -> None:
        self.repair_succeeds = repair_succeeds

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type,
        prompt_id: str,
        prompt_version: str = "v1",
    ) -> LlmCallResult:
        if response_model is ConversationSupervisorDecision:
            parsed = ConversationSupervisorDecision(
                conversation_act="chitchat",
                active_flow="soft_response",
                interrupted_flow=None,
                resume_available=False,
                flow_confidence=0.97,
                turn_policy=TurnPolicy(
                    allow_extraction=False,
                    allow_planning=True,
                    allow_tools=False,
                    allow_recommendations=False,
                    allow_memory_updates=False,
                    allow_usage_metering=False,
                    allow_question=False,
                    response_mode="soft_response",
                ),
                rationale="Harmless soft turn.",
            )
        elif response_model is SoftResponseDraft:
            parsed = SoftResponseDraft(
                phase="soft_response",
                soft_response_text="",
                response_reason="Invalid empty response for regression.",
            )
        elif response_model is ResponseRepairBundle:
            text = (
                "Brief model-generated repair."
                if self.repair_succeeds
                else ""
            )
            parsed = ResponseRepairBundle(
                strategy=ConversationStrategy(
                    phase="soft_response",
                    soft_response_text=text,
                    response_reason="Repair attempt.",
                ),
                repair_reason="Regenerate empty response.",
            )
        else:
            raise AssertionError(f"Unexpected response model {response_model}")

        return LlmCallResult(
            parsed=parsed,
            provider=self.provider_name,
            model="fake-model",
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            prompt_hash=f"hash-{prompt_id}",
            schema_name=response_model.__name__,
            latency_ms=5,
            usage={"prompt_tokens": 5, "completion_tokens": 4, "total_tokens": 9},
            response_id=f"response-{prompt_id}",
            finish_reason="stop",
            tool_calls=[],
        )


class RepairFakePlatformClient:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.persist_payload: dict[str, Any] | None = None
        self.failed_payload: dict[str, Any] | None = None

    async def start_graph_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("start_graph_run")
        return {
            "graphRunId": "11111111-1111-1111-1111-111111111111",
            "userTurnId": "22222222-2222-2222-2222-222222222222",
        }

    async def get_policy_context(
        self,
        *,
        conversation_id: str,
        actor: dict[str, Any],
    ) -> dict[str, Any]:
        self.calls.append("get_policy_context")
        return {
            "conversation": {
                "id": conversation_id,
                "phase": "discovery",
                "depthMode": "light",
                "signalSnapshot": {},
            },
            "turns": [],
            "memoryItems": [],
            "policy": {"canBookSessions": False, "canRecommendResources": True},
        }

    async def get_expert_candidates(
        self,
        *,
        conversation_id: str,
        actor: dict[str, Any],
        signal_snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        raise AssertionError("soft response repair must not call expert tools")

    async def persist(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("persist")
        self.persist_payload = payload
        return {
            "conversation": {"id": payload["conversationId"]},
            "assistantTurn": {"id": "44444444-4444-4444-4444-444444444444"},
            "graphRunId": payload["graphRunId"],
            "recommendationRunId": None,
        }

    async def mark_graph_run_failed(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("mark_graph_run_failed")
        self.failed_payload = payload
        return {"graphRun": {"id": payload["graphRunId"], "status": "failed"}}


def test_response_repair_regenerates_once_before_persisting():
    platform = RepairFakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=RepairFakeProvider(repair_succeeds=True),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Hi",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert result["responseBlocks"] == [
        {"type": "soft_response", "content": "Brief model-generated repair."}
    ]
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "diagnose_response_failure" in node_names
    assert "repair_response" in node_names
    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == [
        "conversation_supervisor",
        "soft_response_composer",
        "response_repair",
    ]
    assert trace_metadata["qualityReport"]["passed"] is True


def test_response_repair_failure_fails_closed_without_persisting_invalid_blocks():
    platform = RepairFakePlatformClient()

    with pytest.raises(ResponseQualityError):
        asyncio.run(
            run_graph_pipeline(
                provider=RepairFakeProvider(repair_succeeds=False),
                platform_client=platform,
                conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                user_message="Hi",
                actor={
                    "userId": None,
                    "anonymousSessionId": "anon-1",
                    "surface": "landing_page",
                    "authenticated": False,
                },
            )
        )

    assert "persist" not in platform.calls
    assert platform.failed_payload is not None
    assert platform.failed_payload["error"]["node"] == "fail_response_quality"
    failed_nodes = [trace["node"] for trace in platform.failed_payload["nodeTraces"]]
    assert failed_nodes.count("validate_response") == 2
    assert "repair_response" in failed_nodes


def test_response_repair_schema_rejects_grounded_fact_contradiction():
    with pytest.raises(ValueError):
        ResponseRepairBundle(
            strategy=ConversationStrategy(
                phase="mini_clarity",
                reflection_text="Model repair text.",
                response_reason="Repair attempt.",
            ),
            repair_reason="Repair would alter the active goal facts.",
            grounded_fact_effect="contradicts_grounded_facts",
        )
