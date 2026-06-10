import pytest

from app.llm.schemas import ConversationSupervisorDecision, TurnPolicy
from app.orchestration.supervisor import enforce_turn_policy


def _model_decision(act: str) -> ConversationSupervisorDecision:
    return ConversationSupervisorDecision(
        conversation_act=act,  # type: ignore[arg-type]
        active_flow="goal_companion",
        interrupted_flow=None,
        resume_available=False,
        flow_confidence=0.9,
        turn_policy=TurnPolicy(),
        rationale="model draft",
    )


@pytest.mark.parametrize(
    ("act", "expected_flow", "allow_extraction", "allow_tools", "allow_question"),
    [
        ("chitchat", "soft_response", False, False, False),
        ("meta_question", "soft_response", False, False, False),
        ("cancel_or_restart", "soft_response", False, False, False),
        ("repeat", "soft_response", False, False, False),
        ("unsupported", "soft_response", False, False, False),
        ("safety", "safety", False, False, False),
        ("goal_help", "goal_companion", True, False, True),
        ("resource_request", "resource_search", True, True, True),
        ("expert_request", "expert_matching", True, True, True),
        ("correction", "repair", True, False, True),
    ],
)
def test_supervisor_route_table_enforces_policy_and_flow(
    act: str,
    expected_flow: str,
    allow_extraction: bool,
    allow_tools: bool,
    allow_question: bool,
):
    enforced = enforce_turn_policy(_model_decision(act))

    assert enforced.active_flow == expected_flow
    assert enforced.turn_policy.allow_extraction is allow_extraction
    assert enforced.turn_policy.allow_tools is allow_tools
    assert enforced.turn_policy.allow_question is allow_question


def test_supervisor_route_table_keeps_soft_turns_out_of_recommendations():
    for act in ["chitchat", "meta_question", "cancel_or_restart", "repeat", "unsupported"]:
        enforced = enforce_turn_policy(_model_decision(act))

        assert enforced.active_flow == "soft_response"
        assert enforced.turn_policy.allow_recommendations is False
        assert enforced.turn_policy.allow_memory_updates is False
        assert enforced.turn_policy.allow_usage_metering is False
