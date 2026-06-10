from app.llm.schemas import StrategyBundle


def test_strategy_bundle_accepts_null_memory_updates():
    payload = {
        "strategy": {
            "phase": "discovery",
            "depth_mode": "standard",
            "supported_use_case": True,
            "reflection_text": "Hello.",
            "clarification_question": "What are you focusing on?",
            "response_reason": "Need one more high-signal detail.",
        },
        "mini_framework": None,
        "memory_updates": None,
    }

    parsed = StrategyBundle.model_validate(payload)

    assert parsed.memory_updates.items == []


def test_strategy_bundle_accepts_list_memory_updates():
    payload = {
        "strategy": {
            "phase": "discovery",
            "depth_mode": "standard",
            "supported_use_case": True,
            "reflection_text": "Hello.",
            "clarification_question": "What are you focusing on?",
            "response_reason": "Need one more high-signal detail.",
        },
        "mini_framework": None,
        "memory_updates": [],
    }

    parsed = StrategyBundle.model_validate(payload)

    assert parsed.memory_updates.items == []
