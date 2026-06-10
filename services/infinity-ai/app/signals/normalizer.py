from app.llm.schemas import ExtractedSignals
from app.signals.models import NormalizedSignals, SignalEvidence, SignalUpdate


def _has_explicit_positive_consent(user_message: str | None) -> bool:
    if not user_message:
        return False
    normalized = user_message.strip().lower()
    positive_phrases = [
        "yes",
        "yes,",
        "yes.",
        "yes ",
        "sounds helpful",
        "that sounds helpful",
        "go ahead",
        "let's do it",
        "lets do it",
        "show me",
        "walk me through",
    ]
    return any(phrase in normalized for phrase in positive_phrases)


def _merge_unique(existing: list[str], incoming: list[str]) -> list[str]:
    seen: list[str] = []
    for value in [*existing, *incoming]:
        normalized = value.strip().lower()
        if normalized and normalized not in seen:
            seen.append(normalized)
    return seen


def normalize_extracted_signals(
    extracted: ExtractedSignals,
    previous_snapshot: dict[str, object] | None,
    latest_user_message: str | None = None,
) -> NormalizedSignals:
    snapshot = dict(previous_snapshot or {})
    updates: list[SignalUpdate] = []

    def push(signal_type: str, values: list[str], confidence: float) -> None:
        for value in values:
            updates.append(
                SignalUpdate(
                    signal_type=signal_type,
                    signal_value=value,
                    confidence=confidence,
                    evidence=[
                        SignalEvidence(
                            source="llm_extraction",
                            excerpt=" | ".join(extracted.evidence.get(signal_type, [])[:2]) or None,
                        )
                    ],
                )
            )

    intents = _merge_unique(
        list(snapshot.get("intents", [])) if isinstance(snapshot.get("intents"), list) else [],
        [value for value in [extracted.primary_intent, *extracted.secondary_intents] if value],
    )
    outcomes = _merge_unique(
        list(snapshot.get("outcomes", [])) if isinstance(snapshot.get("outcomes"), list) else [],
        extracted.desired_outcomes,
    )
    emotions = _merge_unique(
        list(snapshot.get("emotions", [])) if isinstance(snapshot.get("emotions"), list) else [],
        extracted.emotions,
    )
    geography = _merge_unique(
        list(snapshot.get("geography", [])) if isinstance(snapshot.get("geography"), list) else [],
        extracted.geography,
    )
    industries = _merge_unique(
        list(snapshot.get("industries", [])) if isinstance(snapshot.get("industries"), list) else [],
        extracted.industries,
    )
    constraints = _merge_unique(
        list(snapshot.get("constraints", [])) if isinstance(snapshot.get("constraints"), list) else [],
        extracted.constraints,
    )

    consent_signal = extracted.consent_signal
    previous_consent = snapshot.get("consent_signal")
    if (
        consent_signal == "yes"
        and not extracted.explicit_expert_request
        and not _has_explicit_positive_consent(latest_user_message)
    ):
        consent_signal = previous_consent if isinstance(previous_consent, str) and previous_consent == "yes" else "unsure"

    snapshot.update(
        {
            "supported_use_case": extracted.supported_use_case,
            "support_boundary_note": extracted.support_boundary_note,
            "primary_intent": extracted.primary_intent,
            "intents": intents,
            "outcomes": outcomes,
            "stage": extracted.user_stage,
            "emotions": emotions,
            "urgency": extracted.urgency,
            "geography": geography,
            "industries": industries,
            "constraints": constraints,
            "clarity_level": extracted.clarity_level,
            "consent_signal": consent_signal,
            "explicit_expert_request": extracted.explicit_expert_request,
        }
    )

    push("intent", intents, extracted.confidence.get("intent", 0.75))
    push("outcome", outcomes, extracted.confidence.get("outcome", 0.70))
    if extracted.user_stage:
        push("stage", [extracted.user_stage], extracted.confidence.get("stage", 0.65))
    push("emotion", emotions, extracted.confidence.get("emotion", 0.70))
    if extracted.urgency:
        push("urgency", [extracted.urgency], extracted.confidence.get("urgency", 0.65))
    push("geography", geography, extracted.confidence.get("geography", 0.60))
    push("industry", industries, extracted.confidence.get("industry", 0.65))
    push("constraint", constraints, extracted.confidence.get("constraint", 0.65))
    push("consent", [consent_signal], 0.90)
    push("clarity_level", [extracted.clarity_level], 0.90)

    if not extracted.supported_use_case and extracted.support_boundary_note:
        push("support_boundary", [extracted.support_boundary_note], 0.95)

    return NormalizedSignals(snapshot=snapshot, updates=updates)
