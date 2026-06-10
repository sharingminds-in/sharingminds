from dataclasses import replace
from typing import Any

from app.llm.prompts import build_conversation_supervisor_prompt
from app.llm.provider import LlmCallResult, LlmProvider
from app.llm.schemas import ConversationSupervisorDecision, SupervisorRoute, TurnPolicy


SOFT_RESPONSE_ACTS = {
    "chitchat",
    "meta_question",
    "cancel_or_restart",
    "repeat",
    "unsupported",
}


def _policy(
    *,
    allow_extraction: bool,
    allow_tools: bool,
    allow_recommendations: bool,
    allow_memory_updates: bool,
    allow_question: bool,
    response_mode: str,
) -> TurnPolicy:
    return TurnPolicy(
        allow_extraction=allow_extraction,
        allow_planning=True,
        allow_tools=allow_tools,
        allow_recommendations=allow_recommendations,
        allow_memory_updates=allow_memory_updates,
        allow_usage_metering=False,
        allow_question=allow_question,
        response_mode=response_mode,  # type: ignore[arg-type]
    )


ROUTE_TABLE: dict[str, SupervisorRoute] = {
    "goal_help": SupervisorRoute(
        conversation_act="goal_help",
        active_flow="goal_companion",
        turn_policy=_policy(
            allow_extraction=True,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion",
        ),
    ),
    "expert_request": SupervisorRoute(
        conversation_act="expert_request",
        active_flow="expert_matching",
        turn_policy=_policy(
            allow_extraction=True,
            allow_tools=True,
            allow_recommendations=True,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion",
        ),
    ),
    "resource_request": SupervisorRoute(
        conversation_act="resource_request",
        active_flow="resource_search",
        turn_policy=_policy(
            allow_extraction=True,
            allow_tools=True,
            allow_recommendations=True,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="goal_companion",
        ),
    ),
    "platform_help": SupervisorRoute(
        conversation_act="platform_help",
        active_flow="platform_help",
        turn_policy=_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=False,
            response_mode="soft_response",
        ),
    ),
    "chitchat": SupervisorRoute(
        conversation_act="chitchat",
        active_flow="soft_response",
        turn_policy=_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=False,
            response_mode="soft_response",
        ),
    ),
    "meta_question": SupervisorRoute(
        conversation_act="meta_question",
        active_flow="soft_response",
        turn_policy=_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=False,
            response_mode="soft_response",
        ),
    ),
    "correction": SupervisorRoute(
        conversation_act="correction",
        active_flow="repair",
        turn_policy=_policy(
            allow_extraction=True,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=True,
            allow_question=True,
            response_mode="repair",
        ),
    ),
    "cancel_or_restart": SupervisorRoute(
        conversation_act="cancel_or_restart",
        active_flow="soft_response",
        turn_policy=_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=False,
            response_mode="soft_response",
        ),
    ),
    "repeat": SupervisorRoute(
        conversation_act="repeat",
        active_flow="soft_response",
        turn_policy=_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=False,
            response_mode="soft_response",
        ),
    ),
    "resume_previous_flow": SupervisorRoute(
        conversation_act="resume_previous_flow",
        active_flow="goal_companion",
        turn_policy=_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=True,
            response_mode="goal_companion",
        ),
    ),
    "unsupported": SupervisorRoute(
        conversation_act="unsupported",
        active_flow="soft_response",
        turn_policy=_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=False,
            response_mode="soft_response",
        ),
    ),
    "safety": SupervisorRoute(
        conversation_act="safety",
        active_flow="safety",
        turn_policy=_policy(
            allow_extraction=False,
            allow_tools=False,
            allow_recommendations=False,
            allow_memory_updates=False,
            allow_question=False,
            response_mode="safety",
        ),
    ),
}

TURN_POLICIES: dict[str, TurnPolicy] = {
    key: route.turn_policy for key, route in ROUTE_TABLE.items()
}


def enforce_turn_policy(decision: ConversationSupervisorDecision) -> ConversationSupervisorDecision:
    route = ROUTE_TABLE[decision.conversation_act]
    return decision.model_copy(
        update={
            "turn_policy": route.turn_policy,
            "active_flow": route.active_flow,
        }
    )


async def classify_conversation_turn(
    provider: LlmProvider,
    *,
    user_message: str,
    phase: str,
    turns: list[dict[str, Any]],
    signal_snapshot: dict[str, Any],
) -> LlmCallResult[ConversationSupervisorDecision]:
    payload = {
        "user_message": user_message,
        "current_phase": phase,
        "recent_turns": turns[-6:],
        "current_signal_snapshot": signal_snapshot,
        "known_conversation_acts": list(TURN_POLICIES.keys()),
    }
    result = await provider.generate_structured(
        system_prompt=build_conversation_supervisor_prompt(),
        user_payload=payload,
        response_model=ConversationSupervisorDecision,
        prompt_id="conversation_supervisor",
        prompt_version="v1",
    )
    return replace(result, parsed=enforce_turn_policy(result.parsed))
