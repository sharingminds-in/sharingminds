import asyncio
import json
from typing import Any

import pytest

from app.core.errors import LlmValidationError
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import (
    BlockedExpertResponseDraft,
    ConversationStrategy,
    ConversationSupervisorDecision,
    ExpertElevationDraft,
    ExpertNoMatchDraft,
    ExpertPlanningDraft,
    ExpertRetrievalPlan,
    ExtractedSignals,
    GoalWorkbenchDraft,
    GoalWorkbenchFields,
    GoalWorkbenchRouteDecision,
    RecommendationBundle,
    PendingSlotPatch,
    ResourceResponseDraft,
    SessionReadinessDraft,
    SoftResponseDraft,
    TurnControllerDecision,
    TurnPolicy,
)
from app.observability.smoke_log import build_completed_turn_record
from app.orchestration.graph import ResponseQualityError, run_graph_pipeline


def policy(
    *,
    allow_extraction: bool,
    allow_tools: bool = False,
    allow_recommendations: bool = False,
    allow_memory_updates: bool = False,
    allow_question: bool = False,
    response_mode: str = "soft_response",
) -> TurnPolicy:
    return TurnPolicy(
        allow_extraction=allow_extraction,
        allow_planning=True,
        allow_tools=allow_tools,
        allow_recommendations=allow_recommendations,
        allow_memory_updates=allow_memory_updates,
        allow_usage_metering=False,
        allow_question=allow_question,
        response_mode=response_mode,  # type: ignore[arg-type]
    )


class SidecarFakeProvider(LlmProvider):
    provider_name = "fake"

    def __init__(
        self,
        *,
        controller_decision: TurnControllerDecision | None = None,
        fail_controller: bool = False,
    ) -> None:
        self.controller_decision = controller_decision
        self.fail_controller = fail_controller
        self.prompt_ids: list[str] = []
        self.payloads_by_prompt: dict[str, list[dict[str, Any]]] = {}

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type,
        prompt_id: str,
        prompt_version: str = "v1",
    ) -> LlmCallResult:
        self.prompt_ids.append(prompt_id)
        self.payloads_by_prompt.setdefault(prompt_id, []).append(user_payload)
        if response_model is TurnControllerDecision:
            if self.fail_controller:
                raise LlmValidationError("invalid Turn Controller schema")
            if self.controller_decision is None:
                raise AssertionError("Turn Controller was not expected")
            parsed = self.controller_decision
        elif response_model is ConversationSupervisorDecision:
            flow = (
                self.controller_decision.active_flow
                if self.controller_decision
                else "soft_response"
            )
            act = (
                self.controller_decision.conversation_act
                if self.controller_decision
                else "chitchat"
            )
            parsed = ConversationSupervisorDecision(
                conversation_act=act,
                active_flow=flow,
                interrupted_flow=None,
                resume_available=False,
                flow_confidence=0.95,
                turn_policy=_policy_for_flow(flow),
                rationale="Deeper graph supervisor decision.",
            )
        elif response_model is ExtractedSignals:
            parsed = ExtractedSignals(
                primary_intent="study_decision",
                desired_outcomes=["clarity"],
                user_stage="student",
                emotions=["uncertainty"],
                constraints=["timeline"],
                urgency="medium",
                explicit_expert_request=bool(
                    self.controller_decision
                    and self.controller_decision.active_flow == "expert_matching"
                ),
                confidence={"intent": 0.9},
            )
        elif response_model is SoftResponseDraft:
            parsed = SoftResponseDraft(
                phase="soft_response",
                soft_response_text="LLM-generated soft response.",
                response_reason="Soft response.",
            )
        elif response_model is GoalWorkbenchDraft:
            parsed = GoalWorkbenchDraft(
                phase="mini_clarity",
                depth_mode="light",
                goal_type="study_decision",
                goal_summary="Clarify the user's study or career decision.",
                collected_fields=GoalWorkbenchFields(
                    subject_field="decision planning",
                    evidence={"subject_field": ["I need help deciding"]},
                ),
                missing_fields=["timeline"],
                next_action="build the next planning step",
                reflection_text="LLM-generated goal reflection.",
                route_decision=GoalWorkbenchRouteDecision(
                    target_flow="stay_goal_companion",
                    reason="Goal workbench should continue planning.",
                ),
                memory_updates=[],
                internal_rationale="Goal planning.",
            )
        elif response_model is ResourceResponseDraft:
            parsed = ResourceResponseDraft(
                phase="resource_search",
                reflection_text="LLM-generated resource preface.",
                response_reason="Resource planning.",
            )
        elif response_model is ExpertPlanningDraft:
            parsed = ExpertPlanningDraft(
                phase="expert_elevation",
                retrieval_plan=ExpertRetrievalPlan(
                    should_retrieve_experts=True,
                    needs_clarification=False,
                    clarification_question=None,
                    selection_intent="specific_relevance",
                    selection_mode="specific_relevance",
                    diversity_goal=None,
                    minimum_candidate_count=1,
                    max_selected_count=3,
                    internal_rationale="Expert planning.",
                ),
                response_reason="Expert planning.",
            )
        elif response_model is ExpertNoMatchDraft:
            parsed = ExpertNoMatchDraft(
                phase="expert_matching",
                user_response_text="LLM-generated expert no-match response.",
                internal_rationale="No selected expert cards were available.",
            )
        elif response_model is BlockedExpertResponseDraft:
            parsed = BlockedExpertResponseDraft(
                phase="expert_matching",
                user_response_text="LLM-generated blocked expert response.",
                internal_rationale=(
                    "The user is asking for mentor routing, so I should block expert retrieval."
                ),
                ui_intent="sign_in_required_for_expert_routing",
                sign_in_cta_reason="expert_or_memory_continuity_requires_auth",
            )
        elif response_model is RecommendationBundle:
            parsed = RecommendationBundle(
                expert_elevation=ExpertElevationDraft(
                    intro="LLM-generated expert elevation.",
                    reason_bullets=["Relevant experience"],
                ),
                session_readiness=SessionReadinessDraft(
                    summary="LLM-generated readiness.",
                    focus_areas=["clarity"],
                ),
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
            latency_ms=11,
            usage={"prompt_tokens": 12, "completion_tokens": 8, "total_tokens": 20},
            response_id=f"response-{prompt_id}",
            finish_reason="stop",
            tool_calls=[],
        )


def _policy_for_flow(flow: str) -> TurnPolicy:
    if flow == "resource_search":
        return policy(
            allow_extraction=True,
            allow_tools=True,
            allow_recommendations=True,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion",
        )
    if flow == "expert_matching":
        return policy(
            allow_extraction=True,
            allow_tools=True,
            allow_recommendations=True,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion",
        )
    if flow == "goal_companion":
        return policy(
            allow_extraction=True,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion",
        )
    return policy(allow_extraction=False)


def controller_decision(
    *,
    act: str = "chitchat",
    flow: str = "soft_response",
    turn_policy: TurnPolicy | None = None,
    should_continue_graph: bool = False,
    needs_signal_extraction: bool = False,
    needs_tools: bool = False,
    needs_recommendations: bool = False,
    needs_memory_update: bool = False,
    response_blocks: list[dict[str, Any]] | None = None,
    expert_selection_intent: str | None = None,
    matching_context: PendingSlotPatch | None = None,
) -> TurnControllerDecision:
    return TurnControllerDecision.model_validate(
        {
            "conversation_act": act,
            "active_flow": flow,
            "expert_selection_intent": expert_selection_intent,
            "matching_context": (
                matching_context.model_dump(mode="json")
                if matching_context is not None
                else {}
            ),
            "turn_policy": (turn_policy or _policy_for_flow(flow)).model_dump(mode="json"),
            "needs_signal_extraction": needs_signal_extraction,
            "needs_tools": needs_tools,
            "needs_recommendations": needs_recommendations,
            "needs_memory_update": needs_memory_update,
            "should_continue_graph": should_continue_graph,
            "response_blocks": response_blocks
            if response_blocks is not None
            else [{"type": "soft_response", "content": "LLM-generated direct response."}],
            "rationale": "LLM controller decision.",
            "trace_metadata": {"decisionConfidence": 0.91},
        }
    )


class SidecarFakePlatformClient:
    def __init__(
        self,
        *,
        authenticated: bool = False,
        can_recommend_experts: bool | None = None,
        can_book_sessions: bool | None = None,
        signal_snapshot: dict[str, Any] | None = None,
        turns: list[dict[str, Any]] | None = None,
        memory_items: list[dict[str, Any]] | None = None,
        expert_candidates: list[dict[str, Any]] | None = None,
        cross_chat_memory_enabled: bool = True,
    ) -> None:
        self.authenticated = authenticated
        self.can_recommend_experts = can_recommend_experts
        self.can_book_sessions = can_book_sessions
        self.signal_snapshot = signal_snapshot or {}
        self.turns = turns
        self.memory_items = memory_items or []
        self.expert_candidates = expert_candidates
        self.cross_chat_memory_enabled = cross_chat_memory_enabled
        self.calls: list[str] = []
        self.persist_payload: dict[str, Any] | None = None
        self.failed_payload: dict[str, Any] | None = None
        self.last_expert_signal_snapshot: dict[str, Any] | None = None

    async def start_graph_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("start_graph_run")
        return {
            "graphRunId": "11111111-1111-1111-1111-111111111111",
            "userTurnId": "22222222-2222-2222-2222-222222222222",
        }

    async def get_policy_context(self, *, conversation_id: str, actor: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("get_policy_context")
        return {
            "conversation": {
                "id": conversation_id,
                "phase": "discovery",
                "depthMode": "light",
                "signalSnapshot": self.signal_snapshot,
            },
            "turns": self.turns
            if self.turns is not None
            else [
                {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "actor": "user",
                    "inputText": "current turn",
                }
            ],
            "memoryItems": self.memory_items,
            "policy": {
                "canBookSessions": (
                    bool(actor.get("authenticated"))
                    if self.can_book_sessions is None
                    else self.can_book_sessions
                ),
                "canRecommendExperts": (
                    bool(actor.get("authenticated"))
                    if self.can_recommend_experts is None
                    else self.can_recommend_experts
                ),
                "canRecommendResources": True,
                "resourceVisibility": "public_only",
                "requiresAuthForBooking": not bool(actor.get("authenticated")),
                "maxExperts": 3,
                "featureFlags": {"crossChatMemoryEnabled": self.cross_chat_memory_enabled},
            },
        }

    async def get_expert_candidates(
        self,
        *,
        conversation_id: str,
        actor: dict[str, Any],
        signal_snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        self.calls.append("get_expert_candidates")
        self.last_expert_signal_snapshot = signal_snapshot
        if self.expert_candidates is not None:
            return {"candidates": self.expert_candidates}
        return {
            "candidates": [
                {
                    "mentorProfileId": "33333333-3333-3333-3333-333333333333",
                    "mentorUserId": "mentor-user-1",
                    "name": "Career Mentor",
                    "title": "Career Coach",
                    "company": "Young Minds",
                    "industry": "technology",
                    "headline": "Career clarity mentor",
                    "about": "Helps with early career decisions.",
                    "image": None,
                    "location": "Region Alpha",
                    "hourlyRate": 60,
                    "currency": "GBP",
                    "experienceYears": 8,
                    "expertise": ["career growth", "decision clarity"],
                    "intentTags": ["study_decision"],
                    "outcomeTags": ["clarity"],
                    "industryTags": ["technology"],
                    "personaFitTags": ["student"],
                    "keywordTrustScore": 0.8,
                    "contentAuthorityScore": 0.7,
                    "qualityScore": 0.9,
                    "conversionScore": 0.5,
                    "allocationSnapshot": {},
                    "metadataQualityStatus": "derived_v1",
                    "metrics": {
                        "completedSessions": 5,
                        "cancelledSessions": 0,
                        "avgReviewScore": 4.8,
                        "reviewCount": 5,
                        "recentImpressions7d": 1,
                        "recentClicks7d": 0,
                        "recentBookings30d": 1,
                        "recentCompletions90d": 4,
                        "lastShownAt": None,
                    },
                    "activeBoostRules": [],
                }
            ]
        }

    async def get_resource_candidates(
        self,
        *,
        conversation_id: str,
        actor: dict[str, Any],
        signal_snapshot: dict[str, Any],
        user_message: str,
    ) -> dict[str, Any]:
        self.calls.append("get_resource_candidates")
        return {
            "candidates": [
                {
                    "resourceId": "66666666-6666-6666-6666-666666666666",
                    "resourceType": "course",
                    "title": "Study Planning",
                    "description": "Public planning course.",
                    "href": "/courses/66666666-6666-6666-6666-666666666666",
                    "source": "courses",
                    "visibility": "public",
                    "providerName": "Young Minds",
                    "category": "Planning",
                    "difficulty": "BEGINNER",
                    "durationMinutes": 60,
                    "price": 0,
                    "currency": "USD",
                    "image": None,
                    "tags": ["study"],
                    "learningOutcomes": ["Plan options"],
                    "intentTags": ["study_decision"],
                    "outcomeTags": ["clarity"],
                    "avgRating": 4.6,
                    "reviewCount": 4,
                    "enrollmentCount": 20,
                    "metadata": {},
                }
            ],
            "visibility": "public",
            "policyBlocked": False,
        }

    async def persist(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("persist")
        self.persist_payload = payload
        return {
            "conversation": {"id": payload["conversationId"]},
            "assistantTurn": {"id": "44444444-4444-4444-4444-444444444444"},
            "graphRunId": payload["graphRunId"],
            "recommendationRunId": "55555555-5555-5555-5555-555555555555",
        }

    async def mark_graph_run_failed(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("mark_graph_run_failed")
        self.failed_payload = payload
        return {"graphRun": {"id": payload["graphRunId"], "status": "failed"}}


def run_sidecar(
    *,
    provider: SidecarFakeProvider,
    platform: SidecarFakePlatformClient,
    message: str = "Hello",
    authenticated: bool = False,
    enabled: bool = True,
) -> dict[str, Any]:
    return asyncio.run(
        run_graph_pipeline(
            provider=provider,
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message=message,
            actor={
                "userId": "user-1" if authenticated else None,
                "anonymousSessionId": None if authenticated else "anon-1",
                "surface": "landing_page",
                "authenticated": authenticated,
            },
            turn_controller_enabled=enabled,
        )
    )


def test_turn_controller_flag_off_preserves_current_graph_path():
    provider = SidecarFakeProvider(controller_decision=None)
    platform = SidecarFakePlatformClient()

    result = run_sidecar(
        provider=provider,
        platform=platform,
        message="Hello",
        enabled=False,
    )

    assert result["responseBlocks"] == [
        {"type": "soft_response", "content": "LLM-generated soft response."}
    ]
    assert provider.prompt_ids == ["conversation_supervisor", "soft_response_composer"]
    assert platform.persist_payload is not None
    node_names = [
        trace["node"]
        for trace in platform.persist_payload["traceMetadata"]["nodeTraces"]
    ]
    assert "turn_controller" not in node_names
    assert node_names[:2] == [
        "load_context",
        "classify_conversation_act",
    ]
    assert "turn_resolution" not in node_names
    assert "goal_workbench" not in node_names


def test_turn_controller_flag_on_simple_greeting_uses_one_llm_call():
    provider = SidecarFakeProvider(controller_decision=controller_decision())
    platform = SidecarFakePlatformClient()

    result = run_sidecar(provider=provider, platform=platform, message="Hello")

    assert result["responseBlocks"] == [
        {"type": "soft_response", "content": "LLM-generated direct response."}
    ]
    assert provider.prompt_ids == ["turn_controller"]
    assert platform.calls == ["start_graph_run", "get_policy_context", "persist"]
    assert result["signalUpdates"] == []
    assert result["recommendationRun"] is None
    assert result["memoryUpdates"] == []

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["turnControllerStoppedGraph"] is True
    assert trace_metadata["turnController"]["should_continue_graph"] is False
    assert trace_metadata["conversationAct"] == "chitchat"
    assert trace_metadata["activeFlow"] == "soft_response"
    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == ["turn_controller"]
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert node_names == [
        "load_context",
        "turn_controller",
        "validate_response",
    ]


def test_turn_controller_routing_payload_uses_compact_context():
    provider = SidecarFakeProvider(controller_decision=controller_decision())
    platform = SidecarFakePlatformClient(
        signal_snapshot={
            "primary_intent": "study_decision",
            "large_internal_blob": "x" * 50_000,
            "active_goal": {
                "active_goal_key": "goal-1",
                "goal_type": "study",
                "goal_summary": "Study planning",
                "collected_fields": {
                    "budget": {"raw_budget_text": "budget text"},
                    "large_notes": "y" * 50_000,
                },
            },
        },
        turns=[
            {
                "id": f"turn-{index}",
                "actor": "assistant" if index % 2 else "user",
                "inputText": "z" * 5_000,
                "responseBlocks": [
                    {"type": "reflection", "content": "a" * 5_000},
                    {"type": "clarification", "question": "b" * 5_000},
                ],
            }
            for index in range(8)
        ],
        memory_items=[
            {
                "memoryType": "goal",
                "content": "m" * 10_000,
                "confidence": 0.9,
                "metadata": {"secret": "not needed by router"},
            }
            for _ in range(6)
        ],
    )

    run_sidecar(provider=provider, platform=platform, message="Hello", authenticated=True)

    payload = provider.payloads_by_prompt["turn_controller"][0]
    serialized = json.dumps(payload)
    assert "large_internal_blob" not in serialized
    assert "large_notes" not in serialized
    assert "secret" not in serialized
    assert len(payload["recent_turns"]) == 3
    assert len(payload["memory_items"]) == 2
    assert payload["memory_item_count"] == 6
    assert len(serialized) < 12_000


def test_turn_controller_direct_stop_forces_downstream_policy_off():
    sloppy_policy = TurnPolicy(
        allow_extraction=True,
        allow_planning=True,
        allow_tools=True,
        allow_recommendations=True,
        allow_memory_updates=True,
        allow_usage_metering=True,
        allow_question=True,
        response_mode="goal_companion",
    )
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(turn_policy=sloppy_policy)
    )
    platform = SidecarFakePlatformClient()

    run_sidecar(provider=provider, platform=platform, message="Hello")

    assert platform.persist_payload is not None
    turn_policy = platform.persist_payload["traceMetadata"]["turnPolicy"]
    assert turn_policy["allow_extraction"] is False
    assert turn_policy["allow_planning"] is False
    assert turn_policy["allow_tools"] is False
    assert turn_policy["allow_recommendations"] is False
    assert turn_policy["allow_memory_updates"] is False
    assert turn_policy["allow_usage_metering"] is False
    assert turn_policy["response_mode"] == "soft_response"
    assert platform.persist_payload["signalUpdates"] == []
    assert platform.persist_payload["memoryUpdates"] == []
    assert platform.persist_payload["recommendationRun"] is None
    assert "get_expert_candidates" not in platform.calls
    assert "get_resource_candidates" not in platform.calls
    assert provider.prompt_ids == ["turn_controller"]


def test_turn_controller_soft_turns_do_not_run_extraction_tools_scoring_or_memory():
    for act in ["chitchat", "meta_question", "repeat", "cancel_or_restart", "unsupported", "safety"]:
        provider = SidecarFakeProvider(
            controller_decision=controller_decision(
                act=act,
                flow="safety" if act == "safety" else "soft_response",
                response_blocks=[
                    {
                        "type": "soft_response",
                        "content": f"LLM-generated {act} response.",
                    }
                ],
            )
        )
        platform = SidecarFakePlatformClient()

        result = run_sidecar(provider=provider, platform=platform, message=act)

        assert "get_expert_candidates" not in platform.calls
        assert "get_resource_candidates" not in platform.calls
        assert result["signalUpdates"] == []
        assert result["recommendationRun"] is None
        assert result["memoryUpdates"] == []
        assert provider.prompt_ids == ["turn_controller"]
        assert platform.persist_payload is not None
        node_names = [
            trace["node"]
            for trace in platform.persist_payload["traceMetadata"]["nodeTraces"]
        ]
        assert "extract_signals" not in node_names
        assert "score_candidates" not in node_names
        assert "score_resource_candidates" not in node_names
        assert "validate_response" in node_names


def test_turn_controller_direct_response_with_platform_owned_metadata_fails_before_persist():
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            response_blocks=[
                {
                    "type": "soft_response",
                    "content": "LLM-generated direct response.",
                    "metadata": {
                        "bookingDecision": "create_session",
                        "canBookSessions": True,
                        "usageMetering": "consume",
                    },
                }
            ],
        )
    )
    platform = SidecarFakePlatformClient()

    with pytest.raises(ResponseQualityError):
        run_sidecar(provider=provider, platform=platform, message="Hello")

    assert provider.prompt_ids == ["turn_controller"]
    assert "persist" not in platform.calls
    assert platform.failed_payload is not None
    assert platform.failed_payload["error"]["node"] == "fail_response_quality"
    node_names = [trace["node"] for trace in platform.failed_payload["nodeTraces"]]
    assert node_names == [
        "load_context",
        "turn_controller",
        "validate_response",
        "fail_response_quality",
    ]
    quality_report = platform.failed_payload["stateAfter"]["qualityReport"]
    failed_gates = [
        gate["name"]
        for gate in quality_report["gates"]
        if not gate["passed"]
    ]
    assert "platform_boundary_preserved" in failed_gates


def test_turn_controller_stop_path_cannot_hide_tool_or_recommendation_effects():
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            act="resource_request",
            flow="resource_search",
            should_continue_graph=False,
            needs_signal_extraction=True,
            needs_tools=True,
            needs_recommendations=True,
            needs_memory_update=True,
            response_blocks=[
                {
                    "type": "soft_response",
                    "content": "LLM-generated resource preface.",
                }
            ],
        )
    )
    platform = SidecarFakePlatformClient()

    result = run_sidecar(provider=provider, platform=platform, message="Recommend resources")

    assert result["signalUpdates"] == []
    assert "get_resource_candidates" in platform.calls
    assert result["recommendationRun"]["algorithmVersion"] == "infinity-resource-v1"
    assert result["memoryUpdates"] == []
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["turnControllerStoppedGraph"] is False
    assert trace_metadata["turnController"]["should_continue_graph"] is True
    assert trace_metadata["turnController"]["needs_tools"] is True
    assert trace_metadata["turnController"]["needs_recommendations"] is True
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "classify_conversation_act" not in node_names
    assert "extract_signals" not in node_names


def test_turn_controller_goal_request_continues_into_existing_graph():
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            act="goal_help",
            flow="goal_companion",
            should_continue_graph=True,
            needs_signal_extraction=True,
            response_blocks=[],
        )
    )
    platform = SidecarFakePlatformClient()

    result = run_sidecar(provider=provider, platform=platform, message="I need help deciding")

    assert provider.prompt_ids == ["turn_controller", "goal_workbench"]
    assert result["signalUpdates"]
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["turnControllerStoppedGraph"] is False
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "turn_controller" in node_names
    assert "classify_conversation_act" not in node_names
    assert "goal_workbench" in node_names
    assert "extract_signals" not in node_names
    assert "generate_strategy" not in node_names


def test_turn_controller_resource_request_continues_into_resource_path():
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            act="resource_request",
            flow="resource_search",
            should_continue_graph=True,
            needs_signal_extraction=True,
            needs_tools=True,
            needs_recommendations=True,
            response_blocks=[],
        )
    )
    platform = SidecarFakePlatformClient()

    result = run_sidecar(provider=provider, platform=platform, message="Recommend resources")

    assert "get_resource_candidates" in platform.calls
    assert "conversation_supervisor" not in provider.prompt_ids
    assert result["recommendationRun"]["algorithmVersion"] == "infinity-resource-v1"
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "resource_cards" in block_types
    assert "expert_cards" not in block_types


def test_turn_controller_expert_request_continues_into_expert_path_with_platform_policy():
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            act="expert_request",
            flow="expert_matching",
            should_continue_graph=True,
            needs_signal_extraction=True,
            needs_tools=True,
            needs_recommendations=True,
            needs_memory_update=True,
            response_blocks=[],
        )
    )
    platform = SidecarFakePlatformClient()

    result = run_sidecar(
        provider=provider,
        platform=platform,
        message="Give me some random mentors.",
        authenticated=True,
    )

    assert "get_expert_candidates" in platform.calls
    assert "conversation_supervisor" not in provider.prompt_ids
    assert result["recommendationRun"]["selectedCount"] == 1
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" in block_types
    assert "resource_cards" not in block_types
    assert platform.persist_payload is not None
    node_names = [
        trace["node"]
        for trace in platform.persist_payload["traceMetadata"]["nodeTraces"]
    ]
    assert "classify_conversation_act" not in node_names
    assert "maybe_retrieve_experts" in node_names
    assert "score_candidates" in node_names
    assert "allocate_slots" in node_names
    allocation_trace = next(
        trace for trace in platform.persist_payload["traceMetadata"]["nodeTraces"]
        if trace["node"] == "allocate_slots"
    )
    assert allocation_trace["summary"]["selectionMode"] == "open_discovery"


def test_turn_controller_expert_request_applies_matching_context_before_scoring():
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            act="expert_request",
            flow="expert_matching",
            should_continue_graph=True,
            needs_signal_extraction=False,
            needs_tools=True,
            needs_recommendations=True,
            response_blocks=[],
            expert_selection_intent="specific_relevance",
            matching_context=PendingSlotPatch(
                expertise_keywords=["data science"],
                canonical_domains=["data science"],
                industries=["data science"],
                intents=["learn data science"],
            ),
        )
    )
    platform = SidecarFakePlatformClient(
        expert_candidates=[
            {
                "mentorProfileId": "33333333-3333-3333-3333-333333333333",
                "mentorUserId": "mentor-user-1",
                "name": "Data Mentor",
                "title": "Data Science Mentor",
                "company": "Young Minds",
                "industry": "data science",
                "headline": "Guides practical data science learning.",
                "about": "Helps learners build data science foundations and projects.",
                "image": None,
                "location": "Remote",
                "hourlyRate": 60,
                "currency": "USD",
                "experienceYears": 8,
                "expertise": ["data science", "machine learning", "python"],
                "intentTags": ["learn data science"],
                "outcomeTags": ["skill_growth"],
                "industryTags": ["data science", "technology"],
                "personaFitTags": ["learner"],
                "keywordTrustScore": 0.8,
                "contentAuthorityScore": 0.7,
                "qualityScore": 0.9,
                "conversionScore": 0.5,
                "allocationSnapshot": {},
                "metadataQualityStatus": "derived_v1",
                "metrics": {
                    "completedSessions": 5,
                    "cancelledSessions": 0,
                    "avgReviewScore": 4.8,
                    "reviewCount": 5,
                    "recentImpressions7d": 1,
                    "recentClicks7d": 0,
                    "recentBookings30d": 1,
                    "recentCompletions90d": 4,
                    "lastShownAt": None,
                },
                "activeBoostRules": [],
            }
        ]
    )

    result = run_sidecar(
        provider=provider,
        platform=platform,
        message="Give me a data science mentor.",
        authenticated=True,
    )

    assert "conversation_supervisor" not in provider.prompt_ids
    assert "get_expert_candidates" in platform.calls
    assert platform.last_expert_signal_snapshot is not None
    assert "data science" in platform.last_expert_signal_snapshot["expertise_keywords"]
    assert "data science" in platform.last_expert_signal_snapshot["canonical_domains"]
    assert result["recommendationRun"]["selectedCount"] == 1
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" in block_types
    assert "resource_cards" not in block_types

    assert platform.persist_payload is not None
    persisted_signal_types = {
        signal["signalType"] for signal in platform.persist_payload["signalUpdates"]
    }
    assert persisted_signal_types <= {"intent", "industry", "subject_field"}
    assert "canonical_domain" not in persisted_signal_types
    assert "expertise_keyword" not in persisted_signal_types
    assert "mentor_category" not in persisted_signal_types
    trace_metadata = platform.persist_payload["traceMetadata"]
    turn_controller_trace = next(
        trace for trace in trace_metadata["nodeTraces"]
        if trace["node"] == "turn_controller"
    )
    assert turn_controller_trace["summary"]["matchingContextSignalUpdateCount"] >= 3
    scoring_trace = next(
        trace for trace in trace_metadata["nodeTraces"]
        if trace["node"] == "score_candidates"
    )
    assert scoring_trace["summary"]["topScores"][0]["finalScore"] >= 0.3
    allocation_trace = next(
        trace for trace in trace_metadata["nodeTraces"]
        if trace["node"] == "allocate_slots"
    )
    assert allocation_trace["summary"]["selectionMode"] == "specific_relevance"
    assert allocation_trace["summary"]["selectedCount"] == 1


def test_expert_matching_policy_normalizes_tools_for_allowed_recommendations():
    controller_policy = TurnPolicy(
        allow_extraction=True,
        allow_planning=True,
        allow_tools=False,
        allow_recommendations=True,
        allow_memory_updates=True,
        allow_usage_metering=False,
        allow_question=True,
        response_mode="goal_companion",
    )
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            act="expert_request",
            flow="expert_matching",
            turn_policy=controller_policy,
            should_continue_graph=True,
            needs_signal_extraction=True,
            needs_tools=False,
            needs_recommendations=True,
            needs_memory_update=True,
            response_blocks=[],
            expert_selection_intent="open_discovery",
        )
    )
    platform = SidecarFakePlatformClient(
        can_recommend_experts=True,
        can_book_sessions=False,
        signal_snapshot={
            "active_goal": {
                "active_goal_key": "goal-1",
                "goal_type": "study_planning",
                "goal_summary": "Existing study planning context.",
                "collected_fields": {"subject_field": "existing field"},
                "missing_fields": [],
                "plan_version": 1,
            }
        },
    )

    result = run_sidecar(
        provider=provider,
        platform=platform,
        message="Model-routed broad mentor request",
        authenticated=False,
    )

    assert "conversation_supervisor" not in provider.prompt_ids
    assert "get_expert_candidates" in platform.calls
    assert result["recommendationRun"]["selectedCount"] == 1
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" in block_types
    assert "sign_in_cta" in block_types

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["turnPolicy"]["allow_tools"] is True
    assert trace_metadata["turnPolicy"]["allow_recommendations"] is True
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is False
    assert trace_metadata["turnController"]["needs_tools"] is True
    assert trace_metadata["turnController"]["needs_recommendations"] is True
    allocation_trace = next(
        trace for trace in trace_metadata["nodeTraces"]
        if trace["node"] == "allocate_slots"
    )
    assert allocation_trace["summary"]["selectionMode"] == "open_discovery"


def test_turn_controller_cross_chat_memory_flag_disables_authenticated_memory_updates():
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            act="goal_help",
            flow="goal_companion",
            should_continue_graph=True,
            needs_signal_extraction=False,
            needs_tools=False,
            needs_recommendations=False,
            needs_memory_update=True,
            response_blocks=[],
        )
    )
    platform = SidecarFakePlatformClient(
        cross_chat_memory_enabled=False,
        memory_items=[
            {
                "id": "memory-1",
                "memoryType": "goal",
                "content": "Cross-chat memory that must not hydrate when disabled.",
                "confidence": 0.9,
            }
        ],
    )

    result = run_sidecar(
        provider=provider,
        platform=platform,
        message="Help me think through a goal.",
        authenticated=True,
    )

    assert result["memoryUpdates"] == []
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is False
    assert trace_metadata["turnController"]["needs_memory_update"] is False
    turn_controller_payload = provider.payloads_by_prompt["turn_controller"][0]
    goal_workbench_payload = provider.payloads_by_prompt["goal_workbench"][0]
    assert turn_controller_payload["memory_items"] == []
    assert turn_controller_payload["memory_item_count"] == 0
    assert goal_workbench_payload["memory_items"] == []
    assert goal_workbench_payload["memory_item_count"] == 0
    assert platform.persist_payload["stateUpdates"]["memorySnapshot"] == {"items": []}


def test_guest_blocked_expert_request_skips_extraction_and_planner_with_sidecar_enabled():
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            act="expert_request",
            flow="expert_matching",
            should_continue_graph=True,
            needs_signal_extraction=True,
            needs_tools=True,
            needs_recommendations=True,
            response_blocks=[],
        )
    )
    platform = SidecarFakePlatformClient()

    result = run_sidecar(
        provider=provider,
        platform=platform,
        message="route me to some random mentor please",
        authenticated=False,
    )

    assert provider.prompt_ids == [
        "turn_controller",
        "blocked_expert_response_composer",
    ]
    assert "get_expert_candidates" not in platform.calls
    assert "get_resource_candidates" not in platform.calls
    assert result["signalUpdates"] == []
    assert result["recommendationRun"] is None
    assert result["memoryUpdates"] == []
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "sign_in_cta" in block_types
    assert "expert_cards" not in block_types
    assert "resource_cards" not in block_types
    assert any(block.get("content") for block in result["responseBlocks"])
    visible_text = " ".join(
        str(block.get("content", ""))
        for block in result["responseBlocks"]
        if isinstance(block, dict)
    )
    internal_rationale = (
        "The user is asking for mentor routing, so I should block expert retrieval."
    )
    assert "LLM-generated blocked expert response." in visible_text
    assert internal_rationale not in json.dumps(result["responseBlocks"])

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "expert_request"
    assert trace_metadata["activeFlow"] == "expert_matching"
    assert trace_metadata["turnPolicy"]["allow_extraction"] is False
    assert trace_metadata["turnPolicy"]["allow_planning"] is True
    assert trace_metadata["turnPolicy"]["allow_tools"] is False
    assert trace_metadata["turnPolicy"]["allow_recommendations"] is False
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is False
    assert trace_metadata["turnPolicy"]["allow_usage_metering"] is False
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "classify_conversation_act" not in node_names
    assert "extract_signals" not in node_names
    assert "normalize_signals" not in node_names
    assert "maybe_retrieve_experts" not in node_names
    assert "score_candidates" not in node_names
    assert "allocate_slots" not in node_names
    assert "maybe_generate_expert_elevation" not in node_names


def test_guest_expert_preview_with_sidecar_returns_cards_and_sign_in_cta():
    provider = SidecarFakeProvider(
        controller_decision=controller_decision(
            act="expert_request",
            flow="expert_matching",
            should_continue_graph=True,
            needs_signal_extraction=True,
            needs_tools=True,
            needs_recommendations=True,
            needs_memory_update=True,
            response_blocks=[],
        )
    )
    platform = SidecarFakePlatformClient(
        can_recommend_experts=True,
        can_book_sessions=False,
    )

    result = run_sidecar(
        provider=provider,
        platform=platform,
        message="Recommend mentors",
        authenticated=False,
    )

    assert "get_expert_candidates" in platform.calls
    assert "conversation_supervisor" not in provider.prompt_ids
    assert result["recommendationRun"]["selectedCount"] == 1
    assert result["memoryUpdates"] == []
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" in block_types
    assert "sign_in_cta" in block_types
    assert "resource_cards" not in block_types

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "expert_request"
    assert trace_metadata["activeFlow"] == "expert_matching"
    assert trace_metadata["turnPolicy"]["allow_tools"] is True
    assert trace_metadata["turnPolicy"]["allow_recommendations"] is True
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is False
    assert trace_metadata["turnPolicy"]["allow_usage_metering"] is False
    assert trace_metadata["selectedExpertIds"] == [
        "33333333-3333-3333-3333-333333333333"
    ]


def test_turn_controller_invalid_schema_fails_closed_without_canned_fallback():
    provider = SidecarFakeProvider(fail_controller=True)
    platform = SidecarFakePlatformClient()

    with pytest.raises(LlmValidationError):
        run_sidecar(provider=provider, platform=platform, message="Hello")

    assert provider.prompt_ids == ["turn_controller"]
    assert "persist" not in platform.calls
    assert platform.failed_payload is not None
    assert platform.failed_payload["error"]["node"] == "turn_controller"
    assert "responseBlocks" not in platform.failed_payload


def test_smoke_record_exposes_turn_controller_decision():
    final_state = {
        "conversation_id": "conversation-1",
        "graph_run_id": "graph-1",
        "user_turn_id": "turn-1",
        "actor": {"authenticated": False},
        "user_message": "Hello",
        "response_blocks": [{"type": "soft_response", "content": "LLM-generated response."}],
        "model_calls": [
            {
                "promptId": "turn_controller",
                "promptVersion": "v1",
                "provider": "gemini",
                "model": "gemini-2.5-flash-lite",
                "schemaName": "TurnControllerDecision",
                "responseId": "response-1",
                "inputTokens": 10,
                "outputTokens": 6,
                "totalTokens": 16,
                "latencyMs": 123,
                "retryCount": 0,
                "usage": {"prompt_tokens": 10, "completion_tokens": 6, "total_tokens": 16},
            }
        ],
        "node_traces": [{"node": "turn_controller", "status": "completed"}],
        "conversation_act": "chitchat",
        "active_flow": "soft_response",
        "turn_policy": {"allow_tools": False},
        "turn_controller_decision": {
            "conversation_act": "chitchat",
            "active_flow": "soft_response",
            "should_continue_graph": False,
        },
        "turn_controller_stopped_graph": True,
        "signal_updates": [],
        "memory_updates": [],
        "recommendation_run": None,
        "trace_metadata": {"traceId": "trace-1"},
    }

    record = build_completed_turn_record(
        final_state=final_state,
        persisted={"assistantTurn": {"id": "assistant-1"}},
    )

    assert record["turn_controller"]["should_continue_graph"] is False
    assert record["turn_controller_stopped_graph"] is True
    assert record["llm_call_count"] == 1
    assert record["llm_calls"][0]["prompt_id"] == "turn_controller"
    assert record["llm_calls"][0]["total_tokens"] == 16
