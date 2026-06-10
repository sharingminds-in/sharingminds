from __future__ import annotations

from typing import Any, Awaitable, Callable, TypeVar
from uuid import uuid4

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel

from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import (
    BoundaryResponseDraft,
    ConversationStrategy,
    ConversationSupervisorDecision,
    CorrectionPatchDraft,
    CorrectionResponseDraft,
    ExpertElevationDraft,
    ExpertPlanningDraft,
    ExtractedSignals,
    GoalWorkbenchDraft,
    GoalWorkbenchFields,
    GoalWorkbenchRouteDecision,
    RecommendationBundle,
    ResourceResponseDraft,
    ResponseRepairBundle,
    SessionReadinessDraft,
    SoftResponseDraft,
    TurnPolicy,
)
from app.orchestration.graph import (
    GRAPH_VERSION,
    InfinityGraphState,
    NODE_SUMMARY_KEY,
    build_infinity_graph,
    _allocate_slots,
    _assemble_response_blocks,
    _choose_conversation_step,
    _classify_conversation_act,
    _diagnose_response_failure,
    _extract_signals,
    _fail_response_quality,
    _generate_strategy,
    _goal_workbench,
    _load_context,
    _maybe_generate_expert_elevation,
    _maybe_generate_framework,
    _maybe_generate_session_readiness,
    _maybe_retrieve_experts,
    _normalize_signals,
    _patch_correction_context,
    _persist_turn_and_trace,
    _repair_response,
    _route_after_framework,
    _route_after_strategy,
    _route_after_supervisor,
    _route_after_validation,
    _score_candidates,
    _trace_node,
    _validate_response,
)

STUDIO_SAMPLE_INPUTS = [
    "Hi",
    "Tell me a joke",
    "I need help deciding between a masters in Australia and getting a job",
    "Actually I want to do computer science",
    "Recommend mentors",
]

STUDIO_CONVERSATION_ID = "99999999-9999-4999-8999-999999999999"
STUDIO_USER_TURN_ID = "88888888-8888-4888-8888-888888888888"
STUDIO_GRAPH_RUN_ID = "77777777-7777-4777-8777-777777777777"

T = TypeVar("T", bound=BaseModel)
NodeFn = Callable[[InfinityGraphState], Awaitable[dict[str, Any]]]


def _policy_for(
    *,
    allow_extraction: bool,
    allow_tools: bool,
    allow_recommendations: bool,
    allow_memory_updates: bool,
    allow_question: bool,
    response_mode: str,
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


def _message(payload: dict[str, Any]) -> str:
    return str(payload.get("user_message") or "").strip()


def _normalized_message(payload: dict[str, Any]) -> str:
    return _message(payload).lower()


def _studio_llm_result(
    *,
    parsed: T,
    response_model: type[T],
    prompt_id: str,
    prompt_version: str,
) -> LlmCallResult[T]:
    return LlmCallResult(
        parsed=parsed,
        provider="studio-fake",
        model="studio-local-fixture",
        prompt_id=prompt_id,
        prompt_version=prompt_version,
        prompt_hash=f"studio-{prompt_id}-{prompt_version}",
        schema_name=response_model.__name__,
        latency_ms=3,
        usage={
            "prompt_tokens": 24,
            "completion_tokens": 12,
            "total_tokens": 36,
        },
        response_id=f"studio-{prompt_id}-{uuid4()}",
        finish_reason="stop",
        retry_count=0,
        tool_calls=[],
    )


class StudioFakeProvider(LlmProvider):
    provider_name = "studio-fake"

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        response_model: type[T],
        prompt_id: str,
        prompt_version: str = "v1",
    ) -> LlmCallResult[T]:
        parsed = self._build_parsed_response(user_payload, response_model)
        return _studio_llm_result(
            parsed=parsed,
            response_model=response_model,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
        )

    def _build_parsed_response(
        self,
        user_payload: dict[str, Any],
        response_model: type[T],
    ) -> T:
        text = _message(user_payload)
        normalized = text.lower()

        if response_model is ConversationSupervisorDecision:
            return self._supervisor_decision(normalized)  # type: ignore[return-value]

        if response_model is ExtractedSignals:
            return self._extracted_signals(normalized)  # type: ignore[return-value]

        if response_model is CorrectionPatchDraft:
            return self._correction_patch(normalized)  # type: ignore[return-value]

        if response_model is SoftResponseDraft:
            return SoftResponseDraft(
                phase="soft_response",
                soft_response_text=(
                    "Studio mock response: I can stay brief here and preserve the "
                    "active goal flow for later."
                ),
                response_reason="Local Studio soft-turn fixture.",
            )  # type: ignore[return-value]

        if response_model is BoundaryResponseDraft:
            return BoundaryResponseDraft(
                phase="safety",
                soft_response_text=(
                    "Studio mock boundary response: this request stays outside "
                    "platform actions."
                ),
                response_reason="Local Studio boundary fixture.",
            )  # type: ignore[return-value]

        if response_model is GoalWorkbenchDraft:
            return GoalWorkbenchDraft(
                phase="mini_clarity",
                depth_mode="light",
                goal_type="study_decision",
                goal_summary="Compare study, work, and timing constraints.",
                collected_fields=GoalWorkbenchFields(
                    constraints=["timing pressure"],
                    evidence={"constraint": ["deadline or pressure"]},
                ),
                missing_fields=["timeline"],
                next_action="clarify the first pressure point",
                reflection_text=(
                    "Studio mock response: you are comparing study, work, and timing "
                    "constraints."
                ),
                direction_text=(
                    "The next useful step is to separate the education decision from "
                    "the immediate job decision."
                ),
                clarification_question="Which option has the deadline or pressure first?",
                route_decision=GoalWorkbenchRouteDecision(
                    target_flow="stay_goal_companion",
                    reason="Local Studio goal-flow fixture.",
                ),
                internal_rationale="Local Studio goal-flow fixture.",
            )  # type: ignore[return-value]

        if response_model is ResourceResponseDraft:
            return ResourceResponseDraft(
                phase="resource_search",
                depth_mode="light",
                reflection_text=(
                    "Studio mock response: resource routing can prepare planning "
                    "material without touching expert retrieval."
                ),
                direction_text="Use this Studio path to inspect resource intent without Phase 6 cards.",
                response_reason="Local Studio resource-flow fixture.",
            )  # type: ignore[return-value]

        if response_model is ExpertPlanningDraft:
            return ExpertPlanningDraft(
                phase="expert_elevation",
                depth_mode="light",
                reflection_text=(
                    "Studio mock response: the user is explicitly asking for mentor "
                    "routing."
                ),
                should_retrieve_experts=True,
                should_generate_readiness=True,
                response_reason="Local Studio expert-routing fixture.",
            )  # type: ignore[return-value]

        if response_model is CorrectionResponseDraft:
            return CorrectionResponseDraft(
                phase="repair",
                depth_mode="light",
                reflection_text=(
                    "Studio mock response: I updated only grounded prior context and "
                    "did not start a new goal extraction."
                ),
                response_reason="Local Studio correction fixture.",
            )  # type: ignore[return-value]

        if response_model is RecommendationBundle:
            return RecommendationBundle(
                expert_elevation=ExpertElevationDraft(
                    intro=(
                        "Studio mock response: these mentors were selected after "
                        "deterministic scoring."
                    ),
                    reason_bullets=[
                        "The selected mentor matches the stated decision context.",
                        "The slot was allocated by deterministic scoring.",
                    ],
                    expert_card_reasons={
                        "33333333-3333-4333-8333-333333333333": (
                            "Strong fit for early-career and study-work decisions."
                        )
                    },
                ),
                session_readiness=SessionReadinessDraft(
                    summary="Bring the options, deadlines, and constraints you want to compare.",
                    focus_areas=["decision clarity", "study-work tradeoff"],
                    decisions_to_clarify=["masters timing", "job search priority"],
                    constraints_to_share=["timeline", "location"],
                    questions_to_ask=["What decision should I make first?"],
                ),
            )  # type: ignore[return-value]

        if response_model is ResponseRepairBundle:
            return ResponseRepairBundle(
                strategy=ConversationStrategy(
                    phase="mini_clarity",
                    reflection_text="Studio mock response repaired into visible content.",
                    response_reason="Local Studio repair fixture.",
                ),
                mini_framework=None,
                repair_reason="Studio repair fixture.",
            )  # type: ignore[return-value]

        raise AssertionError(f"Studio provider has no fixture for {response_model}")

    def _supervisor_decision(self, normalized: str) -> ConversationSupervisorDecision:
        if "mentor" in normalized or "expert" in normalized:
            return ConversationSupervisorDecision(
                conversation_act="expert_request",
                active_flow="expert_matching",
                interrupted_flow=None,
                resume_available=False,
                flow_confidence=0.96,
                turn_policy=_policy_for(
                    allow_extraction=True,
                    allow_tools=True,
                    allow_recommendations=True,
                    allow_memory_updates=True,
                    allow_question=True,
                    response_mode="goal_companion",
                ),
                rationale="Studio fixture: explicit expert request.",
            )
        if "resource" in normalized or "course" in normalized or "material" in normalized:
            return ConversationSupervisorDecision(
                conversation_act="resource_request",
                active_flow="resource_search",
                interrupted_flow=None,
                resume_available=False,
                flow_confidence=0.94,
                turn_policy=_policy_for(
                    allow_extraction=True,
                    allow_tools=True,
                    allow_recommendations=True,
                    allow_memory_updates=True,
                    allow_question=True,
                    response_mode="goal_companion",
                ),
                rationale="Studio fixture: explicit resource request.",
            )
        if normalized.startswith("actually"):
            return ConversationSupervisorDecision(
                conversation_act="correction",
                active_flow="repair",
                interrupted_flow="goal_companion",
                resume_available=True,
                flow_confidence=0.91,
                turn_policy=_policy_for(
                    allow_extraction=True,
                    allow_tools=False,
                    allow_recommendations=False,
                    allow_memory_updates=True,
                    allow_question=True,
                    response_mode="repair",
                ),
                rationale="Studio fixture: bounded correction request.",
            )
        if normalized in {"hi", "hey", "hello"} or "joke" in normalized:
            return ConversationSupervisorDecision(
                conversation_act="chitchat",
                active_flow="soft_response",
                interrupted_flow="goal_companion" if "joke" in normalized else None,
                resume_available="joke" in normalized,
                flow_confidence=0.97,
                turn_policy=_policy_for(
                    allow_extraction=False,
                    allow_tools=False,
                    allow_recommendations=False,
                    allow_memory_updates=False,
                    allow_question=False,
                    response_mode="soft_response",
                ),
                rationale="Studio fixture: soft conversational turn.",
            )
        return ConversationSupervisorDecision(
            conversation_act="goal_help",
            active_flow="goal_companion",
            interrupted_flow=None,
            resume_available=False,
            flow_confidence=0.86,
            turn_policy=_policy_for(
                allow_extraction=True,
                allow_tools=False,
                allow_recommendations=False,
                allow_memory_updates=True,
                allow_question=True,
                response_mode="goal_companion",
            ),
            rationale="Studio fixture: goal-companion turn.",
        )

    def _extracted_signals(self, normalized: str) -> ExtractedSignals:
        if "mentor" in normalized or "expert" in normalized:
            return ExtractedSignals(
                primary_intent="career_guidance",
                secondary_intents=["expert_guidance", "study_work_decision"],
                desired_outcomes=["decision_clarity"],
                user_stage="student",
                emotions=["uncertainty"],
                urgency="medium",
                geography=["Australia"],
                industries=["technology"],
                constraints=["timeline"],
                clarity_level="medium",
                explicit_expert_request=True,
                evidence={"intent": ["Recommend mentors"]},
                confidence={"intent": 0.9, "outcome": 0.8, "stage": 0.75},
            )
        return ExtractedSignals(
            primary_intent="study_work_decision",
            secondary_intents=["study_abroad", "career_planning"],
            desired_outcomes=["decision_clarity"],
            user_stage="student",
            emotions=["uncertainty"],
            urgency="medium",
            geography=["Australia"],
            industries=["technology"],
            constraints=["timeline"],
            clarity_level="low",
            evidence={"intent": ["masters in Australia and getting a job"]},
            confidence={"intent": 0.86, "outcome": 0.8, "stage": 0.7},
        )

    def _correction_patch(self, normalized: str) -> CorrectionPatchDraft:
        if "region beta" in normalized and "region alpha" in normalized:
            return CorrectionPatchDraft(
                supported_correction=True,
                geography_add=["Region Beta"],
                geography_remove=["Region Alpha"],
                confidence=0.92,
                rationale="Studio fixture: grounded geography correction.",
            )
        return CorrectionPatchDraft(
            supported_correction=False,
            confidence=0.25,
            rationale="Studio fixture: no bounded field can be patched safely.",
        )


class StudioMockPlatformClient:
    def __init__(self) -> None:
        self.current_user_message = "Hi"
        self.persisted_payloads: list[dict[str, Any]] = []
        self.failed_payloads: list[dict[str, Any]] = []

    async def start_graph_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "graphRunId": STUDIO_GRAPH_RUN_ID,
            "userTurnId": STUDIO_USER_TURN_ID,
        }

    async def get_policy_context(
        self,
        *,
        conversation_id: str,
        actor: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "conversation": {
                "id": conversation_id,
                "phase": "discovery",
                "depthMode": "light",
                "signalSnapshot": self._signal_snapshot_for_current_message(),
            },
            "turns": self._prior_turns_for_current_message(),
            "memoryItems": self._memory_items_for_actor(actor),
            "policy": {
                "canBookSessions": True,
                "canRecommendExperts": True,
                "canRecommendResources": True,
                "maxExperts": 3,
                "bookingOwner": "platform",
            },
        }

    async def get_expert_candidates(
        self,
        *,
        conversation_id: str,
        actor: dict[str, Any],
        signal_snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        return {"candidates": [_studio_candidate()]}

    async def persist(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.persisted_payloads.append(payload)
        return {
            "conversation": {"id": payload["conversationId"]},
            "assistantTurn": {"id": "66666666-6666-4666-8666-666666666666"},
            "graphRunId": payload.get("graphRunId"),
            "recommendationRunId": (
                "55555555-5555-4555-8555-555555555555"
                if payload.get("recommendationRun")
                else None
            ),
            "studio": True,
        }

    async def mark_graph_run_failed(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.failed_payloads.append(payload)
        return {"graphRun": {"id": payload.get("graphRunId"), "status": "failed"}}

    def _signal_snapshot_for_current_message(self) -> dict[str, Any]:
        normalized = self.current_user_message.lower()
        if normalized.startswith("actually"):
            return {
                "supported_use_case": True,
                "primary_intent": "study_abroad",
                "intents": ["study_abroad", "career_planning"],
                "outcomes": ["decision_clarity"],
                "stage": "student",
                "emotions": ["uncertainty"],
                "urgency": "medium",
                "geography": ["Region Alpha"],
                "industries": ["technology"],
                "constraints": ["timeline"],
                "clarity_level": "low",
                "consent_signal": "unsure",
                "explicit_expert_request": False,
            }
        if "mentor" in normalized or "expert" in normalized:
            return {
                "supported_use_case": True,
                "primary_intent": "career_guidance",
                "intents": ["career_guidance", "expert_guidance", "study_work_decision"],
                "outcomes": ["decision_clarity"],
                "stage": "student",
                "emotions": ["uncertainty"],
                "urgency": "medium",
                "geography": ["Australia"],
                "industries": ["technology"],
                "constraints": ["timeline"],
                "clarity_level": "medium",
                "consent_signal": "yes",
                "explicit_expert_request": True,
            }
        return {}

    def _prior_turns_for_current_message(self) -> list[dict[str, Any]]:
        normalized = self.current_user_message.lower()
        turns: list[dict[str, Any]] = []
        if "joke" in normalized or normalized.startswith("actually") or "mentor" in normalized:
            turns.extend(
                [
                    {
                        "id": "studio-prior-user-1",
                        "actor": "user",
                        "inputText": "I need help deciding between a study path and a job path",
                    },
                    {
                        "id": "studio-prior-assistant-1",
                        "actor": "assistant",
                        "responseBlocks": [
                            {
                                "type": "reflection",
                                "content": "Studio prior turn: comparing study and work paths.",
                            }
                        ],
                    },
                ]
            )
        turns.append(
            {
                "id": STUDIO_USER_TURN_ID,
                "actor": "user",
                "inputText": self.current_user_message,
            }
        )
        return turns

    def _memory_items_for_actor(self, actor: dict[str, Any]) -> list[dict[str, Any]]:
        if not actor.get("authenticated"):
            return []
        return [
            {
                "id": "studio-memory-1",
                "memoryType": "decision_context",
                "content": "User is comparing study abroad with getting a job.",
                "confidence": 0.8,
            }
        ]


def _studio_candidate() -> dict[str, Any]:
    return {
        "mentorProfileId": "33333333-3333-4333-8333-333333333333",
        "mentorUserId": "studio-mentor-user-1",
        "name": "Studio Career Mentor",
        "title": "Career Strategy Mentor",
        "company": "Young Minds",
        "industry": "technology",
        "headline": "Helps students compare study and job paths.",
        "about": "Studio fixture mentor for local graph inspection.",
        "image": None,
        "location": "Australia",
        "hourlyRate": 60,
        "currency": "GBP",
        "experienceYears": 8,
        "expertise": ["career guidance", "study work decision", "decision clarity"],
        "intentTags": ["career_guidance", "expert_guidance", "study_work_decision"],
        "outcomeTags": ["decision_clarity"],
        "industryTags": ["technology"],
        "personaFitTags": ["student"],
        "keywordTrustScore": 0.8,
        "contentAuthorityScore": 0.7,
        "qualityScore": 0.9,
        "conversionScore": 0.5,
        "allocationSnapshot": {},
        "metadataQualityStatus": "studio_fixture",
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


STUDIO_PROVIDER = StudioFakeProvider()
STUDIO_PLATFORM_CLIENT = StudioMockPlatformClient()


async def _prepare_studio_state(state: InfinityGraphState) -> dict[str, Any]:
    user_message = str(
        state.get("user_message")
        or state.get("input")
        or state.get("message")
        or STUDIO_SAMPLE_INPUTS[0]
    )
    actor = dict(
        state.get("actor")
        or {
            "userId": "studio-user",
            "anonymousSessionId": None,
            "surface": "langgraph_studio",
            "authenticated": True,
        }
    )
    actor.setdefault("surface", "langgraph_studio")
    actor.setdefault("authenticated", bool(actor.get("userId")))
    STUDIO_PLATFORM_CLIENT.current_user_message = user_message
    return {
        "trace_id": str(state.get("trace_id") or uuid4()),
        "graph_version": GRAPH_VERSION,
        "graph_run_id": str(state.get("graph_run_id") or STUDIO_GRAPH_RUN_ID),
        "user_turn_id": str(state.get("user_turn_id") or STUDIO_USER_TURN_ID),
        "conversation_id": str(state.get("conversation_id") or STUDIO_CONVERSATION_ID),
        "user_message": user_message,
        "actor": actor,
        "node_traces": [],
        "model_calls": [],
        "selected_expert_ids": [],
        "candidate_count": 0,
        NODE_SUMMARY_KEY: {
            "studio": True,
            "input": user_message,
            "runtime": "mock_platform_and_fake_provider",
        },
    }


def _with_studio_runtime(fn: NodeFn) -> NodeFn:
    async def wrapped(state: InfinityGraphState) -> dict[str, Any]:
        STUDIO_PLATFORM_CLIENT.current_user_message = str(state.get("user_message") or "")
        runtime_state: InfinityGraphState = {
            **state,
            "provider": STUDIO_PROVIDER,
            "platform_client": STUDIO_PLATFORM_CLIENT,  # type: ignore[typeddict-item]
        }
        return await fn(runtime_state)

    return wrapped


def build_studio_graph() -> Any:
    studio_graph = StateGraph(InfinityGraphState)
    studio_graph.add_node(
        "prepare_studio_state",
        _trace_node("prepare_studio_state", _prepare_studio_state),
    )
    studio_graph.add_node(
        "load_context",
        _trace_node("load_context", _with_studio_runtime(_load_context)),
    )
    studio_graph.add_node(
        "classify_conversation_act",
        _trace_node(
            "classify_conversation_act",
            _with_studio_runtime(_classify_conversation_act),
        ),
    )
    studio_graph.add_node(
        "goal_workbench",
        _trace_node("goal_workbench", _with_studio_runtime(_goal_workbench)),
    )
    studio_graph.add_node(
        "patch_correction_context",
        _trace_node(
            "patch_correction_context",
            _with_studio_runtime(_patch_correction_context),
        ),
    )
    studio_graph.add_node(
        "extract_signals",
        _trace_node("extract_signals", _with_studio_runtime(_extract_signals)),
    )
    studio_graph.add_node(
        "normalize_signals",
        _trace_node("normalize_signals", _with_studio_runtime(_normalize_signals)),
    )
    studio_graph.add_node(
        "choose_conversation_step",
        _trace_node(
            "choose_conversation_step",
            _with_studio_runtime(_choose_conversation_step),
        ),
    )
    studio_graph.add_node(
        "generate_strategy",
        _trace_node("generate_strategy", _with_studio_runtime(_generate_strategy)),
    )
    studio_graph.add_node(
        "maybe_generate_framework",
        _trace_node(
            "maybe_generate_framework",
            _with_studio_runtime(_maybe_generate_framework),
        ),
    )
    studio_graph.add_node(
        "maybe_retrieve_experts",
        _trace_node(
            "maybe_retrieve_experts",
            _with_studio_runtime(_maybe_retrieve_experts),
        ),
    )
    studio_graph.add_node(
        "score_candidates",
        _trace_node("score_candidates", _with_studio_runtime(_score_candidates)),
    )
    studio_graph.add_node(
        "allocate_slots",
        _trace_node("allocate_slots", _with_studio_runtime(_allocate_slots)),
    )
    studio_graph.add_node(
        "maybe_generate_expert_elevation",
        _trace_node(
            "maybe_generate_expert_elevation",
            _with_studio_runtime(_maybe_generate_expert_elevation),
        ),
    )
    studio_graph.add_node(
        "maybe_generate_session_readiness",
        _trace_node(
            "maybe_generate_session_readiness",
            _with_studio_runtime(_maybe_generate_session_readiness),
        ),
    )
    studio_graph.add_node(
        "assemble_response_blocks",
        _trace_node(
            "assemble_response_blocks",
            _with_studio_runtime(_assemble_response_blocks),
        ),
    )
    studio_graph.add_node(
        "validate_response",
        _trace_node("validate_response", _with_studio_runtime(_validate_response)),
    )
    studio_graph.add_node(
        "diagnose_response_failure",
        _trace_node(
            "diagnose_response_failure",
            _with_studio_runtime(_diagnose_response_failure),
        ),
    )
    studio_graph.add_node(
        "repair_response",
        _trace_node("repair_response", _with_studio_runtime(_repair_response)),
    )
    studio_graph.add_node(
        "fail_response_quality",
        _trace_node(
            "fail_response_quality",
            _with_studio_runtime(_fail_response_quality),
        ),
    )
    studio_graph.add_node(
        "persist_turn_and_trace",
        _with_studio_runtime(_persist_turn_and_trace),
    )

    studio_graph.add_edge(START, "prepare_studio_state")
    studio_graph.add_edge("prepare_studio_state", "load_context")
    studio_graph.add_edge("load_context", "classify_conversation_act")
    studio_graph.add_conditional_edges(
        "classify_conversation_act",
        _route_after_supervisor,
        {
            "extract_signals": "extract_signals",
            "patch_correction_context": "patch_correction_context",
            "goal_workbench": "goal_workbench",
            "generate_strategy": "generate_strategy",
        },
    )
    studio_graph.add_conditional_edges(
        "goal_workbench",
        lambda state: "validate_response",
        {"validate_response": "validate_response"},
    )
    studio_graph.add_edge("patch_correction_context", "generate_strategy")
    studio_graph.add_edge("extract_signals", "normalize_signals")
    studio_graph.add_edge("normalize_signals", "choose_conversation_step")
    studio_graph.add_edge("choose_conversation_step", "generate_strategy")
    studio_graph.add_conditional_edges(
        "generate_strategy",
        _route_after_strategy,
        {
            "maybe_generate_framework": "maybe_generate_framework",
            "assemble_response_blocks": "assemble_response_blocks",
        },
    )
    studio_graph.add_conditional_edges(
        "maybe_generate_framework",
        _route_after_framework,
        {
            "maybe_retrieve_experts": "maybe_retrieve_experts",
            "assemble_response_blocks": "assemble_response_blocks",
        },
    )
    studio_graph.add_edge("maybe_retrieve_experts", "score_candidates")
    studio_graph.add_edge("score_candidates", "allocate_slots")
    studio_graph.add_edge("allocate_slots", "maybe_generate_expert_elevation")
    studio_graph.add_edge("maybe_generate_expert_elevation", "maybe_generate_session_readiness")
    studio_graph.add_edge("maybe_generate_session_readiness", "assemble_response_blocks")
    studio_graph.add_edge("assemble_response_blocks", "validate_response")
    studio_graph.add_conditional_edges(
        "validate_response",
        _route_after_validation,
        {
            "persist_turn_and_trace": "persist_turn_and_trace",
            "diagnose_response_failure": "diagnose_response_failure",
            "fail_response_quality": "fail_response_quality",
        },
    )
    studio_graph.add_edge("diagnose_response_failure", "repair_response")
    studio_graph.add_edge("repair_response", "assemble_response_blocks")
    studio_graph.add_edge("persist_turn_and_trace", END)
    return studio_graph.compile()


graph = build_studio_graph()

__all__ = [
    "STUDIO_SAMPLE_INPUTS",
    "StudioFakeProvider",
    "StudioMockPlatformClient",
    "build_infinity_graph",
    "build_studio_graph",
    "graph",
]
