from app.matching.models import CandidateMetrics, PlatformCandidate
from app.matching.scoring import score_candidate


def test_scoring_preserves_required_formula_shape():
    candidate = PlatformCandidate(
        mentorProfileId="mentor-1",
        mentorUserId="user-1",
        name="Mentor",
        expertise=["career growth", "leadership"],
        intentTags=["career_growth"],
        outcomeTags=["clarity", "promotion"],
        personaFitTags=["mid_career_professional"],
        industryTags=["technology"],
        qualityScore=0.8,
        conversionScore=0.7,
        metrics=CandidateMetrics(
            completedSessions=8,
            avgReviewScore=4.6,
            reviewCount=12,
            recentBookings30d=3,
            recentCompletions90d=6,
        ),
    )
    signal_snapshot = {
        "intents": ["career_growth"],
        "outcomes": ["clarity", "promotion"],
        "stage": "mid_career_professional",
        "industries": ["technology"],
        "constraints": ["uncertainty"],
    }

    scored = score_candidate(signal_snapshot, candidate)

    assert 0 <= scored.intent_match_score <= 1
    assert 0 <= scored.outcome_match_score <= 1
    assert 0 <= scored.persona_match_score <= 1
    assert 0 <= scored.expertise_relevance_score <= 1
    assert 0 <= scored.conversion_probability_score <= 1
    assert 0 <= scored.admin_priority_score <= 1
    assert 0 <= scored.exposure_balancing_score <= 1
    assert scored.final_score > 0.55
    assert scored.score_explanation["matched_intents"] == ["career_growth"]
    assert scored.score_explanation["matched_outcomes"] == ["clarity", "promotion"]
    assert "reasonSummary" not in scored.score_explanation


def test_irrelevant_candidate_does_not_get_admin_rescue():
    candidate = PlatformCandidate(
        mentorProfileId="mentor-2",
        mentorUserId="user-2",
        name="Irrelevant Mentor",
        expertise=["manufacturing"],
        intentTags=["manufacturing"],
        outcomeTags=["business_growth"],
        personaFitTags=["enterprise_leader"],
        industryTags=["industrial"],
        activeBoostRules=[
            {
                "id": "rule-1",
                "mentorProfileId": "mentor-2",
                "ruleType": "featured",
                "categoryScope": {"intents": ["career_growth"]},
                "priorityMultiplier": 2.0,
                "inclusionPercentageCap": 20,
                "maxImpressions": None,
                "startsAt": "2026-01-01T00:00:00Z",
                "expiresAt": "2027-01-01T00:00:00Z",
                "status": "active",
                "reason": "campaign",
            }
        ],
    )
    signal_snapshot = {
        "intents": ["career_growth"],
        "outcomes": ["clarity"],
        "stage": "mid_career_professional",
    }

    scored = score_candidate(signal_snapshot, candidate)

    assert scored.intent_match_score == 0
    assert scored.expertise_relevance_score == 0
    assert scored.admin_priority_score == 0


def test_admin_boost_respects_caps_and_impression_limits():
    candidate = PlatformCandidate(
        mentorProfileId="mentor-3",
        mentorUserId="user-3",
        name="Capped Mentor",
        expertise=["career growth", "leadership"],
        intentTags=["career_growth"],
        outcomeTags=["clarity"],
        metrics=CandidateMetrics(
            recentImpressions7d=8,
        ),
        activeBoostRules=[
            {
                "id": "rule-2",
                "mentorProfileId": "mentor-3",
                "ruleType": "featured",
                "categoryScope": {"intents": ["career_growth"]},
                "priorityMultiplier": 2.0,
                "inclusionPercentageCap": 25,
                "maxImpressions": 10,
                "startsAt": "2026-01-01T00:00:00Z",
                "expiresAt": "2027-01-01T00:00:00Z",
                "status": "active",
                "reason": "campaign",
            }
        ],
    )

    scored = score_candidate(
        {
            "intents": ["career_growth"],
            "outcomes": ["clarity"],
            "stage": "mid_career_professional",
        },
        candidate,
    )

    assert 0 < scored.admin_priority_score < 0.3


def test_canonical_domain_signals_match_candidate_industry_without_raw_overlap():
    candidate = PlatformCandidate(
        mentorProfileId="mentor-4",
        mentorUserId="user-4",
        name="Technical Mentor",
        expertise=["software architecture", "engineering leadership"],
        intentTags=["expert_guidance"],
        outcomeTags=["clarity"],
        industryTags=["technology"],
        industry="technology",
        qualityScore=0.8,
        conversionScore=0.5,
    )

    scored = score_candidate(
        {
            "mentor_category": ["computer"],
            "canonical_domains": ["technology"],
            "industries": ["technology", "software engineering", "computer science"],
            "expertise_keywords": [
                "software",
                "programming",
                "computer science",
            ],
        },
        candidate,
    )

    assert scored.expertise_relevance_score >= 0.3
    assert "technology" in scored.score_explanation["matched_industries"]
    assert scored.score_explanation["matched_canonical_domains"] == ["technology"]
