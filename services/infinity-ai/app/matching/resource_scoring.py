from app.matching.models import PlatformResourceCandidate, ScoredResourceCandidate
from app.matching.scoring import _matching_values, _overlap_score, _primary_values

RESOURCE_ALGORITHM_VERSION = "infinity-resource-v1"
MAX_RESOURCE_CARDS = 3


def _resource_context(candidate: PlatformResourceCandidate) -> list[str]:
    return [
        candidate.title,
        candidate.description or "",
        candidate.category or "",
        candidate.difficulty or "",
        candidate.providerName or "",
        *candidate.tags,
        *candidate.learningOutcomes,
        *candidate.intentTags,
        *candidate.outcomeTags,
    ]


def score_resource_candidate(
    signal_snapshot: dict,
    candidate: PlatformResourceCandidate,
) -> ScoredResourceCandidate:
    intents = _primary_values(signal_snapshot, "intents")
    outcomes = _primary_values(signal_snapshot, "outcomes")
    industries = _primary_values(signal_snapshot, "industries")
    geography = _primary_values(signal_snapshot, "geography")
    constraints = _primary_values(signal_snapshot, "constraints")
    resource_focus = _primary_values(signal_snapshot, "resource_focus")
    goal_clarification = _primary_values(signal_snapshot, "goal_clarification")
    expertise_keywords = _primary_values(signal_snapshot, "expertise_keywords")
    user_context = [
        *intents,
        *outcomes,
        *industries,
        *geography,
        *constraints,
        *resource_focus,
        *goal_clarification,
        *expertise_keywords,
    ]
    resource_context = _resource_context(candidate)

    intent_match_score = max(
        _overlap_score(intents, candidate.intentTags),
        _overlap_score(intents, resource_context),
    )
    outcome_match_score = max(
        _overlap_score(outcomes, candidate.outcomeTags),
        _overlap_score(outcomes, resource_context),
    )
    context_relevance_score = max(
        _overlap_score(user_context, resource_context),
        intent_match_score,
        outcome_match_score,
    )
    quality_score = min(
        1.0,
        (min(candidate.avgRating, 5.0) / 5.0) * 0.45
        + min(candidate.reviewCount, 25) / 25 * 0.20
        + min(candidate.enrollmentCount, 100) / 100 * 0.25
        + (0.10 if candidate.learningOutcomes else 0.0),
    )
    accessibility_score = 1.0 if candidate.visibility == "public" else 0.0
    final_score = (
        intent_match_score * 0.25
        + outcome_match_score * 0.20
        + context_relevance_score * 0.25
        + quality_score * 0.20
        + accessibility_score * 0.10
    )

    matched_intents = _matching_values(intents, [*candidate.intentTags, *resource_context])
    matched_outcomes = _matching_values(outcomes, [*candidate.outcomeTags, *resource_context])
    matched_context = _matching_values(user_context, resource_context)

    return ScoredResourceCandidate(
        candidate=candidate,
        intent_match_score=round(intent_match_score, 4),
        outcome_match_score=round(outcome_match_score, 4),
        context_relevance_score=round(context_relevance_score, 4),
        quality_score=round(quality_score, 4),
        accessibility_score=round(accessibility_score, 4),
        final_score=round(final_score, 4),
        score_explanation={
            "matched_intents": matched_intents,
            "matched_outcomes": matched_outcomes,
            "matched_context": matched_context[:5],
            "qualitySignals": {
                "avgRating": candidate.avgRating,
                "reviewCount": candidate.reviewCount,
                "enrollmentCount": candidate.enrollmentCount,
            },
        },
    )


def select_resource_slots(
    scored_candidates: list[ScoredResourceCandidate],
) -> list[ScoredResourceCandidate]:
    public_candidates = [
        candidate
        for candidate in sorted(scored_candidates, key=lambda item: item.final_score, reverse=True)
        if candidate.candidate.visibility == "public" and candidate.candidate.href
    ]

    selected_ids = {
        candidate.candidate.resourceId
        for candidate in public_candidates[:MAX_RESOURCE_CARDS]
    }
    return [
        candidate.model_copy(
            update={
                "selected": candidate.candidate.resourceId in selected_ids,
                "slot_type": (
                    "best_resource"
                    if index == 0
                    else "supporting_resource"
                    if index < MAX_RESOURCE_CARDS
                    else None
                ),
            }
        )
        for index, candidate in enumerate(public_candidates)
    ]
