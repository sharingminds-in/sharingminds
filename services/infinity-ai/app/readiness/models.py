from pydantic import BaseModel, Field


class SessionReadinessSnapshot(BaseModel):
    summary: str
    focus_areas: list[str] = Field(default_factory=list)
    decisions_to_clarify: list[str] = Field(default_factory=list)
    constraints_to_share: list[str] = Field(default_factory=list)
    questions_to_ask: list[str] = Field(default_factory=list)
