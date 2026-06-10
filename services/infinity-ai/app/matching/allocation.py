from app.matching.models import ScoredCandidate

MIN_RELEVANCE_SCORE = 0.30
MIN_PREVIEW_RELEVANCE_SCORE = 0.08
MIN_PREVIEW_FINAL_SCORE = 0.04
OPEN_DISCOVERY_MODES = {"open_discovery", "quality_first"}


def _relevance_score(candidate: ScoredCandidate) -> float:
    return max(
        candidate.intent_match_score,
        candidate.outcome_match_score,
        candidate.expertise_relevance_score,
    )


def _is_relevant(candidate: ScoredCandidate, selection_mode: str) -> bool:
    relevance_score = _relevance_score(candidate)
    if selection_mode in OPEN_DISCOVERY_MODES:
        return True
    if selection_mode == "pending_category_preview":
        return (
            relevance_score >= MIN_PREVIEW_RELEVANCE_SCORE
            or candidate.final_score >= MIN_PREVIEW_FINAL_SCORE
        )
    return relevance_score >= MIN_RELEVANCE_SCORE


def _sort_key(candidate: ScoredCandidate, selection_mode: str) -> tuple[float, ...]:
    if selection_mode == "open_discovery":
        return (
            candidate.candidate.qualityScore,
            candidate.conversion_probability_score,
            candidate.exposure_balancing_score,
            candidate.admin_priority_score,
            candidate.final_score,
        )
    if selection_mode == "quality_first":
        return (
            candidate.conversion_probability_score,
            candidate.candidate.qualityScore,
            candidate.final_score,
            candidate.exposure_balancing_score,
        )
    return (candidate.final_score,)


def select_slots(
    scored_candidates: list[ScoredCandidate],
    *,
    selection_mode: str = "standard",
    max_selected_count: int = 3,
) -> list[ScoredCandidate]:
    max_selected_count = max(1, min(3, max_selected_count))
    relevant = [
        candidate
        for candidate in sorted(
            scored_candidates,
            key=lambda item: _sort_key(item, selection_mode),
            reverse=True,
        )
        if _is_relevant(candidate, selection_mode)
    ]

    if not relevant:
        return [
            candidate.model_copy(
                update={
                    "selected": False,
                    "slot_type": None,
                    "score_explanation": {
                        **candidate.score_explanation,
                        "selectionMode": selection_mode,
                        "selectionRelevanceScore": round(_relevance_score(candidate), 4),
                    },
                }
            )
            for candidate in sorted(
                scored_candidates,
                key=lambda item: _sort_key(item, selection_mode),
                reverse=True,
            )
        ]

    selected: list[ScoredCandidate] = []

    first_slot_type = (
        "open_discovery"
        if selection_mode == "open_discovery"
        else "quality_first"
        if selection_mode == "quality_first"
        else "best_relevance"
    )
    best_match = relevant[0].model_copy(update={"selected": True, "slot_type": first_slot_type})
    selected.append(best_match)
    remaining = [candidate for candidate in relevant[1:] if candidate.candidate.mentorProfileId != best_match.candidate.mentorProfileId]

    if remaining and len(selected) < max_selected_count:
        high_trust = max(
            remaining,
            key=lambda item: (
                item.conversion_probability_score,
                item.candidate.qualityScore,
                item.final_score,
            ),
        ).model_copy(update={"selected": True, "slot_type": "high_trust"})
        selected.append(high_trust)
        remaining = [
            candidate
            for candidate in remaining
            if candidate.candidate.mentorProfileId != high_trust.candidate.mentorProfileId
        ]

    if remaining and len(selected) < max_selected_count:
        discovery = max(
            remaining,
            key=lambda item: (
                item.admin_priority_score + item.exposure_balancing_score,
                item.final_score,
            ),
        ).model_copy(update={"selected": True, "slot_type": "discovery"})
        selected.append(discovery)

    selected_ids = {candidate.candidate.mentorProfileId for candidate in selected}
    return [
        candidate.model_copy(
            update={
                "selected": candidate.candidate.mentorProfileId in selected_ids,
                "slot_type": next(
                    (
                        selected_candidate.slot_type
                        for selected_candidate in selected
                        if selected_candidate.candidate.mentorProfileId == candidate.candidate.mentorProfileId
                    ),
                    None,
                ),
                "score_explanation": {
                    **candidate.score_explanation,
                    "selectionMode": selection_mode,
                    "selectionRelevanceScore": round(_relevance_score(candidate), 4),
                },
            }
        )
        for candidate in relevant
    ]
