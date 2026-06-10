import json

from app.llm.schemas import PendingInteraction
from app.orchestration.context_pack import (
    CHARS_PER_TOKEN,
    TURN_RESOLUTION_TOKEN_BUDGET,
    pack_turn_resolution_context,
)


def test_turn_resolution_context_omits_raw_state_and_stays_under_budget():
    pending = PendingInteraction(
        pending_interaction_id="pending-timeline",
        target_flow="goal_companion",
        question_type="goal_clarification",
        expected_answer_schema={
            "allowed_slot_patch_fields": ["timeline", "goal_clarification"],
        },
        slot_targets=["timeline"],
        original_question_text="Model-generated question asking only for the timeline.",
    )
    huge_signal_snapshot = {
        "raw_provenance_blob": "x" * 50_000,
        "active_goal": {
            "active_goal_key": "goal-1",
            "goal_type": "study_planning",
            "goal_summary": "Study abroad planning with a confirmed budget.",
            "collected_fields": {
                "budget": {
                    "raw_budget_text": "unusual literal budget",
                    "confirmed_literal": True,
                },
                "study_level": "doctoral level",
                "subject_field": "computer science",
                "geography": ["London"],
                "irrelevant_blob": "y" * 20_000,
            },
            "missing_fields": ["timeline"],
            "next_action": "Ask only for timeline.",
            "plan_version": 3,
            "unused": "z" * 20_000,
        },
    }
    turns = [
        {
            "actor": "assistant",
            "responseBlocks": [
                {
                    "type": "reflection",
                    "content": "visible assistant text",
                    "metadata": {"trace": "not-for-model", "blob": "w" * 20_000},
                }
            ],
        },
        {"actor": "user", "inputText": "prior user detail"},
        {"actor": "assistant", "content": "short visible question"},
        {"actor": "user", "inputText": "latest before pending answer"},
    ]

    packed = pack_turn_resolution_context(
        user_message="timeline answer",
        pending_interaction=pending,
        turns=turns,
        signal_snapshot=huge_signal_snapshot,
        memory_item_count=17,
        actor={"authenticated": True},
        platform_policy={"canRecommendExperts": True, "canRecommendResources": True},
        allowed_resolution_types=[
            "answer_to_pending_question",
            "new_user_intent",
            "interrupt",
            "correction",
            "unsupported",
        ],
    )

    payload_text = json.dumps(packed.payload, ensure_ascii=True, sort_keys=True)
    assert len(payload_text) <= TURN_RESOLUTION_TOKEN_BUDGET * CHARS_PER_TOKEN
    assert "raw_provenance_blob" not in payload_text
    assert "responseBlocks" not in payload_text
    assert "metadata" not in payload_text
    assert "memory_items" not in payload_text
    assert "raw_signal_snapshot" not in payload_text
    assert packed.payload["memory_item_count"] == 17
    assert len(packed.payload["last_turns"]) == 2
    assert packed.payload["pending_question"]["allowed_slot_patch_fields"] == [
        "timeline",
        "goal_clarification",
    ]
    assert packed.payload["active_goal_card"]["missing_fields"] == ["timeline"]
    assert packed.trace.contextPackName == "turn_resolution"
    assert packed.trace.rawContextOmitted is True
    assert packed.trace.compactedTurnCount == 2
    assert packed.trace.memoryItemCountBefore == 17
    assert packed.trace.activeGoalIncluded is True
