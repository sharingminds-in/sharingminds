from app.matching.models import PlatformBoostRule, PlatformCandidate, ScoredCandidate


def _normalize(value: str) -> str:
    return (
        value.strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )


def _tokenize(values: list[str]) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        normalized = _normalize(value)
        if normalized:
            tokens.add(normalized)
            tokens.update(part for part in normalized.split() if len(part) > 2)
    return tokens


def _overlap_score(left: list[str], right: list[str]) -> float:
    if not left or not right:
        return 0.0
    left_tokens = _tokenize(left)
    right_tokens = _tokenize(right)
    if not left_tokens or not right_tokens:
        return 0.0
    intersection = len(left_tokens.intersection(right_tokens))
    denominator = max(len(left_tokens), len(right_tokens))
    return min(1.0, intersection / denominator if denominator else 0.0)


def _best_pair_overlap_score(left: list[str], right: list[str]) -> float:
    if not left or not right:
        return 0.0
    return max(
        (_overlap_score([left_value], [right_value]) for left_value in left for right_value in right),
        default=0.0,
    )


def _matching_values(left: list[str], right: list[str]) -> list[str]:
    if not left or not right:
        return []
    right_tokens = _tokenize(right)
    matches: list[str] = []
    for value in left:
        normalized = _normalize(value)
        if not normalized:
            continue
        value_tokens = {normalized, *[part for part in normalized.split() if len(part) > 2]}
        if value_tokens.intersection(right_tokens):
            matches.append(value)
    return matches


def _primary_values(signal_snapshot: dict, key: str) -> list[str]:
    value = signal_snapshot.get(key)
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def score_intent_match(signal_snapshot: dict, candidate: PlatformCandidate) -> float:
    user_intents = _primary_values(signal_snapshot, "intents")
    return max(
        _overlap_score(user_intents, candidate.intentTags),
        _overlap_score(user_intents, candidate.expertise),
    )


def score_outcome_match(signal_snapshot: dict, candidate: PlatformCandidate) -> float:
    user_outcomes = _primary_values(signal_snapshot, "outcomes")
    return _overlap_score(user_outcomes, candidate.outcomeTags)


def score_persona_match(signal_snapshot: dict, candidate: PlatformCandidate) -> float:
    user_stage = _primary_values(signal_snapshot, "stage")
    return _overlap_score(user_stage, candidate.personaFitTags)


def score_expertise_relevance(signal_snapshot: dict, candidate: PlatformCandidate) -> float:
    canonical_domain_context = _primary_values(signal_snapshot, "canonical_domains")
    user_context = [
        *_primary_values(signal_snapshot, "intents"),
        *_primary_values(signal_snapshot, "outcomes"),
        *_primary_values(signal_snapshot, "industries"),
        *_primary_values(signal_snapshot, "geography"),
        *_primary_values(signal_snapshot, "constraints"),
        *canonical_domain_context,
        *_primary_values(signal_snapshot, "mentor_category"),
        *_primary_values(signal_snapshot, "expertise_keywords"),
    ]
    candidate_context = [
        *candidate.expertise,
        *candidate.industryTags,
        candidate.industry or "",
        candidate.title or "",
        candidate.headline or "",
        candidate.about or "",
    ]
    return max(
        _overlap_score(user_context, candidate_context),
        _overlap_score(_primary_values(signal_snapshot, "industries"), candidate.industryTags),
        _best_pair_overlap_score(_primary_values(signal_snapshot, "industries"), candidate_context),
        _overlap_score(canonical_domain_context, candidate_context),
        _best_pair_overlap_score(canonical_domain_context, candidate_context),
    )


def score_conversion_probability(candidate: PlatformCandidate) -> float:
    review_component = min(candidate.metrics.avgReviewScore / 5.0, 1.0) * 0.35
    completed_component = min(candidate.metrics.completedSessions, 15) / 15 * 0.25
    booking_component = min(candidate.metrics.recentBookings30d, 6) / 6 * 0.15
    completion_component = min(candidate.metrics.recentCompletions90d, 10) / 10 * 0.15
    existing_component = candidate.conversionScore * 0.10
    return min(1.0, review_component + completed_component + booking_component + completion_component + existing_component)


def _boost_applies(signal_snapshot: dict, boost_rule: PlatformBoostRule) -> bool:
    if not boost_rule.categoryScope:
        return True
    intents = _primary_values(signal_snapshot, "intents")
    outcomes = _primary_values(signal_snapshot, "outcomes")
    stage = _primary_values(signal_snapshot, "stage")
    for scope_key, values in boost_rule.categoryScope.items():
        scope_values = values if isinstance(values, list) else [values]
        if scope_key == "intents" and _overlap_score(intents, [str(item) for item in scope_values]) > 0:
            return True
        if scope_key == "outcomes" and _overlap_score(outcomes, [str(item) for item in scope_values]) > 0:
            return True
        if scope_key == "stages" and _overlap_score(stage, [str(item) for item in scope_values]) > 0:
            return True
    return False


def score_admin_priority(signal_snapshot: dict, candidate: PlatformCandidate, relevance_floor: float) -> float:
    if relevance_floor < 0.35:
        return 0.0
    applicable = [rule for rule in candidate.activeBoostRules if _boost_applies(signal_snapshot, rule)]
    if not applicable:
        return 0.0
    scored_rules: list[float] = []
    for rule in applicable:
        if rule.maxImpressions is not None and candidate.metrics.recentImpressions7d >= rule.maxImpressions:
            continue

        multiplier_score = max(0.0, min(1.0, (rule.priorityMultiplier - 1.0) / 1.5))
        inclusion_cap_factor = max(0.0, min(1.0, rule.inclusionPercentageCap / 100))

        impression_headroom = 1.0
        if rule.maxImpressions and rule.maxImpressions > 0:
            impression_headroom = max(
                0.0,
                min(
                    1.0,
                    1 - (candidate.metrics.recentImpressions7d / rule.maxImpressions),
                ),
            )

        scored_rules.append(multiplier_score * inclusion_cap_factor * max(0.35, impression_headroom))

    if not scored_rules:
        return 0.0

    return max(scored_rules)


def score_exposure_balancing(candidate: PlatformCandidate) -> float:
    impressions = candidate.metrics.recentImpressions7d
    clicks = candidate.metrics.recentClicks7d
    bookings = candidate.metrics.recentBookings30d
    fatigue_penalty = min(impressions / 18, 1.0) * 0.55
    click_relief = min(clicks / 6, 1.0) * 0.10
    booking_relief = min(bookings / 4, 1.0) * 0.10
    underexposed_bonus = 0.35 if impressions <= 2 else 0.0
    raw_score = 0.6 + underexposed_bonus + click_relief + booking_relief - fatigue_penalty
    return max(0.0, min(1.0, raw_score))


def score_candidate(signal_snapshot: dict, candidate: PlatformCandidate) -> ScoredCandidate:
    intents = _primary_values(signal_snapshot, "intents")
    outcomes = _primary_values(signal_snapshot, "outcomes")
    stage_values = _primary_values(signal_snapshot, "stage")
    industry_values = _primary_values(signal_snapshot, "industries")
    canonical_domain_values = _primary_values(signal_snapshot, "canonical_domains")
    mentor_category_values = _primary_values(signal_snapshot, "mentor_category")
    expertise_keyword_values = _primary_values(signal_snapshot, "expertise_keywords")

    intent_match_score = score_intent_match(signal_snapshot, candidate)
    outcome_match_score = score_outcome_match(signal_snapshot, candidate)
    persona_match_score = score_persona_match(signal_snapshot, candidate)
    expertise_relevance_score = score_expertise_relevance(signal_snapshot, candidate)
    conversion_probability_score = score_conversion_probability(candidate)
    relevance_floor = max(intent_match_score, outcome_match_score, expertise_relevance_score)
    admin_priority_score = score_admin_priority(signal_snapshot, candidate, relevance_floor)
    exposure_balancing_score = score_exposure_balancing(candidate)

    matched_intents = _matching_values(intents, [*candidate.intentTags, *candidate.expertise])
    matched_outcomes = _matching_values(outcomes, candidate.outcomeTags)
    matched_personas = _matching_values(stage_values, candidate.personaFitTags)
    matched_industries = _matching_values(
        [
            *industry_values,
            *canonical_domain_values,
            *mentor_category_values,
            *expertise_keyword_values,
        ],
        [
            *candidate.industryTags,
            *candidate.expertise,
            candidate.industry or "",
            candidate.title or "",
            candidate.headline or "",
            candidate.about or "",
        ],
    )

    final_score = (
        intent_match_score * 0.30
        + outcome_match_score * 0.20
        + persona_match_score * 0.10
        + expertise_relevance_score * 0.15
        + conversion_probability_score * 0.10
        + admin_priority_score * 0.10
        + exposure_balancing_score * 0.05
    )

    return ScoredCandidate(
        candidate=candidate,
        intent_match_score=round(intent_match_score, 4),
        outcome_match_score=round(outcome_match_score, 4),
        persona_match_score=round(persona_match_score, 4),
        expertise_relevance_score=round(expertise_relevance_score, 4),
        conversion_probability_score=round(conversion_probability_score, 4),
        admin_priority_score=round(admin_priority_score, 4),
        exposure_balancing_score=round(exposure_balancing_score, 4),
        final_score=round(final_score, 4),
        score_explanation={
            "matched_intents": matched_intents,
            "matched_outcomes": matched_outcomes,
            "matched_personas": matched_personas,
            "matched_industries": matched_industries,
            "matched_canonical_domains": _matching_values(
                canonical_domain_values,
                [
                    *candidate.industryTags,
                    *candidate.expertise,
                    candidate.industry or "",
                    candidate.title or "",
                    candidate.headline or "",
                    candidate.about or "",
                ],
            ),
            "topIntent": matched_intents[0].replace("_", " ") if matched_intents else "",
            "topOutcome": matched_outcomes[0].replace("_", " ") if matched_outcomes else "",
            "topPersona": matched_personas[0].replace("_", " ") if matched_personas else "",
        },
    )
