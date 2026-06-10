from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


ExecutionStepStatus = Literal["running", "completed", "failed", "skipped"]

ArtifactKind = Literal[
    "conversation_act",
    "signal_snapshot",
    "response_blocks",
    "candidate_pool",
    "score_breakdown",
    "selected_slots",
    "memory_update",
    "quality_report",
    "policy_snapshot",
    "llm_call",
    "tool_result",
    "diagnostic",
]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class InfinityExecutionStep(BaseModel):
    step_name: str
    status: ExecutionStepStatus
    started_at: datetime = Field(default_factory=_utc_now)
    completed_at: datetime | None = None
    duration_ms: int | None = Field(default=None, ge=0)
    conversation_act: str | None = None
    active_flow: str | None = None
    phase_before: str | None = None
    phase_after: str | None = None
    tool_name: str | None = None
    model_call_id: str | None = None
    row_count: int | None = Field(default=None, ge=0)
    candidate_count: int | None = Field(default=None, ge=0)
    selected_count: int | None = Field(default=None, ge=0)
    quality_score: float | None = Field(default=None, ge=0, le=1)
    error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class InfinityArtifact(BaseModel):
    id: str
    kind: ArtifactKind
    title: str
    content: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_utc_now)
