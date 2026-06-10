from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field

from app.llm.schemas import ActiveFlow, ConversationAct, TurnPolicy
from app.orchestration.artifacts import InfinityArtifact, InfinityExecutionStep
from app.orchestration.budgets import TurnBudget
from app.orchestration.quality import TurnQualityReport, ValidationResult


class ContextProfile(BaseModel):
    turn_count: int = 0
    prior_phase: str
    known_intents: list[str] = Field(default_factory=list)
    known_outcomes: list[str] = Field(default_factory=list)
    known_constraints: list[str] = Field(default_factory=list)
    known_location: list[str] = Field(default_factory=list)
    memory_count: int = 0
    last_assistant_question: str | None = None
    last_recommendation_type: str | None = None
    user_is_guest: bool = False
    can_book_sessions: bool = False
    can_recommend_experts: bool = False
    can_recommend_resources: bool = False


class InfinityTurnSpec(BaseModel):
    conversation_id: str
    user_message: str
    actor: dict[str, Any]
    surface: str = "landing_page"
    conversation_act: ConversationAct
    active_flow: ActiveFlow
    turn_policy: TurnPolicy
    prior_phase: str
    prior_signal_snapshot: dict[str, Any] = Field(default_factory=dict)
    memory_items: list[dict[str, Any]] = Field(default_factory=list)
    platform_policy: dict[str, Any] = Field(default_factory=dict)
    context_profile: ContextProfile
    budget: TurnBudget


@dataclass
class PipelineState:
    conversation_id: str
    user_message: str
    actor: dict[str, Any]
    policy_context: dict[str, Any]
    phase_before: str
    phase_after: str
    signal_snapshot: dict[str, Any]
    turns: list[dict[str, Any]] = field(default_factory=list)
    memory_items: list[dict[str, Any]] = field(default_factory=list)
    budget_remaining: TurnBudget = field(default_factory=TurnBudget)
    quality: TurnQualityReport | None = None
    validation_results: list[ValidationResult] = field(default_factory=list)
    artifacts: list[InfinityArtifact] = field(default_factory=list)
    execution_steps: list[InfinityExecutionStep] = field(default_factory=list)


def choose_conversation_phase(
    *,
    phase_before: str,
    signal_snapshot: dict[str, Any],
    turn_count: int,
) -> str:
    if signal_snapshot.get("supported_use_case") is False:
        return "clarifying"

    has_intent = bool(signal_snapshot.get("intents"))
    has_outcome = bool(signal_snapshot.get("outcomes"))
    has_stage = bool(signal_snapshot.get("stage"))
    has_emotion = bool(signal_snapshot.get("emotions"))
    has_constraints = bool(signal_snapshot.get("constraints"))
    consent_signal = signal_snapshot.get("consent_signal")
    explicit_expert_request = bool(signal_snapshot.get("explicit_expert_request"))

    if not has_intent and not has_outcome:
        return "discovery" if turn_count <= 1 else "clarifying"

    if not has_stage or not has_emotion:
        return "mini_clarity"

    if consent_signal == "yes":
        return "framework"

    if explicit_expert_request and (has_constraints or turn_count >= 2):
        return "expert_elevation"

    if turn_count >= 2:
        return "micro_consent"

    return phase_before if phase_before in {"mini_clarity", "micro_consent"} else "mini_clarity"
