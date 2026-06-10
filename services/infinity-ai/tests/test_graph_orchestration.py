import asyncio
import json
from typing import Any

import pytest
from pydantic import BaseModel

from app.core.errors import PlatformBridgeError
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import (
    BoundaryResponseDraft,
    BlockedExpertResponseDraft,
    ConversationStrategy,
    ConversationSupervisorDecision,
    CorrectionPatchDraft,
    CorrectionResponseDraft,
    ExpertElevationDraft,
    ExpertNoMatchDraft,
    ExpertPlanningDraft,
    ExpertRetrievalPlan,
    ExtractedSignals,
    GoalWorkbenchDraft,
    GoalWorkbenchFields,
    GoalWorkbenchRouteDecision,
    GoalWorkbenchSuggestedReply,
    MiniFrameworkDraft,
    MiniFrameworkItem,
    PendingSlotPatch,
    PlanBudgetSignal,
    RecommendationBundle,
    ResponseRepairBundle,
    ResourceResponseDraft,
    SessionReadinessDraft,
    SoftResponseDraft,
    TurnPolicy,
    TurnResolutionDecision,
)
from app.orchestration.graph import (
    FLOW_PHASE_NAMES,
    resolve_persisted_conversation_phase,
    run_graph_pipeline,
)
from app.orchestration.context_pack import CHARS_PER_TOKEN, TURN_RESOLUTION_TOKEN_BUDGET


class FakeProvider(LlmProvider):
    provider_name = "fake"

    def __init__(self, scripted_responses: list[BaseModel] | None = None) -> None:
        self._script: dict[type, list[BaseModel]] = {}
        for response in scripted_responses or []:
            self._script.setdefault(type(response), []).append(response)
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
        self.payloads_by_prompt.setdefault(prompt_id, []).append(user_payload)
        parsed = self._next_response(response_model)
        return LlmCallResult(
            parsed=parsed,
            provider=self.provider_name,
            model="fake-model",
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            prompt_hash=f"hash-{prompt_id}",
            schema_name=response_model.__name__,
            latency_ms=7,
            usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            response_id=f"response-{prompt_id}",
            finish_reason="stop",
            tool_calls=[],
        )

    def _next_response(self, response_model: type) -> BaseModel:
        queue = self._script.get(response_model)
        if queue:
            return queue.pop(0)
        return _default_response_for_model(response_model)


def _provider(*responses: BaseModel) -> FakeProvider:
    return FakeProvider(list(responses))


def _turn_policy(
    *,
    allow_extraction: bool = True,
    allow_tools: bool = False,
    allow_recommendations: bool = False,
    allow_memory_updates: bool = True,
    allow_question: bool = True,
    response_mode: str = "goal_companion",
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


def _supervisor_decision(
    *,
    conversation_act: str = "expert_request",
    active_flow: str = "expert_matching",
    turn_policy: TurnPolicy | None = None,
    interrupted_flow: str | None = None,
    resume_available: bool = False,
    confidence: float = 0.95,
) -> ConversationSupervisorDecision:
    if turn_policy is None:
        turn_policy = _turn_policy(
            allow_extraction=True,
            allow_tools=active_flow in {"expert_matching", "resource_search"},
            allow_recommendations=active_flow in {"expert_matching", "resource_search"},
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion" if active_flow != "soft_response" else "soft_response",
        )
    return ConversationSupervisorDecision(
        conversation_act=conversation_act,  # type: ignore[arg-type]
        active_flow=active_flow,  # type: ignore[arg-type]
        interrupted_flow=interrupted_flow,
        resume_available=resume_available,
        flow_confidence=confidence,
        turn_policy=turn_policy,
        rationale="Scripted supervisor decision for this graph scenario.",
    )


def _soft_supervisor() -> ConversationSupervisorDecision:
    return _supervisor_decision(
        conversation_act="chitchat",
        active_flow="soft_response",
        turn_policy=_turn_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=False,
            response_mode="soft_response",
        ),
    )


def _meta_supervisor() -> ConversationSupervisorDecision:
    return _supervisor_decision(
        conversation_act="meta_question",
        active_flow="soft_response",
        turn_policy=_turn_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=False,
            response_mode="soft_response",
        ),
    )


def _goal_supervisor() -> ConversationSupervisorDecision:
    return _supervisor_decision(
        conversation_act="goal_help",
        active_flow="goal_companion",
        turn_policy=_turn_policy(
            allow_extraction=True,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion",
        ),
    )


def _resource_supervisor() -> ConversationSupervisorDecision:
    return _supervisor_decision(
        conversation_act="resource_request",
        active_flow="resource_search",
        turn_policy=_turn_policy(
            allow_extraction=True,
            allow_tools=True,
            allow_recommendations=True,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion",
        ),
    )


def _expert_supervisor(
    *,
    allow_extraction: bool = True,
    allow_tools: bool = True,
    allow_recommendations: bool = True,
) -> ConversationSupervisorDecision:
    return _supervisor_decision(
        conversation_act="expert_request",
        active_flow="expert_matching",
        turn_policy=_turn_policy(
            allow_extraction=allow_extraction,
            allow_tools=allow_tools,
            allow_recommendations=allow_recommendations,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion",
        ),
    )


def _correction_supervisor() -> ConversationSupervisorDecision:
    return _supervisor_decision(
        conversation_act="correction",
        active_flow="repair",
        interrupted_flow="goal_companion",
        resume_available=True,
        turn_policy=_turn_policy(
            allow_extraction=True,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="repair",
        ),
    )


def _pending_answer_decision(
    *,
    target_flow: str,
    slot_patch: PendingSlotPatch | None = None,
    close_pending_interaction: bool = True,
    pending_interaction_id: str = "pending-1",
) -> TurnResolutionDecision:
    return TurnResolutionDecision(
        resolution_type="answer_to_pending_question",
        confidence=0.95,
        pending_interaction_id=pending_interaction_id,
        target_flow=target_flow,  # type: ignore[arg-type]
        conversation_act="goal_detail_answer" if target_flow == "goal_companion" else "expert_request",
        active_flow=target_flow,  # type: ignore[arg-type]
        slot_patch=slot_patch or PendingSlotPatch(),
        close_pending_interaction=close_pending_interaction,
        skip_supervisor=True,
        internal_rationale="Scripted pending interaction answer.",
    )


def _pending_interrupt_decision(*, pending_interaction_id: str = "pending-1") -> TurnResolutionDecision:
    return TurnResolutionDecision(
        resolution_type="interrupt",
        confidence=0.94,
        pending_interaction_id=pending_interaction_id,
        target_flow="expert_matching",
        conversation_act="chitchat",
        active_flow="soft_response",
        slot_patch=PendingSlotPatch(),
        close_pending_interaction=False,
        skip_supervisor=True,
        internal_rationale="Scripted interruption.",
    )


def _pending_correction_decision(*, pending_interaction_id: str = "pending-1") -> TurnResolutionDecision:
    return TurnResolutionDecision(
        resolution_type="correction",
        confidence=0.92,
        pending_interaction_id=pending_interaction_id,
        target_flow=None,
        conversation_act="correction",
        active_flow="repair",
        slot_patch=PendingSlotPatch(),
        close_pending_interaction=False,
        skip_supervisor=True,
        internal_rationale="Scripted bounded correction.",
    )


def _soft_response(text: str = "Model-generated soft response.") -> SoftResponseDraft:
    return SoftResponseDraft(
        phase="soft_response",
        soft_response_text=text,
        response_reason="Scripted soft response.",
    )


def _resource_response() -> ResourceResponseDraft:
    return ResourceResponseDraft(
        phase="resource_search",
        reflection_text="Model-generated resource preface.",
        direction_text="Model-generated resource direction.",
        response_reason="Scripted resource response.",
    )


def _blocked_expert_response() -> BlockedExpertResponseDraft:
    return BlockedExpertResponseDraft(
        phase="expert_matching",
        user_response_text="Model-generated blocked expert response.",
        internal_rationale="Scripted internal rationale kept out of rendered blocks.",
        ui_intent="sign_in_required_for_expert_routing",
        sign_in_cta_reason="expert_or_memory_continuity_requires_auth",
    )


def _expert_no_match_response() -> ExpertNoMatchDraft:
    return ExpertNoMatchDraft(
        phase="expert_matching",
        user_response_text="Model-generated expert no-match response.",
        internal_rationale="Scripted no-match rationale.",
    )


def _expert_planning_response(
    *,
    selection_intent: str = "specific_relevance",
    should_retrieve: bool = True,
    needs_clarification: bool = False,
) -> ExpertPlanningDraft:
    return ExpertPlanningDraft(
        phase="expert_elevation",
        retrieval_plan=ExpertRetrievalPlan(
            should_retrieve_experts=should_retrieve,
            needs_clarification=needs_clarification,
            clarification_question="Model-generated expert clarification." if needs_clarification else None,
            selection_intent=selection_intent,  # type: ignore[arg-type]
            selection_mode=selection_intent,  # type: ignore[arg-type]
            diversity_goal="broad_discovery" if selection_intent == "open_discovery" else None,
            minimum_candidate_count=1,
            max_selected_count=3,
            internal_rationale="Scripted expert retrieval plan.",
        ),
        should_generate_readiness=should_retrieve,
        response_reason="Scripted expert planning response.",
    )


def _correction_response() -> CorrectionResponseDraft:
    return CorrectionResponseDraft(
        phase="repair",
        reflection_text="Model-generated correction acknowledgement.",
        response_reason="Scripted correction response.",
    )


def _correction_patch(
    *,
    add: list[str] | None = None,
    remove: list[str] | None = None,
    supported: bool = True,
) -> CorrectionPatchDraft:
    return CorrectionPatchDraft(
        supported_correction=supported,
        geography_add=add or [],
        geography_remove=remove or [],
        confidence=0.93 if supported else 0.2,
        rationale="Scripted correction patch.",
    )


def _recommendation_bundle() -> RecommendationBundle:
    return RecommendationBundle(
        expert_elevation=ExpertElevationDraft(
            intro="Model-generated expert elevation.",
            reason_bullets=["Relevant guidance", "Decision support"],
        ),
        session_readiness=SessionReadinessDraft(
            summary="Model-generated session readiness.",
            focus_areas=["decision clarity"],
        ),
    )


def _goal_workbench_initial(
    *,
    region: str = "Region Alpha",
    constraint: str = "budget constraint",
) -> GoalWorkbenchDraft:
    return GoalWorkbenchDraft(
        phase="mini_clarity",
        depth_mode="light",
        goal_type="study_planning",
        goal_summary="Study planning goal with budget constraint.",
        collected_fields=GoalWorkbenchFields(
            geography=[region],
            constraints=[constraint],
            evidence={"geography": [region], "constraint": [constraint]},
        ),
        missing_fields=["budget", "study_level", "subject_field", "timeline"],
        next_action="collect concrete planning details",
        reflection_text="Model-generated reflection for the active study goal.",
        clarification_question="Model-generated clarification asking for level, field, and budget.",
        route_decision=GoalWorkbenchRouteDecision(
            target_flow="stay_goal_companion",
            reason="Create active goal and ask for details.",
        ),
        memory_updates=[],
        internal_rationale="Scripted goal workbench initial state.",
    )


def _goal_workbench_details(
    *,
    budget_text: str = "tiny test budget",
    study_level: str = "doctoral level",
    subject_field: str = "distributed systems",
    region: str = "Region Alpha",
    confirmed_literal: bool | None = None,
    interpretation: str | None = None,
    suggested_reply: GoalWorkbenchSuggestedReply | None = None,
) -> GoalWorkbenchDraft:
    return GoalWorkbenchDraft(
        phase="mini_clarity",
        depth_mode="light",
        goal_type="study_planning",
        goal_summary="Study planning goal with concrete details and feasibility gap.",
        collected_fields=GoalWorkbenchFields(
            budget=PlanBudgetSignal(
                amount=1,
                currency="TEST",
                raw_budget_text=budget_text,
                confirmed_literal=confirmed_literal,
                interpretation=interpretation,  # type: ignore[arg-type]
            ),
            study_level=study_level,
            subject_field=subject_field,
            geography=[region],
            constraints=["budget constraint"],
            feasibility_flags=["budget_feasibility_gap"],
            evidence={
                "budget": [budget_text],
                "study_level": [study_level],
                "subject_field": [subject_field],
                "geography": [region],
            },
        ),
        missing_fields=["timeline", "funding_source"],
        next_action="build feasibility-first next step",
        reflection_text="Model-generated reflection incorporating concrete details.",
        insight_text="Model-generated feasibility insight from the collected fields.",
        direction_text="Model-generated next-step artifact direction.",
        suggested_replies=[suggested_reply] if suggested_reply else [],
        route_decision=GoalWorkbenchRouteDecision(
            target_flow="stay_goal_companion",
            reason="Refine active goal with concrete fields.",
        ),
        memory_updates=[],
        internal_rationale="Scripted goal workbench refinement.",
    )


def _goal_workbench_artifact() -> GoalWorkbenchDraft:
    return GoalWorkbenchDraft(
        phase="framework",
        depth_mode="light",
        goal_type="study_planning",
        goal_summary="Study planning goal with concrete details and feasibility gap.",
        collected_fields=GoalWorkbenchFields(
            budget=PlanBudgetSignal(
                amount=1,
                currency="TEST",
                raw_budget_text="tiny test budget",
                confirmed_literal=True,
                interpretation="literal",
            ),
            study_level="doctoral level",
            subject_field="distributed systems",
            geography=["Region Alpha"],
            constraints=["budget constraint"],
            feasibility_flags=["budget_feasibility_gap"],
        ),
        missing_fields=["funding_source", "application_timeline"],
        next_action="build feasibility checklist",
        insight_text="Model-generated next artifact intro.",
        mini_framework=MiniFrameworkDraft(
            title="Model-generated feasibility checklist",
            intro="Model-generated checklist intro.",
            items=[
                MiniFrameworkItem(title="Cost baseline", body="Model-generated cost check."),
                MiniFrameworkItem(title="Funding path", body="Model-generated funding check."),
                MiniFrameworkItem(title="Backup path", body="Model-generated backup check."),
            ],
        ),
        route_decision=GoalWorkbenchRouteDecision(
            target_flow="stay_goal_companion",
            reason="Proceed to the next planning artifact.",
        ),
        memory_updates=[],
        internal_rationale="Scripted next artifact.",
    )


def _goal_workbench_route(target_flow: str) -> GoalWorkbenchDraft:
    subject_field = "career growth" if target_flow == "expert_matching" else "planning"
    return GoalWorkbenchDraft(
        phase="mini_clarity",
        goal_type="planning",
        goal_summary="Goal workbench route handoff.",
        collected_fields=GoalWorkbenchFields(
            subject_field=subject_field,
            evidence={"subject_field": [subject_field]},
        ),
        missing_fields=[],
        next_action=f"route to {target_flow}",
        direction_text="Model-generated handoff direction.",
        route_decision=GoalWorkbenchRouteDecision(
            target_flow=target_flow,  # type: ignore[arg-type]
            reason="Structured handoff from GoalWorkbench.",
        ),
        memory_updates=[],
        internal_rationale="Scripted route handoff.",
    )


def _default_response_for_model(response_model: type) -> BaseModel:
    if response_model is TurnResolutionDecision:
        return TurnResolutionDecision(
            resolution_type="new_user_intent",
            confidence=0.7,
            pending_interaction_id="pending-1",
            target_flow=None,
            conversation_act=None,
            active_flow=None,
            slot_patch=PendingSlotPatch(),
            close_pending_interaction=False,
            skip_supervisor=False,
            internal_rationale="Default scripted turn resolution.",
        )
    if response_model is ConversationSupervisorDecision:
        return _expert_supervisor()
    if response_model is ExtractedSignals:
        return ExtractedSignals(
            primary_intent="career_growth",
            secondary_intents=["expert_guidance"],
            desired_outcomes=["clarity"],
            user_stage="early_career",
            emotions=["uncertainty"],
            constraints=["timeline"],
            urgency="medium",
            explicit_expert_request=True,
            confidence={"intent": 0.9, "outcome": 0.8},
        )
    if response_model is GoalWorkbenchDraft:
        return _goal_workbench_initial()
    if response_model is SoftResponseDraft:
        return _soft_response()
    if response_model is ResponseRepairBundle:
        return ResponseRepairBundle(
            strategy=ConversationStrategy(
                phase="soft_response",
                soft_response_text="Model-generated repaired response.",
                response_reason="Scripted repair response.",
            ),
            repair_reason="Repair current response.",
            grounded_fact_effect="preserves_grounded_facts",
        )
    if response_model is BoundaryResponseDraft:
        return BoundaryResponseDraft(
            phase="safety",
            soft_response_text="Model-generated boundary response.",
            response_reason="Scripted boundary response.",
        )
    if response_model is BlockedExpertResponseDraft:
        return _blocked_expert_response()
    if response_model is ExpertNoMatchDraft:
        return _expert_no_match_response()
    if response_model is ExpertPlanningDraft:
        return _expert_planning_response()
    if response_model is ResourceResponseDraft:
        return _resource_response()
    if response_model is CorrectionResponseDraft:
        return _correction_response()
    if response_model is CorrectionPatchDraft:
        return _correction_patch(supported=False)
    if response_model is RecommendationBundle:
        return _recommendation_bundle()
    raise AssertionError(f"Unexpected response model {response_model}")


class FakePlatformClient:
    def __init__(
        self,
        *,
        fail_expert_retrieval: bool = False,
        signal_snapshot: dict[str, Any] | None = None,
        can_recommend_experts: bool | None = None,
        can_book_sessions: bool | None = None,
        can_recommend_resources: bool = True,
        expert_candidates: list[dict[str, Any]] | None = None,
        resource_candidates: list[dict[str, Any]] | None = None,
        turns: list[dict[str, Any]] | None = None,
        memory_items: list[dict[str, Any]] | None = None,
    ) -> None:
        self.calls: list[str] = []
        self.fail_expert_retrieval = fail_expert_retrieval
        self.signal_snapshot = signal_snapshot or {}
        self.can_recommend_experts = can_recommend_experts
        self.can_book_sessions = can_book_sessions
        self.can_recommend_resources = can_recommend_resources
        self.expert_candidates = expert_candidates
        self.resource_candidates = resource_candidates
        self.turns = turns
        self.memory_items = memory_items or []
        self.persist_payload: dict[str, Any] | None = None
        self.failed_payload: dict[str, Any] | None = None

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
                        "inputText": "Recommend mentors",
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
                "canRecommendResources": self.can_recommend_resources,
                "resourceVisibility": "public_only",
                "requiresAuthForBooking": not bool(actor.get("authenticated")),
                "maxExperts": 3,
                "featureFlags": {"crossChatMemoryEnabled": True},
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
        if self.fail_expert_retrieval:
            raise PlatformBridgeError("candidate retrieval failed")
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
                    "intentTags": ["career_growth", "expert_guidance"],
                    "outcomeTags": ["clarity"],
                    "industryTags": ["technology"],
                    "personaFitTags": ["early_career"],
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
        candidates = self.resource_candidates
        if candidates is None:
            candidates = [
                {
                    "resourceId": "66666666-6666-6666-6666-666666666666",
                    "resourceType": "course",
                    "title": "Study Abroad Decision Planning",
                    "description": "A public course for comparing masters options and career paths.",
                    "href": "/courses/66666666-6666-6666-6666-666666666666",
                    "source": "courses",
                    "visibility": "public",
                    "providerName": "Young Minds",
                    "category": "Career Planning",
                    "difficulty": "BEGINNER",
                    "durationMinutes": 90,
                    "price": 0,
                    "currency": "USD",
                    "image": None,
                    "tags": ["study abroad", "career planning"],
                    "learningOutcomes": ["Compare masters and job options"],
                    "intentTags": ["study_abroad", "career_growth"],
                    "outcomeTags": ["clarity", "strategic_sequencing"],
                    "avgRating": 4.7,
                    "reviewCount": 8,
                    "enrollmentCount": 42,
                    "metadata": {},
                }
            ]
        return {"candidates": candidates, "visibility": "public", "policyBlocked": False}

    async def persist(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("persist")
        self.persist_payload = payload
        self.signal_snapshot = payload["stateUpdates"]["signalSnapshot"]
        prior_turns = self.turns if self.turns is not None else []
        self.turns = [
            *prior_turns,
            {
                "id": payload.get("userTurnId") or "22222222-2222-2222-2222-222222222222",
                "actor": "user",
                "inputText": payload["userMessage"],
            },
            {
                "id": "44444444-4444-4444-4444-444444444444",
                "actor": "assistant",
                "responseBlocks": payload["responseBlocks"],
            },
        ]
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


def _expert_candidate(
    *,
    profile_id: str = "33333333-3333-3333-3333-333333333333",
    user_id: str = "mentor-user-1",
    name: str = "Career Mentor",
    industry: str = "technology",
    expertise: list[str] | None = None,
    intent_tags: list[str] | None = None,
    outcome_tags: list[str] | None = None,
    industry_tags: list[str] | None = None,
    quality_score: float = 0.9,
    conversion_score: float = 0.5,
) -> dict[str, Any]:
    return {
        "mentorProfileId": profile_id,
        "mentorUserId": user_id,
        "name": name,
        "title": "Mentor",
        "company": "Young Minds",
        "industry": industry,
        "headline": "Experienced mentor",
        "about": "Supports practical decision-making.",
        "image": None,
        "location": "Region Alpha",
        "hourlyRate": 60,
        "currency": "GBP",
        "experienceYears": 8,
        "expertise": expertise or ["career growth", "decision clarity"],
        "intentTags": intent_tags or ["career_growth", "expert_guidance"],
        "outcomeTags": outcome_tags or ["clarity"],
        "industryTags": industry_tags or [industry],
        "personaFitTags": ["early_career"],
        "keywordTrustScore": 0.8,
        "contentAuthorityScore": 0.7,
        "qualityScore": quality_score,
        "conversionScore": conversion_score,
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


def test_graph_pipeline_records_nodes_llm_calls_and_candidate_scores():
    platform = FakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(),
                _recommendation_bundle(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Recommend mentors",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    assert platform.calls[:2] == ["start_graph_run", "get_policy_context"]
    assert platform.calls[-1] == "persist"
    assert result["persistedGraphRunId"] == "11111111-1111-1111-1111-111111111111"
    assert result["recommendationRun"]["selectedCount"] == 1
    assert result["recommendationRun"]["candidates"][0]["finalScore"] > 0

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert node_names == [
        "load_context",
        "classify_conversation_act",
        "extract_signals",
        "normalize_signals",
        "choose_conversation_step",
        "generate_strategy",
        "maybe_generate_framework",
        "maybe_retrieve_experts",
        "score_candidates",
        "allocate_slots",
        "diagnose_expert_selection",
        "maybe_generate_expert_elevation",
        "maybe_generate_session_readiness",
        "assemble_response_blocks",
        "validate_response",
    ]
    assert trace_metadata["pendingPersistNodeTrace"]["node"] == "persist_turn_and_trace"
    assert all(trace["status"] == "completed" for trace in trace_metadata["nodeTraces"])
    assert trace_metadata["turnSpec"]["active_flow"] == "expert_matching"
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is True
    assert trace_metadata["qualityReport"]["passed"] is True

    model_calls = trace_metadata["llmCalls"]
    assert [call["promptId"] for call in model_calls] == [
        "conversation_supervisor",
        "signal_extraction",
        "expert_matching_planner",
        "expert_elevation_composer",
    ]
    assert all(call["provider"] == "fake" for call in model_calls)
    assert all(call["totalTokens"] == 15 for call in model_calls)


def test_chitchat_turn_skips_goal_extraction_tools_and_questions():
    platform = FakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _soft_supervisor(),
                _soft_response("A quick one from the model."),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Tell me a joke",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert "get_expert_candidates" not in platform.calls
    assert result["signalUpdates"] == []
    assert result["recommendationRun"] is None
    assert result["memoryUpdates"] == []
    assert result["responseBlocks"] == [
        {"type": "soft_response", "content": "A quick one from the model."}
    ]

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "chitchat"
    assert trace_metadata["activeFlow"] == "soft_response"
    assert trace_metadata["turnPolicy"]["allow_extraction"] is False
    assert trace_metadata["turnPolicy"]["allow_question"] is False

    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "classify_conversation_act" in node_names
    assert "extract_signals" not in node_names
    assert "normalize_signals" not in node_names
    assert "maybe_retrieve_experts" not in node_names
    assert "score_candidates" not in node_names
    assert "allocate_slots" not in node_names
    assert "validate_response" in node_names
    assert trace_metadata["turnSpec"]["active_flow"] == "soft_response"
    assert trace_metadata["qualityReport"]["passed"] is True

    model_calls = trace_metadata["llmCalls"]
    assert [call["promptId"] for call in model_calls] == [
        "conversation_supervisor",
        "soft_response_composer",
    ]


def test_soft_greeting_question_mark_content_is_preserved_without_repair():
    platform = FakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _soft_supervisor(),
                _soft_response("This model soft response includes a question?"),
            ),
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
        {
            "type": "soft_response",
            "content": "This model soft response includes a question?",
        }
    ]
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["qualityReport"]["passed"] is True
    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == [
        "conversation_supervisor",
        "soft_response_composer",
    ]
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "repair_response" not in node_names


def test_meta_followup_does_not_repeat_prior_soft_response():
    stale_text = "I'm not able to tell jokes, but I can help you with a variety of tasks."
    platform = FakePlatformClient(
        turns=[
            {
                "id": "99999999-9999-9999-9999-999999999999",
                "actor": "user",
                "inputText": "Hi tell me a joke",
            },
            {
                "id": "88888888-8888-8888-8888-888888888888",
                "actor": "assistant",
                "responseBlocks": [
                    {
                        "type": "soft_response",
                        "content": stale_text,
                    }
                ],
            },
            {
                "id": "22222222-2222-2222-2222-222222222222",
                "actor": "user",
                "inputText": "what tasks?",
            },
        ]
    )

    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _meta_supervisor(),
                _soft_response(stale_text),
                ResponseRepairBundle(
                    strategy=ConversationStrategy(
                        phase="soft_response",
                        soft_response_text=(
                            "I can help clarify decisions, compare next steps, find public resources, and prepare you for mentor guidance when that is appropriate."
                        ),
                        response_reason="Scripted repair for stale meta response.",
                    ),
                    repair_reason="Answer current meta question instead of repeating a prior assistant turn.",
                    grounded_fact_effect="preserves_grounded_facts",
                ),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="what tasks?",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert result["signalUpdates"] == []
    assert result["recommendationRun"] is None
    assert result["memoryUpdates"] == []
    assert result["responseBlocks"] == [
        {
            "type": "soft_response",
            "content": (
                "I can help clarify decisions, compare next steps, find public resources, and prepare you for mentor guidance when that is appropriate."
            ),
        }
    ]

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "meta_question"
    assert trace_metadata["activeFlow"] == "soft_response"
    assert trace_metadata["turnPolicy"]["allow_extraction"] is False
    assert trace_metadata["turnPolicy"]["allow_tools"] is False
    assert trace_metadata["turnPolicy"]["allow_recommendations"] is False

    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "extract_signals" not in node_names
    assert "maybe_retrieve_experts" not in node_names
    assert "maybe_retrieve_resources" not in node_names
    assert "repair_response" in node_names
    assert any(
        trace["node"] == "validate_response"
        and "no_stale_soft_response" in trace["summary"]["failedGates"]
        for trace in trace_metadata["nodeTraces"]
    )
    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == [
        "conversation_supervisor",
        "soft_response_composer",
        "response_repair",
    ]


def test_guest_resource_request_returns_public_resource_cards_without_sign_in_cta():
    platform = FakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _resource_supervisor(),
                ExtractedSignals(primary_intent="resource_search", desired_outcomes=["materials"]),
                _resource_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Recommend resources",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert "get_expert_candidates" not in platform.calls
    assert "get_resource_candidates" in platform.calls
    assert result["recommendationRun"]["algorithmVersion"] == "infinity-resource-v1"
    assert result["recommendationRun"]["selectedCount"] == 1
    assert result["recommendationRun"]["traceMetadata"]["runType"] == "resources"
    assert result["recommendationRun"]["candidates"] == []
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "resource_cards" in block_types
    assert "expert_cards" not in block_types
    assert "sign_in_cta" not in block_types
    resource_block = next(block for block in result["responseBlocks"] if block["type"] == "resource_cards")
    assert resource_block["resources"][0]["resourceId"] == "66666666-6666-6666-6666-666666666666"
    assert resource_block["resources"][0]["href"] == "/courses/66666666-6666-6666-6666-666666666666"

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "resource_request"
    assert trace_metadata["activeFlow"] == "resource_search"
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is False
    assert trace_metadata["selectedResourceIds"] == ["66666666-6666-6666-6666-666666666666"]

    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "extract_signals" in node_names
    assert "normalize_signals" in node_names
    assert "maybe_retrieve_resources" in node_names
    assert "score_resource_candidates" in node_names
    assert "allocate_resource_slots" in node_names
    assert "maybe_retrieve_experts" not in node_names
    assert "score_candidates" not in node_names
    assert "allocate_slots" not in node_names

    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == [
        "conversation_supervisor",
        "signal_extraction",
        "resource_response_composer",
    ]


def test_goal_workbench_refines_active_goal_and_builds_next_plan():
    platform = FakePlatformClient(turns=[])
    actor = {
        "userId": "user-1",
        "anonymousSessionId": None,
        "surface": "landing_page",
        "authenticated": True,
    }

    first = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _goal_supervisor(),
                _goal_workbench_initial(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="initial planning request",
            actor=actor,
        )
    )
    first_snapshot = first["stateUpdates"]["signalSnapshot"]
    assert first_snapshot["active_goal"]["goal_type"] == "study_planning"
    assert first_snapshot["active_goal"]["next_action"] == "collect concrete planning details"
    assert first_snapshot["active_goal"]["last_artifact_hash"]
    assert "get_expert_candidates" not in platform.calls
    assert "get_resource_candidates" not in platform.calls
    assert first["recommendationRun"] is None
    first_block_types = [block["type"] for block in first["responseBlocks"]]
    assert first_block_types == ["reflection", "clarification"]
    assert all("suggestedReply" not in block for block in first["responseBlocks"])
    assert "mini_framework" not in first_block_types
    assert "micro_consent" not in first_block_types
    assert len(first["responseBlocks"]) <= 3
    first_trace = platform.persist_payload["traceMetadata"]
    assert [call["promptId"] for call in first_trace["llmCalls"]] == [
        "conversation_supervisor",
        "goal_workbench",
    ]
    assert "goal_workbench" in [
        trace["node"] for trace in first_trace["nodeTraces"]
    ]
    assert "extract_signals" not in [
        trace["node"] for trace in first_trace["nodeTraces"]
    ]

    platform.calls.clear()
    second = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _pending_answer_decision(
                    target_flow="goal_companion",
                    slot_patch=PendingSlotPatch(goal_clarification=["concrete detail answer"]),
                    pending_interaction_id=first_snapshot["pending_interaction"]["pending_interaction_id"],
                ),
                _goal_workbench_details(
                    budget_text="tiny test budget",
                    study_level="doctoral level",
                    subject_field="distributed systems",
                    region="Region Alpha",
                    suggested_reply=GoalWorkbenchSuggestedReply(
                        text="Show funding routes",
                        kind="meaningful_action",
                        action_kind="planning_artifact",
                    ),
                ),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="concrete planning details",
            actor=actor,
        )
    )
    assert "get_expert_candidates" not in platform.calls
    assert "get_resource_candidates" not in platform.calls
    assert second["recommendationRun"] is None
    assert second["memoryUpdates"] == []
    previous_response_blocks = second["responseBlocks"]

    snapshot = second["stateUpdates"]["signalSnapshot"]
    assert snapshot["budget"] == {
        "amount": 1.0,
        "currency": "TEST",
        "raw_budget_text": "tiny test budget",
    }
    assert snapshot["study_level"] == "doctoral level"
    assert snapshot["subject_field"] == "distributed systems"
    assert "Region Alpha" in snapshot["geography"]
    assert "budget constraint" in snapshot["constraints"]
    assert "budget_feasibility_gap" in snapshot["feasibility_flags"]
    active_goal = snapshot["active_goal"]
    assert active_goal["plan_version"] == 2
    assert active_goal["collected_fields"]["budget"]["raw_budget_text"] == "tiny test budget"
    assert active_goal["collected_fields"]["study_level"] == "doctoral level"
    assert active_goal["collected_fields"]["subject_field"] == "distributed systems"
    assert "geography" in active_goal["collected_fields"]
    assert active_goal["next_action"] == "build feasibility-first next step"

    visible_response = json.dumps(second["responseBlocks"])
    assert "concrete details" in visible_response or "feasibility" in visible_response
    assert "I can help" not in visible_response

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "goal_help"
    assert trace_metadata["activeFlow"] == "goal_companion"
    assert trace_metadata["turnPolicy"]["allow_extraction"] is False
    assert trace_metadata["qualityReport"]["passed"] is True
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "goal_workbench" in node_names
    assert "turn_resolution" in node_names
    assert "apply_pending_answer" in node_names
    assert "classify_conversation_act" not in node_names
    assert "extract_signals" not in node_names
    assert "normalize_signals" not in node_names
    assert "maybe_retrieve_experts" not in node_names
    assert "maybe_retrieve_resources" not in node_names
    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == [
        "turn_resolution",
        "goal_workbench",
    ]

    platform.calls.clear()
    third = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _goal_supervisor(),
                _goal_workbench_details(
                    budget_text="tiny test budget",
                    study_level="doctoral level",
                    subject_field="distributed systems",
                    region="Region Alpha",
                    confirmed_literal=True,
                    interpretation="literal",
                ),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="literal budget confirmation",
            actor=actor,
        )
    )

    assert "get_expert_candidates" not in platform.calls
    assert "get_resource_candidates" not in platform.calls
    assert third["recommendationRun"] is None
    third_snapshot = third["stateUpdates"]["signalSnapshot"]
    assert third_snapshot["budget"] == {
        "amount": 1.0,
        "currency": "TEST",
        "raw_budget_text": "tiny test budget",
        "confirmed_literal": True,
        "interpretation": "literal",
    }
    assert third_snapshot["budget_confirmed_literal"] is True
    third_active_goal = third_snapshot["active_goal"]
    assert third_active_goal["plan_version"] == 3
    assert third_active_goal["collected_fields"]["budget"]["confirmed_literal"] is True
    assert third_active_goal["collected_fields"]["budget"]["interpretation"] == "literal"
    assert third_active_goal["collected_fields"]["study_level"] == "doctoral level"
    assert third_active_goal["collected_fields"]["subject_field"] == "distributed systems"
    assert "Region Alpha" in third_active_goal["collected_fields"]["geography"]

    third_visible_response = json.dumps(third["responseBlocks"])
    assert "feasibility" in third_visible_response or "concrete details" in third_visible_response
    assert "placeholder" not in third_visible_response.lower()

    third_trace = platform.persist_payload["traceMetadata"]
    third_node_names = [trace["node"] for trace in third_trace["nodeTraces"]]
    assert "goal_workbench" in third_node_names
    assert "response_repair" not in third_node_names
    assert "maybe_retrieve_experts" not in third_node_names
    assert "maybe_retrieve_resources" not in third_node_names
    assert "generate_strategy" not in third_node_names
    assert third_trace["qualityReport"]["passed"] is True

    platform.calls.clear()
    fourth = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _goal_supervisor(),
                _goal_workbench_artifact(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="proceed with the next artifact",
            actor=actor,
        )
    )

    assert "get_expert_candidates" not in platform.calls
    assert "get_resource_candidates" not in platform.calls
    assert fourth["responseBlocks"] != previous_response_blocks
    fourth_snapshot = fourth["stateUpdates"]["signalSnapshot"]
    assert fourth_snapshot["active_goal"]["plan_version"] == 4
    assert fourth_snapshot["active_goal"]["last_artifact_hash"] != active_goal["last_artifact_hash"]
    assert "mini_framework" in [block["type"] for block in fourth["responseBlocks"]]


def test_life_direction_goal_does_not_inherit_study_obligations_or_unknown_budget():
    pending = {
        "pending_interaction_id": "pending-life-direction",
        "status": "open",
        "target_flow": "goal_companion",
        "question_type": "goal_clarification",
        "expected_answer_schema": {
            "allowed_slot_patch_fields": ["goal_clarification", "budget_interpretation"],
        },
        "slot_targets": ["goal_clarification"],
        "original_question_text": "Model-generated question about the kind of stuckness.",
        "created_turn_id": "assistant-turn-1",
        "expires_after_turns": 4,
        "turns_elapsed": 0,
    }
    active_goal = {
        "active_goal_key": "life-goal-1",
        "goal_type": "life_direction",
        "goal_summary": "User feels lost and wants help deciding what to do next.",
        "collected_fields": {},
        "missing_fields": ["budget", "study_level", "area_of_life"],
        "next_action": "clarify area of life",
        "plan_version": 1,
    }
    platform = FakePlatformClient(
        signal_snapshot={
            "active_goal": active_goal,
            "pending_interaction": pending,
        },
        turns=[],
    )
    provider = _provider(
        _pending_answer_decision(
            target_flow="goal_companion",
            pending_interaction_id="pending-life-direction",
            slot_patch=PendingSlotPatch(
                goal_clarification=["longer-term direction"],
                budget_interpretation="unknown",
            ),
        ),
        GoalWorkbenchDraft(
            phase="mini_clarity",
            depth_mode="light",
            goal_type="life_direction",
            goal_summary="User feels lost and wants help with longer-term direction.",
            collected_fields=GoalWorkbenchFields(
                budget=PlanBudgetSignal(interpretation="unknown"),
                evidence={"goal_clarification": ["longer-term direction"]},
            ),
            missing_fields=["budget", "study_level", "geography", "area_of_life", "decision_scope"],
            next_action="clarify the area of life and decision scope",
            reflection_text="Model-generated reflection for a broad life-direction goal.",
            insight_text="Model-generated insight about narrowing broad uncertainty.",
            clarification_question="Model-generated question asking which area feels most urgent.",
            route_decision=GoalWorkbenchRouteDecision(
                target_flow="stay_goal_companion",
                reason="Continue life-direction clarification without retrieval.",
            ),
            memory_updates=[],
            internal_rationale="Scripted life-direction workbench output with bad unknown budget.",
        ),
    )

    result = asyncio.run(
        run_graph_pipeline(
            provider=provider,
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="I am lost in life, what do I do?",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    workbench_payload = provider.payloads_by_prompt["goal_workbench"][0]
    assert workbench_payload["active_goal"]["missing_fields"] == ["area_of_life"]

    snapshot = result["stateUpdates"]["signalSnapshot"]
    assert "budget" not in snapshot
    assert "study_level" not in snapshot
    assert "geography" not in snapshot
    assert [update["signalType"] for update in result["signalUpdates"]] == []

    active_goal_snapshot = snapshot["active_goal"]
    assert active_goal_snapshot["goal_type"] == "life_direction"
    assert "budget" not in active_goal_snapshot["collected_fields"]
    assert "study_level" not in active_goal_snapshot["collected_fields"]
    assert "geography" not in active_goal_snapshot["collected_fields"]
    assert active_goal_snapshot["missing_fields"] == ["area_of_life", "decision_scope"]
    assert "get_expert_candidates" not in platform.calls
    assert "get_resource_candidates" not in platform.calls


def test_goal_workbench_suggested_reply_rejects_grounded_context_contradiction():
    with pytest.raises(ValueError):
        GoalWorkbenchSuggestedReply(
            text="Treat the confirmed budget as not literal",
            kind="meaningful_action",
            action_kind="planning_artifact",
            grounding="contradicts_context",
        )


def test_pending_budget_confirmation_cleans_active_goal_before_workbench():
    active_goal = {
        "active_goal_key": "goal-1",
        "goal_type": "study_planning",
        "goal_summary": "Study planning with a budget constraint.",
        "collected_fields": {
            "budget": {
                "amount": 22,
                "currency": "INR",
                "raw_budget_text": "22 Indian rupees",
            },
            "study_level": "doctoral level",
            "subject_field": "computer science",
            "geography": ["London"],
        },
        "missing_fields": ["budget", "timeline"],
        "next_action": "stale resolved-field action",
        "plan_version": 2,
    }
    pending = {
        "pending_interaction_id": "pending-budget",
        "status": "open",
        "target_flow": "goal_companion",
        "question_type": "goal_clarification",
        "expected_answer_schema": {},
        "slot_targets": ["goal_clarification"],
        "original_question_text": "Model-generated prior mixed clarification.",
        "created_turn_id": "assistant-turn-1",
        "expires_after_turns": 4,
        "turns_elapsed": 0,
    }
    platform = FakePlatformClient(
        signal_snapshot={
            "active_goal": active_goal,
            "budget": active_goal["collected_fields"]["budget"],
            "study_level": "doctoral level",
            "subject_field": "computer science",
            "geography": ["London"],
            "pending_interaction": pending,
        }
    )
    provider = _provider(
        _pending_answer_decision(
            target_flow="goal_companion",
            pending_interaction_id="pending-budget",
            slot_patch=PendingSlotPatch(
                budget_amount=22,
                budget_currency="INR",
                budget_raw_text="22 Indian rupees",
                budget_confirmed_literal=True,
                budget_interpretation="literal",
            ),
        ),
        GoalWorkbenchDraft(
            phase="mini_clarity",
            depth_mode="light",
            goal_type="study_planning",
            goal_summary="Study planning with confirmed budget details.",
            collected_fields=GoalWorkbenchFields(
                budget=PlanBudgetSignal(
                    amount=22,
                    currency="INR",
                    raw_budget_text="22 Indian rupees",
                    confirmed_literal=True,
                    interpretation="literal",
                ),
                study_level="doctoral level",
                subject_field="computer science",
                geography=["London"],
                feasibility_flags=[
                    "Budget not specified",
                    "budget_feasibility_gap",
                ],
            ),
            missing_fields=["budget", "timeline"],
            next_action="stale resolved-field action",
            reflection_text="Model-generated reflection with confirmed budget.",
            insight_text="Model-generated feasibility planning insight.",
            clarification_question="Model-generated stale mixed clarification.",
            route_decision=GoalWorkbenchRouteDecision(
                target_flow="stay_goal_companion",
                reason="Continue feasibility planning.",
            ),
            memory_updates=[],
            internal_rationale="Scripted stale draft for active-goal cleanup.",
        ),
    )

    result = asyncio.run(
        run_graph_pipeline(
            provider=provider,
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="I meant yes, 22 Indian rupees.",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    workbench_payload = provider.payloads_by_prompt["goal_workbench"][0]
    assert "pending_interaction" not in json.dumps(workbench_payload["signal_snapshot"])
    assert workbench_payload["active_goal"]["missing_fields"] == ["timeline"]
    assert "next_action" not in workbench_payload["active_goal"]

    snapshot = result["stateUpdates"]["signalSnapshot"]
    assert snapshot["budget"]["confirmed_literal"] is True
    assert snapshot["budget"]["interpretation"] == "literal"
    assert snapshot["budget_confirmed_literal"] is True
    assert snapshot["active_goal"]["missing_fields"] == ["timeline"]
    assert snapshot["active_goal"]["next_action"] is None
    assert "Budget not specified" not in snapshot.get("feasibility_flags", [])
    assert "budget_feasibility_gap" in snapshot.get("feasibility_flags", [])
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "clarification" not in block_types

    trace_metadata = platform.persist_payload["traceMetadata"]
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "turn_resolution" in node_names
    assert "apply_pending_answer" in node_names
    assert "goal_workbench" in node_names
    assert "extract_signals" not in node_names
    assert "maybe_retrieve_experts" not in node_names
    assert "maybe_retrieve_resources" not in node_names


def test_pending_timeline_answer_uses_compact_context_and_updates_timeline():
    active_goal = {
        "active_goal_key": "goal-1",
        "goal_type": "study_planning",
        "goal_summary": "Study planning with confirmed budget and academic details.",
        "collected_fields": {
            "budget": {
                "raw_budget_text": "unusual literal budget",
                "confirmed_literal": True,
                "interpretation": "literal",
            },
            "study_level": "doctoral level",
            "subject_field": "computer science",
            "geography": ["London"],
        },
        "missing_fields": ["timeline"],
        "next_action": "ask for timeline only",
        "plan_version": 3,
        "large_internal_blob": "x" * 50_000,
    }
    pending = {
        "pending_interaction_id": "pending-timeline",
        "status": "open",
        "target_flow": "goal_companion",
        "question_type": "goal_clarification",
        "expected_answer_schema": {
            "allowed_slot_patch_fields": ["timeline", "goal_clarification"],
        },
        "slot_targets": ["timeline"],
        "original_question_text": "Model-generated question asking only for timeline.",
        "created_turn_id": "assistant-turn-1",
        "expires_after_turns": 4,
        "turns_elapsed": 0,
    }
    platform = FakePlatformClient(
        signal_snapshot={
            "active_goal": active_goal,
            "budget": active_goal["collected_fields"]["budget"],
            "pending_interaction": pending,
            "oversized_signal_blob": "y" * 70_000,
        },
        turns=[
            {
                "id": "turn-1",
                "actor": "assistant",
                "responseBlocks": [
                    {
                        "type": "reflection",
                        "content": "visible prior assistant text",
                        "metadata": {"rawTrace": "z" * 80_000},
                    }
                ],
            },
            {"id": "turn-2", "actor": "user", "inputText": "prior detail"},
            {"id": "turn-3", "actor": "assistant", "content": "visible timeline question"},
            {"id": "turn-4", "actor": "user", "inputText": "latest prior user turn"},
        ],
        memory_items=[
            {
                "memoryType": "goal",
                "content": "private memory content that should not be in turn resolution",
            }
        ],
    )
    provider = _provider(
        _pending_answer_decision(
            target_flow="goal_companion",
            pending_interaction_id="pending-timeline",
            slot_patch=PendingSlotPatch(
                timeline="within one planning window",
                goal_clarification=["timeline provided"],
            ),
        ),
        GoalWorkbenchDraft(
            phase="mini_clarity",
            depth_mode="light",
            goal_type="study_planning",
            goal_summary="Study planning with confirmed budget, field, location, and timeline.",
            collected_fields=GoalWorkbenchFields(
                budget=PlanBudgetSignal(
                    raw_budget_text="unusual literal budget",
                    confirmed_literal=True,
                    interpretation="literal",
                ),
                study_level="doctoral level",
                subject_field="computer science",
                geography=["London"],
                timeline="within one planning window",
                feasibility_flags=["budget_feasibility_gap"],
            ),
            missing_fields=[],
            next_action="produce feasibility planning artifact",
            reflection_text="Model-generated response that uses the new timeline.",
            insight_text="Model-generated feasibility insight.",
            direction_text="Model-generated next planning step.",
            route_decision=GoalWorkbenchRouteDecision(
                target_flow="stay_goal_companion",
                reason="Continue goal planning without retrieval.",
            ),
            memory_updates=[],
            internal_rationale="Scripted workbench update.",
        ),
    )

    result = asyncio.run(
        run_graph_pipeline(
            provider=provider,
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="within one planning window",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    resolution_payload = provider.payloads_by_prompt["turn_resolution"][0]
    payload_text = json.dumps(resolution_payload, ensure_ascii=True, sort_keys=True)
    assert len(payload_text) <= TURN_RESOLUTION_TOKEN_BUDGET * CHARS_PER_TOKEN
    assert "signal_snapshot" not in resolution_payload
    assert "pending_interaction" not in resolution_payload
    assert "responseBlocks" not in payload_text
    assert "rawTrace" not in payload_text
    assert "private memory content" not in payload_text
    assert resolution_payload["memory_item_count"] == 1
    assert len(resolution_payload["last_turns"]) == 2
    assert resolution_payload["pending_question"]["slot_targets"] == ["timeline"]
    assert resolution_payload["active_goal_card"]["missing_fields"] == ["timeline"]

    snapshot = result["stateUpdates"]["signalSnapshot"]
    assert snapshot["timeline"] == "within one planning window"
    assert snapshot["active_goal"]["collected_fields"]["timeline"] == "within one planning window"
    assert snapshot["active_goal"]["missing_fields"] == []
    assert "Budget not specified" not in snapshot.get("feasibility_flags", [])
    assert "clarification" not in [block["type"] for block in result["responseBlocks"]]
    assert "get_expert_candidates" not in platform.calls
    assert "get_resource_candidates" not in platform.calls

    trace_metadata = platform.persist_payload["traceMetadata"]
    turn_resolution_trace = trace_metadata["nodeTraces"][
        [trace["node"] for trace in trace_metadata["nodeTraces"]].index("turn_resolution")
    ]
    context_pack = turn_resolution_trace["summary"]["contextPack"]
    assert context_pack["contextPackName"] == "turn_resolution"
    assert context_pack["rawContextOmitted"] is True
    assert context_pack["compactedTurnCount"] == 2
    assert context_pack["memoryItemCountBefore"] == 1
    assert context_pack["activeGoalIncluded"] is True


def test_goal_workbench_resource_route_uses_existing_resource_flow():
    platform = FakePlatformClient()

    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _goal_supervisor(),
                _goal_workbench_route("resource_search"),
                _resource_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Build a learning plan",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    assert "get_resource_candidates" in platform.calls
    assert "get_expert_candidates" not in platform.calls
    assert result["recommendationRun"]["traceMetadata"]["runType"] == "resources"
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "resource_cards" in block_types
    assert "expert_cards" not in block_types

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "resource_request"
    assert trace_metadata["activeFlow"] == "resource_search"
    assert trace_metadata["goalWorkbench"]["route_decision"]["target_flow"] == "resource_search"
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "goal_workbench" in node_names
    assert "maybe_retrieve_resources" in node_names
    assert "score_resource_candidates" in node_names
    assert "extract_signals" not in node_names
    assert "generate_strategy" not in node_names
    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == [
        "conversation_supervisor",
        "goal_workbench",
    ]


def test_goal_workbench_expert_route_uses_existing_expert_flow():
    platform = FakePlatformClient()

    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _goal_supervisor(),
                _goal_workbench_route("expert_matching"),
                _recommendation_bundle(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="I need human guidance after planning",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    assert "get_expert_candidates" in platform.calls
    assert "get_resource_candidates" not in platform.calls
    assert result["recommendationRun"]["traceMetadata"]["runType"] == "experts"
    assert result["recommendationRun"]["selectedCount"] >= 1
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" in block_types
    assert "resource_cards" not in block_types

    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "expert_request"
    assert trace_metadata["activeFlow"] == "expert_matching"
    assert trace_metadata["goalWorkbench"]["route_decision"]["target_flow"] == "expert_matching"
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "goal_workbench" in node_names
    assert "maybe_retrieve_experts" in node_names
    assert "score_candidates" in node_names
    assert "allocate_slots" in node_names
    assert "extract_signals" not in node_names
    assert "generate_strategy" not in node_names
    assert "expert_matching_planner" not in [
        call["promptId"] for call in trace_metadata["llmCalls"]
    ]


def test_authenticated_resource_request_uses_resource_path_without_expert_cards():
    platform = FakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _resource_supervisor(),
                ExtractedSignals(primary_intent="resource_search", desired_outcomes=["materials"]),
                _resource_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Recommend resources",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    assert "get_resource_candidates" in platform.calls
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "resource_cards" in block_types
    assert "expert_cards" not in block_types
    assert result["recommendationRun"]["selectedCount"] == 1
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is True


def test_resource_request_with_no_public_candidates_returns_no_match_without_run():
    platform = FakePlatformClient(resource_candidates=[])
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _resource_supervisor(),
                ExtractedSignals(primary_intent="resource_search", desired_outcomes=["materials"]),
                _resource_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Recommend resources",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert "get_resource_candidates" in platform.calls
    assert result["recommendationRun"] is None
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "resource_cards" not in block_types
    assert "expert_cards" not in block_types


def test_resource_policy_blocking_prevents_resource_tool_and_cards():
    platform = FakePlatformClient(can_recommend_resources=False)
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _resource_supervisor(),
                ExtractedSignals(primary_intent="resource_search", desired_outcomes=["materials"]),
                _resource_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Recommend resources",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert "get_resource_candidates" not in platform.calls
    assert result["recommendationRun"] is None
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "resource_cards" not in block_types
    assert "expert_cards" not in block_types


def test_guest_expert_request_is_policy_blocked_without_expert_cards():
    platform = FakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(_expert_supervisor(), _blocked_expert_response()),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="route me to some random mentor please",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert "get_expert_candidates" not in platform.calls
    assert result["recommendationRun"] is None
    assert result["signalUpdates"] == []
    assert result["memoryUpdates"] == []
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" not in block_types
    assert "resource_cards" not in block_types
    assert "sign_in_cta" in block_types
    text_blocks = [
        block
        for block in result["responseBlocks"]
        if block.get("type") in {"soft_response", "reflection", "direction", "system_notice"}
    ]
    assert text_blocks
    visible_text = " ".join(str(block.get("content", "")) for block in text_blocks)
    internal_rationale = "Scripted internal rationale kept out of rendered blocks."
    assert visible_text
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
    assert "extract_signals" not in node_names
    assert "normalize_signals" not in node_names
    assert "maybe_retrieve_experts" not in node_names
    assert "score_candidates" not in node_names
    assert "allocate_slots" not in node_names
    assert "maybe_generate_expert_elevation" not in node_names
    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == [
        "conversation_supervisor",
        "blocked_expert_response_composer",
    ]


def test_guest_expert_preview_returns_cards_with_sign_in_cta_without_memory_or_metering():
    platform = FakePlatformClient(
        can_recommend_experts=True,
        can_book_sessions=False,
    )
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(),
                _recommendation_bundle(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Recommend mentors",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert "get_expert_candidates" in platform.calls
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
    assert trace_metadata["turnPolicy"]["allow_recommendations"] is True
    assert trace_metadata["turnPolicy"]["allow_tools"] is True
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is False
    assert trace_metadata["turnPolicy"]["allow_usage_metering"] is False
    assert trace_metadata["selectedExpertIds"] == [
        "33333333-3333-3333-3333-333333333333"
    ]


def test_broad_random_authenticated_request_uses_open_discovery_and_emits_expert_cards():
    platform = FakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(selection_intent="open_discovery"),
                _recommendation_bundle(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="broad expert request",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    assert "get_expert_candidates" in platform.calls
    assert result["recommendationRun"]["candidateCount"] > 0
    assert result["recommendationRun"]["selectedCount"] >= 1
    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" in block_types
    assert "sign_in_cta" not in block_types

    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "expert_request"
    assert trace_metadata["activeFlow"] == "expert_matching"
    strategy_trace = next(
        trace
        for trace in trace_metadata["nodeTraces"]
        if trace["node"] == "generate_strategy"
    )
    plan = strategy_trace["summary"]["expertRetrievalPlan"]
    assert plan["selection_intent"] == "open_discovery"
    allocation_trace = next(
        trace for trace in trace_metadata["nodeTraces"] if trace["node"] == "allocate_slots"
    )
    assert allocation_trace["summary"]["selectionMode"] == "open_discovery"
    assert "diagnose_expert_selection" in [
        trace["node"] for trace in trace_metadata["nodeTraces"]
    ]
    internal_text = "Scripted expert retrieval plan."
    assert internal_text not in json.dumps(result["responseBlocks"])


def test_broad_random_guest_preview_emits_cards_sign_in_cta_and_no_metering():
    platform = FakePlatformClient(
        can_recommend_experts=True,
        can_book_sessions=False,
    )
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(selection_intent="open_discovery"),
                _recommendation_bundle(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="broad expert request",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" in block_types
    assert "sign_in_cta" in block_types
    assert result["memoryUpdates"] == []
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["turnPolicy"]["allow_usage_metering"] is False
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is False


def test_open_discovery_selects_candidate_that_standard_threshold_would_reject():
    low_relevance_candidates = [
        _expert_candidate(
            profile_id="77777777-7777-7777-7777-777777777777",
            user_id="mentor-user-7",
            name="Operations Mentor",
            industry="operations",
            expertise=["operations", "process design"],
            intent_tags=["operations"],
            outcome_tags=["efficiency"],
            industry_tags=["operations"],
            quality_score=0.95,
            conversion_score=0.8,
        )
    ]
    platform = FakePlatformClient(expert_candidates=low_relevance_candidates)
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(selection_intent="open_discovery"),
                _recommendation_bundle(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="broad expert request",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    assert result["recommendationRun"]["selectedCount"] == 1
    selected = [
        candidate
        for candidate in result["recommendationRun"]["candidates"]
        if candidate["selected"]
    ]
    assert selected[0]["slotType"] == "open_discovery"
    assert selected[0]["scoreExplanation"]["selectionMode"] == "open_discovery"
    assert selected[0]["expertiseRelevanceScore"] < 0.3
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert "diagnose_expert_selection" in [
        trace["node"] for trace in trace_metadata["nodeTraces"]
    ]


def test_specific_relevance_keeps_strict_threshold_and_uses_no_match_response():
    low_relevance_candidates = [
        _expert_candidate(
            profile_id="88888888-8888-8888-8888-888888888888",
            user_id="mentor-user-8",
            name="Manufacturing Mentor",
            industry="industrial",
            expertise=["manufacturing"],
            intent_tags=["manufacturing"],
            outcome_tags=["factory planning"],
            industry_tags=["industrial"],
            quality_score=0.95,
            conversion_score=0.9,
        )
    ]
    platform = FakePlatformClient(expert_candidates=low_relevance_candidates)
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(selection_intent="specific_relevance"),
                _expert_no_match_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Recommend mentors",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" not in block_types
    assert "soft_response" in block_types
    assert result["recommendationRun"]["selectedCount"] == 0
    trace_metadata = platform.persist_payload["traceMetadata"]
    allocation_trace = next(
        trace for trace in trace_metadata["nodeTraces"] if trace["node"] == "allocate_slots"
    )
    assert allocation_trace["summary"]["selectionMode"] == "specific_relevance"
    assert "expert_no_match_composer" in [
        call["promptId"] for call in trace_metadata["llmCalls"]
    ]


def test_expert_no_match_with_zero_candidates_returns_user_visible_no_match_response():
    platform = FakePlatformClient(expert_candidates=[])
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(selection_intent="open_discovery"),
                _expert_no_match_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="broad expert request",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    block_types = [block["type"] for block in result["responseBlocks"]]
    assert "expert_cards" not in block_types
    assert "soft_response" in block_types
    assert result["recommendationRun"] is None
    assert "Scripted expert retrieval plan" not in json.dumps(result["responseBlocks"])


def test_pending_mentor_category_answer_resumes_expert_matching_for_guest_preview():
    platform = FakePlatformClient(
        can_recommend_experts=True,
        can_book_sessions=False,
    )

    first = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(should_retrieve=False, needs_clarification=True),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="expert request needing category",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )
    assert "expert_cards" not in [block["type"] for block in first["responseBlocks"]]
    pending = platform.signal_snapshot.get("pending_interaction")
    assert pending["status"] == "open"
    assert pending["target_flow"] == "expert_matching"
    assert pending["question_type"] == "mentor_category"

    platform.calls.clear()
    second = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _pending_answer_decision(
                    target_flow="expert_matching",
                    slot_patch=PendingSlotPatch(
                        mentor_category=["technology"],
                        expertise_keywords=["software"],
                    ),
                    pending_interaction_id=pending["pending_interaction_id"],
                ),
                _recommendation_bundle(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="pending category answer",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert "get_expert_candidates" in platform.calls
    block_types = [block["type"] for block in second["responseBlocks"]]
    assert "expert_cards" in block_types
    assert "sign_in_cta" in block_types
    assert second["recommendationRun"]["selectedCount"] == 1

    trace_metadata = platform.persist_payload["traceMetadata"]
    signal_snapshot = second["stateUpdates"]["signalSnapshot"]
    assert signal_snapshot["canonical_domains"] == ["technology"]
    assert "technology" in signal_snapshot["industries"]
    assert "software" in signal_snapshot["expertise_keywords"]
    assert signal_snapshot["expert_selection_mode"] == "pending_category_preview"
    assert trace_metadata["nodeTraces"][
        [trace["node"] for trace in trace_metadata["nodeTraces"]].index("allocate_slots")
    ]["summary"]["selectionMode"] == "pending_category_preview"
    assert trace_metadata["turnResolution"]["resolution_type"] == "answer_to_pending_question"
    assert trace_metadata["conversationAct"] == "expert_request"
    assert trace_metadata["activeFlow"] == "expert_matching"
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "turn_resolution" in node_names
    assert "apply_pending_answer" in node_names
    assert "classify_conversation_act" not in node_names
    assert "patch_correction_context" not in node_names
    assert "extract_signals" not in node_names
    assert "normalize_signals" not in node_names
    assert "maybe_retrieve_experts" in node_names
    assert "score_candidates" in node_names
    assert "allocate_slots" in node_names
    assert second["memoryUpdates"] == []
    assert platform.signal_snapshot["pending_interaction"]["status"] == "answered"
    assert "Scripted pending interaction answer" not in json.dumps(second["responseBlocks"])


def test_pending_pick_one_continues_toward_expert_matching_not_correction():
    platform = FakePlatformClient(
        can_recommend_experts=True,
        can_book_sessions=False,
    )
    actor = {
        "userId": None,
        "anonymousSessionId": "anon-1",
        "surface": "landing_page",
        "authenticated": False,
    }

    asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(should_retrieve=False, needs_clarification=True),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="expert request needing category",
            actor=actor,
        )
    )
    platform.calls.clear()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _pending_answer_decision(
                    target_flow="expert_matching",
                    slot_patch=PendingSlotPatch(
                        mentor_category=["career growth"],
                        assistant_choice_requested=True,
                    ),
                    pending_interaction_id=platform.signal_snapshot["pending_interaction"]["pending_interaction_id"],
                ),
                _recommendation_bundle(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="assistant choice continuation",
            actor=actor,
        )
    )

    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["turnResolution"]["resolution_type"] == "answer_to_pending_question"
    assert trace_metadata["turnResolution"]["slot_patch"]["assistant_choice_requested"] is True
    assert trace_metadata["conversationAct"] == "expert_request"
    assert trace_metadata["activeFlow"] == "expert_matching"
    assert "patch_correction_context" not in [
        trace["node"] for trace in trace_metadata["nodeTraces"]
    ]
    assert "get_expert_candidates" in platform.calls
    assert "expert_cards" in [block["type"] for block in result["responseBlocks"]]


def test_pending_interaction_survives_interrupt_and_resumes_on_answer():
    platform = FakePlatformClient(
        can_recommend_experts=True,
        can_book_sessions=False,
    )
    actor = {
        "userId": None,
        "anonymousSessionId": "anon-1",
        "surface": "landing_page",
        "authenticated": False,
    }

    asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _expert_supervisor(),
                ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                _expert_planning_response(should_retrieve=False, needs_clarification=True),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="expert request needing category",
            actor=actor,
        )
    )
    pending_id = platform.signal_snapshot["pending_interaction"]["pending_interaction_id"]

    platform.calls.clear()
    interrupt = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _pending_interrupt_decision(pending_interaction_id=pending_id),
                _soft_response("Model-generated interruption response."),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="temporary interruption",
            actor=actor,
        )
    )
    interrupt_trace = platform.persist_payload["traceMetadata"]
    assert interrupt_trace["turnResolution"]["resolution_type"] == "interrupt"
    assert "get_expert_candidates" not in platform.calls
    assert platform.signal_snapshot["pending_interaction"]["status"] == "open"
    assert platform.signal_snapshot["pending_interaction"]["pending_interaction_id"] == pending_id
    assert "expert_cards" not in [block["type"] for block in interrupt["responseBlocks"]]

    platform.calls.clear()
    resumed = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _pending_answer_decision(
                    target_flow="expert_matching",
                    slot_patch=PendingSlotPatch(
                        mentor_category=["technology"],
                        expertise_keywords=["software"],
                    ),
                    pending_interaction_id=pending_id,
                ),
                _recommendation_bundle(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="pending category answer",
            actor=actor,
        )
    )
    resumed_trace = platform.persist_payload["traceMetadata"]
    assert resumed_trace["turnResolution"]["resolution_type"] == "answer_to_pending_question"
    assert "get_expert_candidates" in platform.calls
    assert "expert_cards" in [block["type"] for block in resumed["responseBlocks"]]


def test_correction_turn_routes_to_repair_flow_without_expert_tools():
    platform = FakePlatformClient(signal_snapshot={"geography": ["Region Alpha"]})
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _correction_supervisor(),
                _correction_patch(add=["Region Beta"], remove=["Region Alpha"]),
                _correction_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="grounded correction message",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    assert "get_expert_candidates" not in platform.calls
    assert result["recommendationRun"] is None
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "correction"
    assert trace_metadata["activeFlow"] == "repair"
    assert trace_metadata["turnSpec"]["conversation_act"] == "correction"
    assert trace_metadata["turnSpec"]["active_flow"] == "repair"
    assert platform.persist_payload["stateUpdates"]["phase"] == "discovery"
    assert result["stateUpdates"]["signalSnapshot"]["geography"] == ["region beta"]
    assert [update["signalType"] for update in result["signalUpdates"]] == ["geography"]

    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "patch_correction_context" in node_names
    assert "extract_signals" not in node_names
    assert "normalize_signals" not in node_names
    assert "maybe_retrieve_experts" not in node_names
    assert "score_candidates" not in node_names
    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == [
        "conversation_supervisor",
        "correction_patch",
        "correction_composer",
    ]


def test_off_domain_actually_correction_does_not_create_fake_goal_signals():
    platform = FakePlatformClient(signal_snapshot={"geography": ["Region Alpha"]})
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _correction_supervisor(),
                _correction_patch(supported=False),
                _correction_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="off-domain correction-like message",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    assert result["signalUpdates"] == []
    assert result["stateUpdates"]["signalSnapshot"]["geography"] == ["Region Alpha"]
    assert result["stateUpdates"]["phase"] == "discovery"
    assert platform.persist_payload is not None
    node_names = [
        trace["node"]
        for trace in platform.persist_payload["traceMetadata"]["nodeTraces"]
    ]
    assert "patch_correction_context" in node_names
    assert "extract_signals" not in node_names
    assert "normalize_signals" not in node_names
    assert "maybe_retrieve_experts" not in node_names
    assert "score_candidates" not in node_names


def test_off_domain_correction_like_message_does_not_persist_repair_phase():
    platform = FakePlatformClient(signal_snapshot={"geography": ["Region Alpha"]})
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _correction_supervisor(),
                _correction_patch(supported=False),
                _correction_response(),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="ungrounded correction-like message",
            actor={
                "userId": "user-1",
                "anonymousSessionId": None,
                "surface": "landing_page",
                "authenticated": True,
            },
        )
    )

    assert result["signalUpdates"] == []
    assert result["stateUpdates"]["phase"] == "discovery"
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["activeFlow"] == "repair"
    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "extract_signals" not in node_names
    assert "normalize_signals" not in node_names


def test_invalid_flow_names_never_resolve_to_persisted_conversation_phase():
    for flow_name in FLOW_PHASE_NAMES:
        phase = resolve_persisted_conversation_phase(
            {
                "phase_before": "mini_clarity",
                "phase_after": flow_name,
            }
        )

        assert phase == "mini_clarity"
        assert phase not in FLOW_PHASE_NAMES


def test_composer_draft_flow_phase_cannot_leak_into_persisted_phase():
    phase = resolve_persisted_conversation_phase(
        {
            "phase_before": "discovery",
            "phase_after": "resource_search",
        }
    )

    assert phase == "discovery"


def test_guest_expert_request_effective_policy_disallows_durable_memory():
    platform = FakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(_expert_supervisor(), _blocked_expert_response()),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Recommend mentors",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert result["memoryUpdates"] == []
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "expert_request"
    assert trace_metadata["activeFlow"] == "expert_matching"
    assert trace_metadata["turnPolicy"]["allow_memory_updates"] is False
    assert trace_metadata["turnSpec"]["turn_policy"]["allow_memory_updates"] is False


def test_unsupported_turn_uses_boundary_composer_without_extraction_or_tools():
    platform = FakePlatformClient()
    result = asyncio.run(
        run_graph_pipeline(
            provider=_provider(
                _supervisor_decision(
                    conversation_act="unsupported",
                    active_flow="soft_response",
                    turn_policy=_turn_policy(
                        allow_extraction=False,
                        allow_tools=False,
                        allow_recommendations=False,
                        allow_memory_updates=False,
                        allow_question=False,
                        response_mode="soft_response",
                    ),
                ),
                BoundaryResponseDraft(
                    phase="safety",
                    soft_response_text="Model-generated unsupported-boundary response.",
                    response_reason="Scripted unsupported boundary.",
                ),
            ),
            platform_client=platform,
            conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user_message="Can you do my visa application for me?",
            actor={
                "userId": None,
                "anonymousSessionId": "anon-1",
                "surface": "landing_page",
                "authenticated": False,
            },
        )
    )

    assert "get_expert_candidates" not in platform.calls
    assert result["signalUpdates"] == []
    assert platform.persist_payload is not None
    trace_metadata = platform.persist_payload["traceMetadata"]
    assert trace_metadata["conversationAct"] == "unsupported"
    assert trace_metadata["activeFlow"] == "soft_response"

    node_names = [trace["node"] for trace in trace_metadata["nodeTraces"]]
    assert "extract_signals" not in node_names
    assert "score_candidates" not in node_names
    assert [call["promptId"] for call in trace_metadata["llmCalls"]] == [
        "conversation_supervisor",
        "boundary_composer",
    ]


def test_graph_pipeline_marks_failed_node_when_retrieval_fails():
    platform = FakePlatformClient(fail_expert_retrieval=True)

    with pytest.raises(PlatformBridgeError):
        asyncio.run(
            run_graph_pipeline(
                provider=_provider(
                    _expert_supervisor(),
                    ExtractedSignals(primary_intent="expert_guidance", explicit_expert_request=True),
                    _expert_planning_response(),
                ),
                platform_client=platform,
                conversation_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                user_message="Recommend mentors",
                actor={
                    "userId": "user-1",
                    "anonymousSessionId": None,
                    "surface": "landing_page",
                    "authenticated": True,
                },
            )
        )

    assert platform.failed_payload is not None
    assert platform.failed_payload["error"]["node"] == "maybe_retrieve_experts"
    failed_trace = platform.failed_payload["nodeTraces"][-1]
    assert failed_trace["node"] == "maybe_retrieve_experts"
    assert failed_trace["status"] == "failed"
    assert "stateAfter" in platform.failed_payload
