from app.llm.schemas import TurnPolicy
from app.orchestration.quality import evaluate_turn_quality


def _soft_policy() -> TurnPolicy:
    return TurnPolicy(
        allow_extraction=False,
        allow_planning=True,
        allow_tools=False,
        allow_recommendations=False,
        allow_memory_updates=False,
        allow_usage_metering=False,
        allow_question=False,
        response_mode="soft_response",
    )


def _expert_policy() -> TurnPolicy:
    return TurnPolicy(
        allow_extraction=True,
        allow_planning=True,
        allow_tools=True,
        allow_recommendations=True,
        allow_memory_updates=True,
        allow_usage_metering=False,
        allow_question=True,
        response_mode="goal_companion",
    )


def _gate(report, name: str):
    return next(gate for gate in report.gates if gate.name == name)


def test_soft_response_repeating_recent_assistant_turn_fails_quality_gate():
    repeated_text = "I'm not able to tell jokes, but I can help you with a variety of tasks."
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "soft_response",
                "content": repeated_text,
            }
        ],
        turn_policy=_soft_policy(),
        conversation_act="meta_question",
        recent_turns=[
            {
                "actor": "assistant",
                "responseBlocks": [
                    {
                        "type": "soft_response",
                        "content": repeated_text,
                    }
                ],
            }
        ],
        authenticated=False,
    )

    assert report.passed is False
    assert _gate(report, "no_stale_soft_response").passed is False


def test_repeat_turn_may_return_previous_assistant_text():
    repeated_text = "Here is the previous model-generated response."
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "soft_response",
                "content": repeated_text,
            }
        ],
        turn_policy=_soft_policy(),
        conversation_act="repeat",
        recent_turns=[
            {
                "actor": "assistant",
                "responseBlocks": [
                    {
                        "type": "soft_response",
                        "content": repeated_text,
                    }
                ],
            }
        ],
        authenticated=False,
    )

    assert _gate(report, "no_stale_soft_response").passed is True


def test_question_mark_content_is_not_count_limited_or_filtered():
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "reflection",
                "content": "Generated model prose can contain one question? Or another question?",
            },
            {
                "type": "clarification",
                "question": "The model can also provide a structured question when allowed.",
            },
        ],
        turn_policy=_expert_policy(),
        conversation_act="goal_help",
        authenticated=True,
    )

    assert report.passed is True


def test_internal_only_fields_in_response_blocks_fail_structural_gate():
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "soft_response",
                "content": "Generated visible reply.",
                "internal_rationale": "Internal review note.",
            },
            {
                "type": "system_notice",
                "content": "Generated visible notice.",
                "metadata": {"traceMetadata": {"node": "internal"}},
            },
        ],
        turn_policy=_soft_policy(),
        conversation_act="chitchat",
        authenticated=False,
    )

    assert report.passed is False
    gate = _gate(report, "no_internal_field_leakage")
    assert gate.passed is False
    assert "$[0].internal_rationale" in gate.evidence["fields"]
    assert "$[1].metadata.traceMetadata" in gate.evidence["fields"]


def test_explicit_question_block_fails_when_route_disallows_questions():
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "soft_response",
                "content": "Generated model prose can contain a question mark?",
            },
            {
                "type": "clarification",
                "question": "This explicit question block is not allowed on this route.",
            },
        ],
        turn_policy=_soft_policy(),
        conversation_act="chitchat",
        authenticated=False,
    )

    assert report.passed is False
    assert _gate(report, "question_allowed").passed is False


def test_soft_turns_cannot_have_extracted_goal_signals():
    report = evaluate_turn_quality(
        response_blocks=[{"type": "soft_response", "content": "Generated soft reply."}],
        turn_policy=_soft_policy(),
        conversation_act="chitchat",
        signal_updates=[
            {
                "signalType": "primary_intent",
                "signalValue": "career_growth",
                "confidence": 0.9,
            }
        ],
        extracted_signals={"primary_intent": "career_growth"},
        authenticated=False,
    )

    assert report.passed is False
    assert _gate(report, "no_fake_signals").passed is False


def test_soft_turns_cannot_emit_expert_or_resource_cards():
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "expert_cards",
                "experts": [
                    {
                        "mentorProfileId": "33333333-3333-3333-3333-333333333333",
                        "mentorUserId": "mentor-user-1",
                    }
                ],
            },
            {
                "type": "resource_cards",
                "resources": [
                    {
                        "resourceId": "course-1",
                        "resourceType": "course",
                        "href": "/courses/course-1",
                    }
                ],
            },
        ],
        turn_policy=_soft_policy(),
        conversation_act="chitchat",
        selected_candidates=[
            {
                "mentorProfileId": "33333333-3333-3333-3333-333333333333",
                "resourceId": "course-1",
            }
        ],
        authenticated=False,
    )

    assert report.passed is False
    assert _gate(report, "recommendation_earned").passed is False


def test_soft_turns_cannot_trigger_tool_usage():
    report = evaluate_turn_quality(
        response_blocks=[{"type": "soft_response", "content": "Generated soft reply."}],
        turn_policy=_soft_policy(),
        conversation_act="chitchat",
        tool_calls=["get_expert_candidates"],
        authenticated=False,
    )

    assert report.passed is False
    assert _gate(report, "no_tool_calls_when_blocked").passed is False


def test_guest_turns_cannot_produce_durable_memory_updates():
    report = evaluate_turn_quality(
        response_blocks=[{"type": "soft_response", "content": "Generated soft reply."}],
        turn_policy=_soft_policy(),
        conversation_act="chitchat",
        memory_updates=[{"memoryType": "goal", "content": "career decision"}],
        authenticated=False,
    )

    assert report.passed is False
    assert _gate(report, "memory_allowed").passed is False


def test_expert_recommendation_blocks_require_deterministic_selected_candidates():
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "expert_cards",
                "experts": [
                    {
                        "mentorProfileId": "33333333-3333-3333-3333-333333333333",
                        "mentorUserId": "mentor-user-1",
                    }
                ],
            }
        ],
        turn_policy=_expert_policy(),
        conversation_act="expert_request",
        selected_candidates=[],
        deterministic_ranking_used=False,
        authenticated=True,
    )

    assert report.passed is False
    assert _gate(report, "candidate_ids_valid").passed is False


def test_broad_expert_request_with_candidates_but_no_selection_fails_quality_gate():
    report = evaluate_turn_quality(
        response_blocks=[{"type": "soft_response", "content": "Generated no-match copy."}],
        turn_policy=TurnPolicy(
            allow_extraction=True,
            allow_planning=True,
            allow_tools=True,
            allow_recommendations=True,
            allow_memory_updates=False,
            allow_usage_metering=False,
            allow_question=False,
            response_mode="goal_companion",
        ),
        conversation_act="expert_request",
        expert_candidate_count=6,
        selected_expert_count=0,
        expert_selection_intent="open_discovery",
        expert_no_match_is_legitimate=False,
        authenticated=False,
    )

    assert report.passed is False
    assert _gate(report, "expert_recommendation_execution_valid").passed is False


def test_empty_successful_assistant_response_fails_quality_gate():
    report = evaluate_turn_quality(
        response_blocks=[],
        turn_policy=_expert_policy(),
        conversation_act="goal_help",
        successful_response=True,
        authenticated=True,
    )

    assert report.passed is False
    assert _gate(report, "response_non_empty").passed is False


def test_metadata_only_response_block_fails_response_non_empty_gate():
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "soft_response",
                "metadata": {"trace": "not-visible"},
            }
        ],
        turn_policy=_soft_policy(),
        conversation_act="chitchat",
        successful_response=True,
        authenticated=False,
    )

    assert report.passed is False
    assert _gate(report, "response_non_empty").passed is False


def test_visible_content_passes_response_non_empty_gate():
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "soft_response",
                "content": "Generated by the model for this route.",
            }
        ],
        turn_policy=_soft_policy(),
        conversation_act="chitchat",
        successful_response=True,
        authenticated=False,
    )

    assert _gate(report, "response_non_empty").passed is True


def test_duplicate_response_after_new_concrete_details_fails_quality_gate():
    previous_blocks = [
        {
            "type": "mini_framework",
            "title": "Study planning artifact",
            "content": "Use this as a compact decision frame for the study route.",
            "items": [
                {
                    "title": "Budget reality",
                    "body": "Estimate tuition, visa, living costs, and funding gaps.",
                },
                {
                    "title": "Academic fit",
                    "body": "Match level and subject against realistic programmes.",
                },
            ],
        }
    ]
    report = evaluate_turn_quality(
        response_blocks=previous_blocks,
        turn_policy=_expert_policy(),
        conversation_act="goal_detail_answer",
        recent_turns=[
            {
                "actor": "assistant",
                "responseBlocks": previous_blocks,
            }
        ],
        user_added_concrete_details=True,
        authenticated=True,
    )

    assert report.passed is False
    assert _gate(report, "no_duplicate_response_after_new_details").passed is False


def test_new_detail_response_passes_duplicate_response_quality_gate():
    previous_blocks = [
        {
            "type": "mini_framework",
            "title": "Study planning artifact",
            "content": "Use this as a compact decision frame for the study route.",
        }
    ]
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "reflection",
                "content": (
                    "You added concrete budget, level, and field details, so this needs a feasibility pass."
                ),
            }
        ],
        turn_policy=_expert_policy(),
        conversation_act="goal_detail_answer",
        recent_turns=[
            {
                "actor": "assistant",
                "responseBlocks": previous_blocks,
            }
        ],
        user_added_concrete_details=True,
        authenticated=True,
    )

    assert _gate(report, "no_duplicate_response_after_new_details").passed is True


def test_platform_owned_decisions_are_not_allowed_in_python_output():
    report = evaluate_turn_quality(
        response_blocks=[
            {
                "type": "expert_elevation",
                "content": "Generated recommendation context.",
                "metadata": {"canBookSessions": True},
            }
        ],
        turn_policy=_expert_policy(),
        conversation_act="expert_request",
        platform_decisions={"bookingDecision": "create_session"},
        authenticated=True,
    )

    assert report.passed is False
    assert _gate(report, "platform_boundary_preserved").passed is False
    assert "bookingDecision" in _gate(
        report, "platform_boundary_preserved"
    ).evidence["platformOwnedKeys"]
    assert "canBookSessions" in _gate(
        report, "platform_boundary_preserved"
    ).evidence["platformOwnedKeys"]
