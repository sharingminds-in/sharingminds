from app.llm.prompts import PROMPTS


def test_prompt_registry_has_route_specific_prompt_specs():
    expected = {
        "conversation_supervisor": "ConversationSupervisorDecision",
        "signal_extraction": "ExtractedSignals",
        "soft_response_composer": "SoftResponseDraft",
        "goal_workbench": "GoalWorkbenchDraft",
        "resource_response_composer": "ResourceResponseDraft",
        "expert_matching_planner": "ExpertPlanningDraft",
        "expert_elevation_composer": "RecommendationBundle",
        "correction_patch": "CorrectionPatchDraft",
        "correction_composer": "CorrectionResponseDraft",
        "boundary_composer": "BoundaryResponseDraft",
        "response_repair": "ResponseRepairBundle",
    }

    for prompt_id, schema_name in expected.items():
        spec = PROMPTS[prompt_id]

        assert spec.prompt_id == prompt_id
        assert spec.version == "v1"
        assert spec.output_schema_name == schema_name
        assert spec.system_prompt
        assert spec.quality_gates


def test_soft_response_prompt_prioritizes_current_turn_over_history():
    prompt = PROMPTS["soft_response_composer"].system_prompt

    assert "current user_message is the task" in prompt.lower()
    assert "recent_turns" in prompt
    assert "meta_question" in prompt
    assert "answer the capability/scope question directly" in prompt
