from app.matching.models import ScoredCandidate, ScoredResourceCandidate


def _non_empty_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _block_has_renderable_content(block: dict) -> bool:
    if block.get("type") == "sign_in_cta":
        return True
    return any(
        [
            block.get("title"),
            block.get("content"),
            block.get("question"),
            block.get("suggestedReply"),
            block.get("items"),
            block.get("experts"),
            block.get("resources"),
        ]
    )


def _first_suggested_reply(strategy) -> str | None:
    replies = getattr(strategy, "suggested_replies", None) or []
    for reply in replies:
        clean = _non_empty_string(reply)
        if clean:
            return clean
    return None


def _attach_suggested_reply(blocks: list[dict], strategy) -> None:
    suggested_reply = _first_suggested_reply(strategy)
    if not suggested_reply:
        return
    if any(block.get("suggestedReply") for block in blocks):
        return
    for block in reversed(blocks):
        if block.get("type") in {
            "reflection",
            "insight",
            "direction",
            "clarification",
            "micro_consent",
        } and not block.get("suggestedReply"):
            block["suggestedReply"] = suggested_reply
            return


def build_response_blocks(
    *,
    strategy,
    mini_framework,
    recommendation_bundle,
    selected_candidates: list[ScoredCandidate],
    selected_resource_candidates: list[ScoredResourceCandidate] | None = None,
    memory_items: list[dict],
    show_sign_in_cta: bool = False,
) -> list[dict]:
    blocks: list[dict] = []
    expert_card_reasons: dict[str, str] = {}
    selected_resource_candidates = selected_resource_candidates or []

    if strategy.soft_response_text:
        blocks.append({"type": "soft_response", "content": strategy.soft_response_text})
    if strategy.reflection_text:
        blocks.append({"type": "reflection", "content": strategy.reflection_text})
    if strategy.insight_text:
        blocks.append({"type": "insight", "content": strategy.insight_text})
    if strategy.direction_text:
        blocks.append({"type": "direction", "content": strategy.direction_text})
    if strategy.clarification_question:
        blocks.append(
            {
                "type": "clarification",
                "question": strategy.clarification_question,
            }
        )
    if strategy.micro_consent_prompt:
        blocks.append(
            {
                "type": "micro_consent",
                "content": strategy.micro_consent_prompt,
                "suggestedReply": strategy.micro_consent_suggested_reply,
            }
        )
    _attach_suggested_reply(blocks, strategy)
    if mini_framework and (mini_framework.items or mini_framework.intro):
        blocks.append(
            {
                "type": "mini_framework",
                "title": mini_framework.title,
                "content": mini_framework.intro,
                "items": [
                    {"title": item.title, "body": item.body}
                    for item in mini_framework.items
                ],
            }
        )

    if recommendation_bundle and recommendation_bundle.expert_elevation:
        expert_elevation = recommendation_bundle.expert_elevation
        expert_card_reasons = {
            key: value
            for key, value in expert_elevation.expert_card_reasons.items()
            if _non_empty_string(key) and _non_empty_string(value)
        }
        blocks.append(
            {
                "type": "expert_elevation",
                "title": expert_elevation.title,
                "content": expert_elevation.intro,
                "metadata": {
                    "reasonBullets": expert_elevation.reason_bullets,
                    "transitionText": expert_elevation.transition_text,
                },
            }
        )

    if selected_candidates:
        blocks.append(
            {
                "type": "expert_cards",
                "experts": [
                    {
                        "mentorProfileId": candidate.candidate.mentorProfileId,
                        "mentorUserId": candidate.candidate.mentorUserId,
                        "name": candidate.candidate.name,
                        "title": candidate.candidate.title,
                        "company": candidate.candidate.company,
                        "industry": candidate.candidate.industry,
                        "location": candidate.candidate.location,
                        "image": candidate.candidate.image,
                        "headline": candidate.candidate.headline,
                        "hourlyRate": candidate.candidate.hourlyRate,
                        "currency": candidate.candidate.currency,
                        "expertise": candidate.candidate.expertise[:4],
                        "reasonSummary": expert_card_reasons.get(
                            candidate.candidate.mentorProfileId
                        ),
                        "scoreSummary": [
                            candidate.score_explanation.get("topIntent", ""),
                            candidate.score_explanation.get("topOutcome", ""),
                            candidate.score_explanation.get("topPersona", ""),
                        ],
                        "slotType": candidate.slot_type,
                        "finalScore": candidate.final_score,
                    }
                    for candidate in selected_candidates[:3]
                ],
            }
        )

    if selected_resource_candidates:
        blocks.append(
            {
                "type": "resource_cards",
                "resources": [
                    {
                        "resourceId": candidate.candidate.resourceId,
                        "resourceType": candidate.candidate.resourceType,
                        "title": candidate.candidate.title,
                        "description": candidate.candidate.description,
                        "href": candidate.candidate.href,
                        "source": candidate.candidate.source,
                        "visibility": candidate.candidate.visibility,
                        "providerName": candidate.candidate.providerName,
                        "category": candidate.candidate.category,
                        "difficulty": candidate.candidate.difficulty,
                        "durationMinutes": candidate.candidate.durationMinutes,
                        "price": candidate.candidate.price,
                        "currency": candidate.candidate.currency,
                        "image": candidate.candidate.image,
                        "tags": candidate.candidate.tags[:5],
                        "learningOutcomes": candidate.candidate.learningOutcomes[:3],
                        "scoreSummary": [
                            *candidate.score_explanation.get("matched_intents", [])[:1],
                            *candidate.score_explanation.get("matched_outcomes", [])[:1],
                            *candidate.score_explanation.get("matched_context", [])[:1],
                        ],
                        "slotType": candidate.slot_type,
                        "finalScore": candidate.final_score,
                    }
                    for candidate in selected_resource_candidates[:3]
                ],
            }
        )

    if show_sign_in_cta:
        blocks.append(
            {
                "type": "sign_in_cta",
                "metadata": {"reason": "expert_or_memory_continuity_requires_auth"},
            }
        )

    if recommendation_bundle and recommendation_bundle.session_readiness:
        readiness = recommendation_bundle.session_readiness
        blocks.append(
            {
                "type": "session_readiness",
                "title": readiness.title,
                "content": readiness.summary,
                "metadata": {
                    "sections": [
                        {"title": section.title, "items": section.items}
                        for section in readiness.sections
                    ],
                    "focusAreas": readiness.focus_areas,
                    "decisionsToClarify": readiness.decisions_to_clarify,
                    "constraintsToShare": readiness.constraints_to_share,
                    "questionsToAsk": readiness.questions_to_ask,
                },
            }
        )

    return [block for block in blocks if _block_has_renderable_content(block)]
