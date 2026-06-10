from __future__ import annotations

from pydantic import BaseModel, Field

from app.orchestration.quality import TurnQualityReport


class ResponseDiagnostic(BaseModel):
    failed_gate_names: list[str] = Field(default_factory=list)
    repairable: bool = False
    repair_instruction: str | None = None
    summary: str


def diagnose_response_failure(report: TurnQualityReport) -> ResponseDiagnostic:
    failed_gate_names = [gate.name for gate in report.gates if not gate.passed]
    return ResponseDiagnostic(
        failed_gate_names=failed_gate_names,
        repairable=report.repairable,
        repair_instruction=report.repair_reason,
        summary="; ".join(
            gate.message or gate.name for gate in report.gates if not gate.passed
        )
        or "response validation failed",
    )
