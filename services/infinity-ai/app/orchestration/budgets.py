from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


FlowName = Literal[
    "soft_response",
    "goal_companion",
    "resource_search",
    "expert_matching",
    "platform_help",
    "repair",
    "safety",
]


class TurnBudget(BaseModel):
    max_llm_calls: int = Field(default=4, ge=0)
    max_provider_retries: int = Field(default=1, ge=0)
    max_response_regenerations: int = Field(default=1, ge=0)
    max_tool_calls: int = Field(default=2, ge=0)
    max_candidates_considered: int = Field(default=50, ge=0)
    max_wall_time_ms: int = Field(default=12_000, ge=0)
    max_prompt_tokens: int = Field(default=12_000, ge=0)
    max_output_tokens: int = Field(default=2_000, ge=0)
    llm_calls_used: int = Field(default=0, ge=0)
    provider_retries_used: int = Field(default=0, ge=0)
    response_regenerations_used: int = Field(default=0, ge=0)
    tool_calls_used: int = Field(default=0, ge=0)

    @classmethod
    def for_flow(cls, flow: FlowName) -> "TurnBudget":
        if flow == "soft_response":
            return cls(max_llm_calls=2, max_tool_calls=0)
        if flow == "safety":
            return cls(max_llm_calls=2, max_tool_calls=0, max_response_regenerations=0)
        if flow == "goal_companion":
            return cls(max_llm_calls=3, max_tool_calls=0)
        if flow == "resource_search":
            return cls(max_llm_calls=4, max_tool_calls=1)
        if flow == "expert_matching":
            return cls(max_llm_calls=5, max_tool_calls=1)
        if flow == "platform_help":
            return cls(max_llm_calls=2, max_tool_calls=0)
        if flow == "repair":
            return cls(max_llm_calls=3, max_tool_calls=0)
        return cls()

    @property
    def llm_calls_remaining(self) -> int:
        return max(self.max_llm_calls - self.llm_calls_used, 0)

    @property
    def tool_calls_remaining(self) -> int:
        return max(self.max_tool_calls - self.tool_calls_used, 0)

    @property
    def response_regenerations_remaining(self) -> int:
        return max(self.max_response_regenerations - self.response_regenerations_used, 0)
