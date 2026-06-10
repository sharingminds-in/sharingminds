from typing import Any

from pydantic import BaseModel, Field


class SignalEvidence(BaseModel):
    source: str
    excerpt: str | None = None
    detail: str | None = None


class SignalUpdate(BaseModel):
    signal_type: str
    signal_value: str
    confidence: float
    evidence: list[SignalEvidence] = Field(default_factory=list)


class NormalizedSignals(BaseModel):
    snapshot: dict[str, Any] = Field(default_factory=dict)
    updates: list[SignalUpdate] = Field(default_factory=list)
