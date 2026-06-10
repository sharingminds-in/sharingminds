from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ConversationAct = Literal[
    "goal_help",
    "goal_detail_answer",
    "expert_request",
    "resource_request",
    "platform_help",
    "chitchat",
    "meta_question",
    "correction",
    "cancel_or_restart",
    "repeat",
    "resume_previous_flow",
    "unsupported",
    "safety",
]

ActiveFlow = Literal[
    "goal_companion",
    "expert_matching",
    "resource_search",
    "platform_help",
    "soft_response",
    "repair",
    "safety",
]

PendingTargetFlow = Literal["expert_matching", "resource_search", "goal_companion"]
PendingInteractionStatus = Literal["open", "answered", "cancelled", "expired"]
PendingQuestionType = Literal[
    "mentor_category",
    "resource_focus",
    "goal_clarification",
    "assistant_choice",
    "other",
]
TurnResolutionType = Literal[
    "answer_to_pending_question",
    "new_user_intent",
    "interrupt",
    "correction",
    "unsupported",
]
ExpertSelectionIntent = Literal[
    "specific_relevance",
    "open_discovery",
    "quality_first",
    "pending_category_preview",
]
GoalWorkbenchRouteTarget = Literal[
    "stay_goal_companion",
    "resource_search",
    "expert_matching",
]
SuggestedReplyKind = Literal[
    "meaningful_action",
    "missing_info_placeholder",
    "generic_ack",
    "invalid",
]
SuggestedReplyActionKind = Literal[
    "planning_artifact",
    "cost_estimation",
    "resource_search",
    "expert_search",
    "other",
]
SuggestedReplyGrounding = Literal["preserves_context", "contradicts_context", "unknown"]
BudgetInterpretation = Literal["literal", "estimate", "placeholder", "unknown"]
GroundedFactEffect = Literal["preserves_grounded_facts", "contradicts_grounded_facts"]


class TurnPolicy(BaseModel):
    allow_extraction: bool = True
    allow_planning: bool = True
    allow_tools: bool = False
    allow_recommendations: bool = False
    allow_memory_updates: bool = True
    allow_usage_metering: bool = False
    allow_question: bool = True
    response_mode: Literal["goal_companion", "soft_response", "repair", "safety"] = (
        "goal_companion"
    )


class SupervisorRoute(BaseModel):
    conversation_act: ConversationAct
    active_flow: ActiveFlow
    turn_policy: TurnPolicy


class ConversationSupervisorDecision(BaseModel):
    conversation_act: ConversationAct
    active_flow: ActiveFlow
    interrupted_flow: str | None = None
    resume_available: bool = False
    flow_confidence: float = Field(ge=0, le=1)
    turn_policy: TurnPolicy
    rationale: str


class PendingInteraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pending_interaction_id: str
    status: PendingInteractionStatus = "open"
    target_flow: PendingTargetFlow
    question_type: PendingQuestionType
    expected_answer_schema: dict[str, Any] = Field(default_factory=dict)
    slot_targets: list[str] = Field(default_factory=list)
    original_question_text: str
    created_turn_id: str | None = None
    expires_after_turns: int = Field(default=4, ge=1, le=12)
    turns_elapsed: int = Field(default=0, ge=0)


class PendingSlotPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    budget_amount: float | None = None
    budget_currency: str | None = None
    budget_raw_text: str | None = None
    budget_confirmed_literal: bool | None = None
    budget_interpretation: BudgetInterpretation | None = None
    canonical_domains: list[str] = Field(default_factory=list)
    mentor_category: list[str] = Field(default_factory=list)
    resource_focus: list[str] = Field(default_factory=list)
    goal_clarification: list[str] = Field(default_factory=list)
    expertise_keywords: list[str] = Field(default_factory=list)
    intents: list[str] = Field(default_factory=list)
    outcomes: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    geography: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    stage: str | None = None
    timeline: str | None = None
    assistant_choice_requested: bool = False


class TurnResolutionDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resolution_type: TurnResolutionType
    confidence: float = Field(ge=0, le=1)
    pending_interaction_id: str | None = None
    target_flow: PendingTargetFlow | None = None
    conversation_act: ConversationAct | None = None
    active_flow: ActiveFlow | None = None
    slot_patch: PendingSlotPatch = Field(default_factory=PendingSlotPatch)
    close_pending_interaction: bool = False
    skip_supervisor: bool = False
    internal_rationale: str

    @model_validator(mode="after")
    def validate_resolution_contract(self) -> "TurnResolutionDecision":
        if self.resolution_type == "answer_to_pending_question":
            if not self.pending_interaction_id:
                raise ValueError("answer_to_pending_question requires pending_interaction_id")
            if not self.target_flow:
                raise ValueError("answer_to_pending_question requires target_flow")
            if not self.skip_supervisor:
                raise ValueError("answer_to_pending_question must skip supervisor")
        return self


TurnControllerBlockType = Literal[
    "soft_response",
    "reflection",
    "clarification",
    "insight",
    "direction",
    "micro_consent",
    "mini_framework",
    "system_notice",
]


class TurnControllerMiniFrameworkItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    body: str


class TurnControllerResponseBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: TurnControllerBlockType
    title: str | None = None
    content: str | None = None
    question: str | None = None
    suggestedReply: str | None = None
    items: list[TurnControllerMiniFrameworkItem] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def has_visible_content(self) -> "TurnControllerResponseBlock":
        if self.title or self.content or self.question or self.suggestedReply or self.items:
            return self
        raise ValueError("response block must contain visible user-facing content")


class TurnControllerDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_act: ConversationAct
    active_flow: ActiveFlow
    expert_selection_intent: ExpertSelectionIntent | None = None
    matching_context: PendingSlotPatch = Field(default_factory=PendingSlotPatch)
    turn_policy: TurnPolicy
    needs_signal_extraction: bool
    needs_tools: bool
    needs_recommendations: bool
    needs_memory_update: bool
    should_continue_graph: bool
    response_blocks: list[TurnControllerResponseBlock] = Field(default_factory=list)
    rationale: str
    trace_metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def direct_responses_need_blocks(self) -> "TurnControllerDecision":
        if not self.should_continue_graph and not self.response_blocks:
            raise ValueError("direct Turn Controller responses require response_blocks")
        return self


class ExtractedSignals(BaseModel):
    supported_use_case: bool = True
    support_boundary_note: str | None = None
    primary_intent: str | None = None
    secondary_intents: list[str] = Field(default_factory=list)
    desired_outcomes: list[str] = Field(default_factory=list)
    user_stage: str | None = None
    emotions: list[str] = Field(default_factory=list)
    urgency: Literal["low", "medium", "high"] | None = None
    geography: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    clarity_level: Literal["low", "medium", "high"] = "low"
    consent_signal: Literal["yes", "no", "unsure", "not_applicable"] = "unsure"
    explicit_expert_request: bool = False
    evidence: dict[str, list[str]] = Field(default_factory=dict)
    confidence: dict[str, float] = Field(default_factory=dict)


class ActiveGoalFrameworkState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str | None = None
    content_hash: str


class ActiveGoalState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    active_goal_key: str
    goal_type: str | None = None
    goal_summary: str
    last_framework: ActiveGoalFrameworkState | None = None
    expected_next_step: str | None = None
    next_action: str | None = None
    last_artifact_hash: str | None = None
    collected_fields: dict[str, Any] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    plan_version: int = Field(default=1, ge=1)


class PlanBudgetSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: float | None = None
    currency: str | None = None
    raw_budget_text: str | None = None
    confirmed_literal: bool | None = None
    interpretation: BudgetInterpretation | None = None


class GoalWorkbenchFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    budget: PlanBudgetSignal = Field(default_factory=PlanBudgetSignal)
    study_level: str | None = None
    subject_field: str | None = None
    geography: list[str] = Field(default_factory=list)
    timeline: str | None = None
    constraints: list[str] = Field(default_factory=list)
    feasibility_flags: list[str] = Field(default_factory=list)
    evidence: dict[str, list[str]] = Field(default_factory=dict)


class GoalWorkbenchRouteDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_flow: GoalWorkbenchRouteTarget = "stay_goal_companion"
    reason: str
    needs_user_confirmation: bool = False


class GoalWorkbenchSuggestedReply(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    kind: SuggestedReplyKind
    action_kind: SuggestedReplyActionKind | None = None
    grounding: SuggestedReplyGrounding = "preserves_context"

    @model_validator(mode="after")
    def validate_suggested_reply_contract(self) -> "GoalWorkbenchSuggestedReply":
        if "[" in self.text or "]" in self.text:
            raise ValueError("suggested replies cannot contain bracket placeholders")
        if self.grounding == "contradicts_context":
            raise ValueError("suggested replies cannot contradict grounded context")
        if self.kind == "meaningful_action" and not self.action_kind:
            raise ValueError("meaningful suggested replies require action_kind")
        if self.kind == "meaningful_action" and self.grounding != "preserves_context":
            raise ValueError("meaningful suggested replies must preserve grounded context")
        return self


class ExpertRetrievalPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    should_retrieve_experts: bool = False
    needs_clarification: bool = False
    clarification_question: str | None = None
    selection_intent: ExpertSelectionIntent = "specific_relevance"
    selection_mode: ExpertSelectionIntent = "specific_relevance"
    diversity_goal: str | None = None
    minimum_candidate_count: int = Field(default=1, ge=0, le=50)
    max_selected_count: int = Field(default=3, ge=1, le=3)
    internal_rationale: str

    @model_validator(mode="after")
    def validate_plan_contract(self) -> "ExpertRetrievalPlan":
        if self.needs_clarification and not self.clarification_question:
            raise ValueError("needs_clarification requires clarification_question")
        if self.selection_mode != self.selection_intent:
            self.selection_mode = self.selection_intent
        if self.needs_clarification:
            self.should_retrieve_experts = False
        return self


class ConversationStrategy(BaseModel):
    phase: str
    depth_mode: Literal["light", "standard", "deep"] = "standard"
    supported_use_case: bool = True
    soft_response_text: str | None = None
    reflection_text: str | None = None
    clarification_question: str | None = None
    insight_text: str | None = None
    direction_text: str | None = None
    transition_text: str | None = None
    micro_consent_prompt: str | None = None
    micro_consent_suggested_reply: str | None = None
    suggested_replies: list[str] = Field(default_factory=list)
    should_offer_framework: bool = False
    should_retrieve_experts: bool = False
    should_generate_readiness: bool = False
    expert_retrieval_plan: ExpertRetrievalPlan | None = None
    response_reason: str


class MiniFrameworkItem(BaseModel):
    title: str
    body: str


class MiniFrameworkDraft(BaseModel):
    title: str | None = None
    intro: str | None = None
    items: list[MiniFrameworkItem] = Field(default_factory=list)


class ExpertElevationDraft(BaseModel):
    title: str | None = None
    intro: str
    reason_bullets: list[str] = Field(default_factory=list)
    transition_text: str | None = None
    expert_card_reasons: dict[str, str] = Field(default_factory=dict)


class SessionReadinessSection(BaseModel):
    title: str
    items: list[str] = Field(default_factory=list)


class SessionReadinessDraft(BaseModel):
    title: str | None = None
    summary: str
    sections: list[SessionReadinessSection] = Field(default_factory=list)
    focus_areas: list[str] = Field(default_factory=list)
    decisions_to_clarify: list[str] = Field(default_factory=list)
    constraints_to_share: list[str] = Field(default_factory=list)
    questions_to_ask: list[str] = Field(default_factory=list)


class MemoryItemDraft(BaseModel):
    memory_type: str
    content: str
    confidence: float
    provenance: dict[str, str] = Field(default_factory=dict)

    @field_validator("provenance", mode="before")
    @classmethod
    def normalize_provenance(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return {}
        return {str(key): str(item) for key, item in value.items()}


class MemoryUpdateDraft(BaseModel):
    items: list[MemoryItemDraft] = Field(default_factory=list)


class GoalWorkbenchDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: str = "mini_clarity"
    depth_mode: Literal["light", "standard", "deep"] = "standard"
    active_goal_key: str | None = None
    goal_type: str | None = None
    goal_summary: str
    collected_fields: GoalWorkbenchFields = Field(default_factory=GoalWorkbenchFields)
    missing_fields: list[str] = Field(default_factory=list)
    next_action: str | None = None
    reflection_text: str | None = None
    clarification_question: str | None = None
    insight_text: str | None = None
    direction_text: str | None = None
    transition_text: str | None = None
    micro_consent_prompt: str | None = None
    micro_consent_suggested_reply: GoalWorkbenchSuggestedReply | None = None
    suggested_replies: list[GoalWorkbenchSuggestedReply] = Field(default_factory=list)
    mini_framework: MiniFrameworkDraft | None = None
    route_decision: GoalWorkbenchRouteDecision = Field(
        default_factory=lambda: GoalWorkbenchRouteDecision(
            target_flow="stay_goal_companion",
            reason="",
        )
    )
    memory_updates: MemoryUpdateDraft = Field(default_factory=MemoryUpdateDraft)
    internal_rationale: str

    @field_validator("memory_updates", mode="before")
    @classmethod
    def normalize_memory_updates(cls, value: Any) -> Any:
        if value is None:
            return {}
        if isinstance(value, list):
            return {"items": value}
        return value

    @field_validator("micro_consent_suggested_reply", mode="before")
    @classmethod
    def normalize_micro_consent_suggested_reply(cls, value: Any) -> Any:
        if isinstance(value, str):
            return {"text": value, "kind": "invalid", "action_kind": None}
        return value

    @field_validator("suggested_replies", mode="before")
    @classmethod
    def normalize_suggested_replies(cls, value: Any) -> Any:
        if not isinstance(value, list):
            return value
        return [
            {"text": item, "kind": "invalid", "action_kind": None}
            if isinstance(item, str)
            else item
            for item in value
        ]

    @model_validator(mode="after")
    def validate_goal_workbench_contract(self) -> "GoalWorkbenchDraft":
        self.suggested_replies = [
            reply for reply in self.suggested_replies if reply.kind == "meaningful_action"
        ]
        if (
            self.micro_consent_suggested_reply is not None
            and self.micro_consent_suggested_reply.kind != "meaningful_action"
        ):
            self.micro_consent_suggested_reply = None

        has_concrete_fields = any(
            [
                self.collected_fields.budget.raw_budget_text,
                self.collected_fields.budget.amount is not None,
                self.collected_fields.budget.confirmed_literal is not None,
                self.collected_fields.study_level,
                self.collected_fields.subject_field,
                self.collected_fields.timeline,
                self.collected_fields.feasibility_flags,
            ]
        )
        needs_missing_details = (
            self.route_decision.target_flow == "stay_goal_companion"
            and bool(self.missing_fields)
            and not has_concrete_fields
        )
        if needs_missing_details and not self.clarification_question:
            raise ValueError("missing-field goal turns require a direct clarification question")
        if needs_missing_details and self.clarification_question:
            self.micro_consent_prompt = None
            self.micro_consent_suggested_reply = None
            self.suggested_replies = []
            self.mini_framework = None
            self.transition_text = None
            self.direction_text = None

        has_response = any(
            [
                self.reflection_text,
                self.clarification_question,
                self.insight_text,
                self.direction_text,
                self.transition_text,
                self.micro_consent_prompt,
                self.suggested_replies,
                self.mini_framework
                and (self.mini_framework.intro or self.mini_framework.items),
            ]
        )
        if not has_response and self.route_decision.target_flow == "stay_goal_companion":
            raise ValueError("goal workbench requires user-visible response content")
        return self


class GoalWorkbenchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft: GoalWorkbenchDraft
    active_goal: ActiveGoalState
    signal_updates: list[dict[str, Any]] = Field(default_factory=list)


class StrategyBundle(BaseModel):
    strategy: ConversationStrategy
    mini_framework: MiniFrameworkDraft | None = None
    memory_updates: MemoryUpdateDraft = Field(default_factory=MemoryUpdateDraft)

    @field_validator("memory_updates", mode="before")
    @classmethod
    def normalize_memory_updates(cls, value: Any) -> Any:
        if value is None:
            return {}
        if isinstance(value, list):
            return {"items": value}
        return value


class RecommendationBundle(BaseModel):
    expert_elevation: ExpertElevationDraft | None = None
    session_readiness: SessionReadinessDraft | None = None


class SoftResponseDraft(BaseModel):
    phase: str = "soft_response"
    soft_response_text: str
    response_reason: str


class BoundaryResponseDraft(BaseModel):
    phase: str = "safety"
    soft_response_text: str
    response_reason: str


class BlockedExpertResponseDraft(BaseModel):
    phase: str = "expert_matching"
    user_response_text: str
    internal_rationale: str
    ui_intent: Literal["sign_in_required_for_expert_routing"] | None = None
    sign_in_cta_reason: Literal["expert_or_memory_continuity_requires_auth"] | None = None


class ExpertNoMatchDraft(BaseModel):
    phase: str = "expert_matching"
    user_response_text: str
    internal_rationale: str


class ResourceResponseDraft(BaseModel):
    phase: str = "resource_search"
    depth_mode: Literal["light", "standard", "deep"] = "standard"
    reflection_text: str | None = None
    clarification_question: str | None = None
    insight_text: str | None = None
    direction_text: str | None = None
    transition_text: str | None = None
    micro_consent_prompt: str | None = None
    micro_consent_suggested_reply: str | None = None
    should_offer_framework: bool = False
    mini_framework: MiniFrameworkDraft | None = None
    memory_updates: MemoryUpdateDraft = Field(default_factory=MemoryUpdateDraft)
    response_reason: str

    @field_validator("memory_updates", mode="before")
    @classmethod
    def normalize_memory_updates(cls, value: Any) -> Any:
        if value is None:
            return {}
        if isinstance(value, list):
            return {"items": value}
        return value


class ExpertPlanningDraft(BaseModel):
    phase: str = "expert_elevation"
    depth_mode: Literal["light", "standard", "deep"] = "standard"
    reflection_text: str | None = None
    clarification_question: str | None = None
    insight_text: str | None = None
    direction_text: str | None = None
    retrieval_plan: ExpertRetrievalPlan | None = None
    should_retrieve_experts: bool = False
    should_generate_readiness: bool = False
    memory_updates: MemoryUpdateDraft = Field(default_factory=MemoryUpdateDraft)
    response_reason: str

    @model_validator(mode="after")
    def normalize_retrieval_plan(self) -> "ExpertPlanningDraft":
        if self.retrieval_plan is None:
            self.retrieval_plan = ExpertRetrievalPlan(
                should_retrieve_experts=self.should_retrieve_experts,
                needs_clarification=bool(self.clarification_question),
                clarification_question=self.clarification_question,
                selection_intent="specific_relevance",
                selection_mode="specific_relevance",
                diversity_goal=None,
                minimum_candidate_count=1,
                max_selected_count=3,
                internal_rationale=self.response_reason,
            )
        self.should_retrieve_experts = self.retrieval_plan.should_retrieve_experts
        self.clarification_question = self.retrieval_plan.clarification_question
        return self

    @field_validator("memory_updates", mode="before")
    @classmethod
    def normalize_memory_updates(cls, value: Any) -> Any:
        if value is None:
            return {}
        if isinstance(value, list):
            return {"items": value}
        return value


class CorrectionResponseDraft(BaseModel):
    phase: str = "repair"
    depth_mode: Literal["light", "standard", "deep"] = "standard"
    reflection_text: str | None = None
    clarification_question: str | None = None
    insight_text: str | None = None
    direction_text: str | None = None
    memory_updates: MemoryUpdateDraft = Field(default_factory=MemoryUpdateDraft)
    response_reason: str

    @field_validator("memory_updates", mode="before")
    @classmethod
    def normalize_memory_updates(cls, value: Any) -> Any:
        if value is None:
            return {}
        if isinstance(value, list):
            return {"items": value}
        return value


class CorrectionPatchDraft(BaseModel):
    supported_correction: bool = True
    geography_add: list[str] = Field(default_factory=list)
    geography_remove: list[str] = Field(default_factory=list)
    constraints_add: list[str] = Field(default_factory=list)
    constraints_remove: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0, le=1)
    rationale: str


class ResponseRepairBundle(BaseModel):
    strategy: ConversationStrategy
    mini_framework: MiniFrameworkDraft | None = None
    memory_updates: MemoryUpdateDraft = Field(default_factory=MemoryUpdateDraft)
    repair_reason: str
    grounded_fact_effect: GroundedFactEffect = "preserves_grounded_facts"

    @field_validator("memory_updates", mode="before")
    @classmethod
    def normalize_memory_updates(cls, value: Any) -> Any:
        if value is None:
            return {}
        if isinstance(value, list):
            return {"items": value}
        return value

    @model_validator(mode="after")
    def validate_grounded_fact_effect(self) -> "ResponseRepairBundle":
        if self.grounded_fact_effect != "preserves_grounded_facts":
            raise ValueError("response repair cannot contradict grounded user facts")
        return self
