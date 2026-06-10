from app.matching.allocation import select_slots
from app.matching.models import PlatformCandidate, ScoredCandidate


def _scored(profile_id: str, final_score: float, conversion: float, exposure: float, admin: float) -> ScoredCandidate:
    return ScoredCandidate(
        candidate=PlatformCandidate(
            mentorProfileId=profile_id,
            mentorUserId=f"user-{profile_id}",
            name=profile_id,
        ),
        intent_match_score=0.8,
        outcome_match_score=0.7,
        persona_match_score=0.6,
        expertise_relevance_score=0.75,
        conversion_probability_score=conversion,
        admin_priority_score=admin,
        exposure_balancing_score=exposure,
        final_score=final_score,
    )


def _low_relevance_preview_candidate() -> ScoredCandidate:
    return ScoredCandidate(
        candidate=PlatformCandidate(
            mentorProfileId="preview",
            mentorUserId="user-preview",
            name="Preview Mentor",
        ),
        intent_match_score=0.0,
        outcome_match_score=0.0,
        persona_match_score=0.0,
        expertise_relevance_score=0.1,
        conversion_probability_score=0.2,
        admin_priority_score=0.0,
        exposure_balancing_score=0.6,
        final_score=0.08,
    )


def test_slot_selection_caps_at_three_and_assigns_slot_types():
    results = select_slots(
        [
            _scored("a", 0.86, 0.7, 0.4, 0.0),
            _scored("b", 0.80, 0.95, 0.3, 0.0),
            _scored("c", 0.78, 0.5, 0.9, 0.4),
            _scored("d", 0.76, 0.4, 0.2, 0.1),
        ]
    )

    selected = [item for item in results if item.selected]
    assert len(selected) == 3
    assert {item.slot_type for item in selected} == {
        "best_relevance",
        "high_trust",
        "discovery",
    }


def test_pending_category_preview_uses_lower_selection_floor():
    standard_results = select_slots([_low_relevance_preview_candidate()])
    preview_results = select_slots(
        [_low_relevance_preview_candidate()],
        selection_mode="pending_category_preview",
    )

    assert [item for item in standard_results if item.selected] == []
    selected = [item for item in preview_results if item.selected]
    assert len(selected) == 1
    assert selected[0].slot_type == "best_relevance"
    assert selected[0].score_explanation["selectionMode"] == "pending_category_preview"
