from app.orchestration.state import choose_conversation_phase


def test_phase_moves_to_micro_consent_when_context_exists_but_no_yes_yet():
    phase = choose_conversation_phase(
        phase_before="mini_clarity",
        signal_snapshot={
            "supported_use_case": True,
            "intents": ["career_growth"],
            "outcomes": ["clarity"],
            "stage": "mid_career_professional",
            "emotions": ["uncertainty"],
            "constraints": ["time"],
            "consent_signal": "unsure",
            "explicit_expert_request": False,
        },
        turn_count=3,
    )

    assert phase == "micro_consent"


def test_phase_moves_to_framework_after_positive_consent():
    phase = choose_conversation_phase(
        phase_before="micro_consent",
        signal_snapshot={
            "supported_use_case": True,
            "intents": ["career_growth"],
            "outcomes": ["clarity"],
            "stage": "mid_career_professional",
            "emotions": ["uncertainty"],
            "constraints": ["time"],
            "consent_signal": "yes",
            "explicit_expert_request": False,
        },
        turn_count=4,
    )

    assert phase == "framework"
