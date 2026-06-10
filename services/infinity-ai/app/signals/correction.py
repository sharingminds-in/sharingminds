from __future__ import annotations

from typing import Any

from app.llm.prompts import PROMPTS, build_correction_patch_prompt
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import CorrectionPatchDraft
from app.signals.models import NormalizedSignals, SignalEvidence, SignalUpdate


async def generate_correction_patch(
    provider: LlmProvider,
    *,
    user_message: str,
    history: list[dict[str, Any]],
    signal_snapshot: dict[str, Any],
) -> LlmCallResult[CorrectionPatchDraft]:
    return await provider.generate_structured(
        system_prompt=build_correction_patch_prompt(),
        user_payload={
            "user_message": user_message,
            "recent_turns": history[-6:],
            "current_signal_snapshot": signal_snapshot,
            "allowed_patch_fields": [
                "geography_add",
                "geography_remove",
                "constraints_add",
                "constraints_remove",
            ],
        },
        response_model=CorrectionPatchDraft,
        prompt_id=PROMPTS["correction_patch"].prompt_id,
        prompt_version=PROMPTS["correction_patch"].version,
    )


def apply_correction_patch(
    patch: CorrectionPatchDraft,
    previous_snapshot: dict[str, Any],
    latest_user_message: str,
) -> NormalizedSignals:
    snapshot = dict(previous_snapshot or {})
    updates: list[SignalUpdate] = []

    if not patch.supported_correction:
        return NormalizedSignals(snapshot=snapshot, updates=[])

    _apply_list_patch(
        snapshot=snapshot,
        updates=updates,
        key="geography",
        signal_type="geography",
        add_values=patch.geography_add,
        remove_values=patch.geography_remove,
        confidence=patch.confidence,
        latest_user_message=latest_user_message,
    )
    _apply_list_patch(
        snapshot=snapshot,
        updates=updates,
        key="constraints",
        signal_type="constraint",
        add_values=patch.constraints_add,
        remove_values=patch.constraints_remove,
        confidence=patch.confidence,
        latest_user_message=latest_user_message,
    )

    return NormalizedSignals(snapshot=snapshot, updates=updates)


def _apply_list_patch(
    *,
    snapshot: dict[str, Any],
    updates: list[SignalUpdate],
    key: str,
    signal_type: str,
    add_values: list[str],
    remove_values: list[str],
    confidence: float,
    latest_user_message: str,
) -> None:
    existing = _normalized_values(snapshot.get(key))
    add = _normalized_values(add_values)
    remove = _normalized_values(remove_values)
    remove_hits = [value for value in remove if value in existing]

    if not existing or (remove and not remove_hits):
        return

    changed = False
    next_values = [value for value in existing if value not in remove_hits]
    if remove_hits:
        changed = True

    for value in add:
        if value not in next_values:
            next_values.append(value)
            changed = True
            updates.append(
                SignalUpdate(
                    signal_type=signal_type,
                    signal_value=value,
                    confidence=confidence or 0.75,
                    evidence=[
                        SignalEvidence(
                            source="bounded_correction_patch",
                            excerpt=latest_user_message,
                            detail=(
                                f"Corrected {key}; removed {', '.join(remove_hits)}"
                                if remove_hits
                                else f"Corrected existing {key}"
                            ),
                        )
                    ],
                )
            )

    if changed:
        snapshot[key] = next_values


def _normalized_values(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        stripped = item.strip().lower()
        if stripped and stripped not in normalized:
            normalized.append(stripped)
    return normalized
