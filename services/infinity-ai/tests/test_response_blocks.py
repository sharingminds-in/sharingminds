from types import SimpleNamespace

import pytest

from app.llm.schemas import (
    GoalWorkbenchDraft,
    GoalWorkbenchFields,
    GoalWorkbenchRouteDecision,
    GoalWorkbenchSuggestedReply,
    PlanBudgetSignal,
)
from app.matching.models import PlatformCandidate, ScoredCandidate
from app.orchestration.response_blocks import build_response_blocks


def _strategy(**overrides):
    values = {
        "soft_response_text": None,
        "reflection_text": None,
        "insight_text": None,
        "direction_text": None,
        "clarification_question": None,
        "micro_consent_prompt": None,
        "micro_consent_suggested_reply": None,
        "suggested_replies": [],
        "should_retrieve_experts": False,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _scored_candidate() -> ScoredCandidate:
    return ScoredCandidate(
        candidate=PlatformCandidate(
            mentorProfileId="33333333-3333-3333-3333-333333333333",
            mentorUserId="mentor-user-1",
            name="Career Mentor",
            title="Career Coach",
            company="Young Minds",
            expertise=["career growth"],
        ),
        intent_match_score=0.8,
        outcome_match_score=0.7,
        persona_match_score=0.6,
        expertise_relevance_score=0.7,
        conversion_probability_score=0.5,
        admin_priority_score=0.0,
        exposure_balancing_score=0.5,
        final_score=0.72,
        score_explanation={
            "topIntent": "career growth",
            "topOutcome": "clarity",
            "topPersona": "student",
        },
    )


def test_clarification_block_contains_question_once():
    strategy = _strategy(
        reflection_text="Hello. I'm here to help you map out, clarify, or execute your current project or goal.",
        clarification_question="Which deadline is shaping this decision most?",
    )

    blocks = build_response_blocks(
        strategy=strategy,
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[],
    )

    clarification_blocks = [block for block in blocks if block["type"] == "clarification"]

    assert len(clarification_blocks) == 1
    assert clarification_blocks[0]["question"] == "Which deadline is shaping this decision most?"
    assert "content" not in clarification_blocks[0]


def test_assembler_preserves_llm_content_even_when_it_contains_question_text():
    strategy = _strategy(
        reflection_text="Hello. Which deadline is shaping this decision most?",
        clarification_question="Which deadline is shaping this decision most?",
    )

    blocks = build_response_blocks(
        strategy=strategy,
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[],
    )

    assert blocks[0] == {
        "type": "reflection",
        "content": "Hello. Which deadline is shaping this decision most?",
    }
    assert blocks[1] == {
        "type": "clarification",
        "question": "Which deadline is shaping this decision most?",
    }


def test_assembler_preserves_question_mark_sentences_in_content():
    strategy = _strategy(
        direction_text="Would you rather focus on clarity?",
        clarification_question="Which deadline is shaping this decision most?",
        micro_consent_prompt="Would a short framework help?",
        micro_consent_suggested_reply="Yes, show me.",
    )

    blocks = build_response_blocks(
        strategy=strategy,
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[],
    )

    assert blocks[0] == {
        "type": "direction",
        "content": "Would you rather focus on clarity?",
    }
    assert blocks[1] == {
        "type": "clarification",
        "question": "Which deadline is shaping this decision most?",
    }
    assert blocks[2] == {
        "type": "micro_consent",
        "content": "Would a short framework help?",
        "suggestedReply": "Yes, show me.",
    }


def test_assembler_preserves_llm_question_output_for_quality_gate_rejection():
    blocks = build_response_blocks(
        strategy=_strategy(
            reflection_text="The model wrote a question here?",
            clarification_question="The model also supplied this question?",
        ),
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[],
    )

    assert blocks == [
        {"type": "reflection", "content": "The model wrote a question here?"},
        {"type": "clarification", "question": "The model also supplied this question?"},
    ]


def test_soft_response_joke_setup_is_not_cut():
    blocks = build_response_blocks(
        strategy=_strategy(
            soft_response_text="Why did the analyst bring a pencil? Because they wanted to draw conclusions."
        ),
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[],
    )

    assert blocks == [
        {
            "type": "soft_response",
            "content": "Why did the analyst bring a pencil? Because they wanted to draw conclusions.",
        }
    ]


def test_goal_workbench_suggested_replies_do_not_emit_action_chip_blocks():
    blocks = build_response_blocks(
        strategy=_strategy(
            reflection_text="The model created an active goal.",
            suggested_replies=["Show me a budget checklist"],
        ),
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[],
    )

    assert blocks == [
        {
            "type": "reflection",
            "content": "The model created an active goal.",
            "suggestedReply": "Show me a budget checklist",
        }
    ]
    assert "action_chips" not in [block["type"] for block in blocks]


def test_goal_workbench_placeholder_suggested_reply_fails_validation():
    with pytest.raises(ValueError, match="bracket placeholders"):
        GoalWorkbenchSuggestedReply(
            text="I’ll share my [level], [subject], and [amount]",
            kind="meaningful_action",
            action_kind="planning_artifact",
        )


def test_goal_workbench_generic_ack_suggested_reply_is_not_rendered():
    draft = GoalWorkbenchDraft(
        phase="mini_clarity",
        goal_type="study_abroad",
        goal_summary="Study planning goal with budget constraints.",
        collected_fields=GoalWorkbenchFields(
            geography=["Region Alpha"],
            constraints=["budget constraint"],
        ),
        missing_fields=["budget", "study_level", "subject_field"],
        next_action="collect concrete planning details",
        reflection_text="The model reflected the active goal.",
        clarification_question="What level, subject, and rough budget should I use?",
        suggested_replies=[
            GoalWorkbenchSuggestedReply(
                text="Please do",
                kind="generic_ack",
            )
        ],
        route_decision=GoalWorkbenchRouteDecision(target_flow="stay_goal_companion", reason=""),
        memory_updates=[],
        internal_rationale="Missing concrete planning fields.",
    )

    assert draft.suggested_replies == []


def test_goal_workbench_meaningful_suggested_reply_requires_action_kind():
    with pytest.raises(ValueError, match="require action_kind"):
        GoalWorkbenchSuggestedReply(
            text="Help me estimate costs first",
            kind="meaningful_action",
        )


def test_goal_workbench_missing_field_clarification_removes_useless_suggested_reply_and_overload():
    draft = GoalWorkbenchDraft(
        phase="mini_clarity",
        goal_type="study_abroad",
        goal_summary="Study planning goal with budget constraints.",
        collected_fields=GoalWorkbenchFields(
            geography=["Region Alpha"],
            constraints=["budget constraint"],
        ),
        missing_fields=["budget", "study_level", "subject_field"],
        next_action="collect concrete planning details",
        reflection_text="The model reflected the active goal.",
        insight_text="The model added one useful insight.",
        direction_text="The model tried to add extra direction.",
        clarification_question="What level, subject, and rough budget should I use?",
        micro_consent_prompt="The model tried to add a consent prompt.",
        micro_consent_suggested_reply=GoalWorkbenchSuggestedReply(
            text="Show me a budget checklist",
            kind="meaningful_action",
            action_kind="planning_artifact",
        ),
        suggested_replies=[
            GoalWorkbenchSuggestedReply(
                text="Show me a budget checklist",
                kind="meaningful_action",
                action_kind="planning_artifact",
            )
        ],
        mini_framework=None,
        route_decision=GoalWorkbenchRouteDecision(target_flow="stay_goal_companion", reason=""),
        memory_updates=[],
        internal_rationale="Missing concrete planning fields.",
    )

    assert draft.direction_text is None
    assert draft.micro_consent_prompt is None
    assert draft.micro_consent_suggested_reply is None
    assert draft.suggested_replies == []
    strategy = _strategy(
        reflection_text=draft.reflection_text,
        insight_text=draft.insight_text,
        clarification_question=draft.clarification_question,
        micro_consent_prompt=draft.micro_consent_prompt,
        micro_consent_suggested_reply=None,
        suggested_replies=[],
    )

    blocks = build_response_blocks(
        strategy=strategy,
        mini_framework=draft.mini_framework,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[],
    )

    assert [block["type"] for block in blocks] == ["reflection", "insight", "clarification"]
    assert all("suggestedReply" not in block for block in blocks)


def test_goal_workbench_meaningful_action_suggested_reply_renders():
    reply = GoalWorkbenchSuggestedReply(
        text="Help me estimate costs first",
        kind="meaningful_action",
        action_kind="cost_estimation",
    )
    draft = GoalWorkbenchDraft(
        phase="mini_clarity",
        goal_type="study_abroad",
        goal_summary="Study planning goal with concrete field and level.",
        collected_fields=GoalWorkbenchFields(
            budget=PlanBudgetSignal(raw_budget_text="tiny test budget"),
            study_level="doctoral level",
            subject_field="distributed systems",
            geography=["Region Alpha"],
        ),
        missing_fields=["funding_source"],
        next_action="check feasibility",
        reflection_text="The model reflected concrete details.",
        suggested_replies=[reply],
        route_decision=GoalWorkbenchRouteDecision(target_flow="stay_goal_companion", reason=""),
        memory_updates=[],
        internal_rationale="Concrete details allow a next action.",
    )

    blocks = build_response_blocks(
        strategy=_strategy(
            reflection_text=draft.reflection_text,
            suggested_replies=[item.text for item in draft.suggested_replies],
        ),
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[],
    )

    assert blocks[0]["suggestedReply"] == "Help me estimate costs first"


def test_assembler_preserves_clarification_question_for_validation():
    blocks = build_response_blocks(
        strategy=_strategy(
            soft_response_text="The model answered the current turn.",
            clarification_question="The model also supplied a question?",
        ),
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[],
    )

    assert blocks == [
        {"type": "soft_response", "content": "The model answered the current turn."},
        {"type": "clarification", "question": "The model also supplied a question?"},
    ]


def test_no_match_and_memory_do_not_emit_canned_assistant_copy():
    blocks = build_response_blocks(
        strategy=_strategy(should_retrieve_experts=True),
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[],
        memory_items=[{"content": "stored context"}],
    )

    assert blocks == []


def test_expert_card_reason_is_only_used_when_llm_provides_it():
    blocks_without_reason = build_response_blocks(
        strategy=_strategy(),
        mini_framework=None,
        recommendation_bundle=None,
        selected_candidates=[_scored_candidate()],
        memory_items=[],
    )

    expert = blocks_without_reason[0]["experts"][0]
    assert expert["reasonSummary"] is None

    blocks_with_reason = build_response_blocks(
        strategy=_strategy(),
        mini_framework=None,
        recommendation_bundle=SimpleNamespace(
            expert_elevation=SimpleNamespace(
                title=None,
                intro="Generated recommendation context.",
                reason_bullets=[],
                transition_text=None,
                expert_card_reasons={
                    "33333333-3333-3333-3333-333333333333": "Generated reason for this mentor."
                },
            ),
            session_readiness=None,
        ),
        selected_candidates=[_scored_candidate()],
        memory_items=[],
    )

    expert = next(
        block for block in blocks_with_reason if block["type"] == "expert_cards"
    )["experts"][0]
    assert expert["reasonSummary"] == "Generated reason for this mentor."
