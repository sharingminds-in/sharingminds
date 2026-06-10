from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl

from app.adapters.platform_client import PlatformClient
from app.core.config import get_settings
from app.core.errors import LlmValidationError, PlatformBridgeError, ProviderUnavailableError
from app.core.security import verify_internal_secret
from app.llm import build_provider
from app.orchestration.pipeline import run_pipeline

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])


class MessageRequest(BaseModel):
    platformBaseUrl: HttpUrl
    userMessage: str
    actor: dict


@router.post("/{conversation_id}/message", dependencies=[Depends(verify_internal_secret)])
async def process_message(conversation_id: str, payload: MessageRequest) -> dict:
    settings = get_settings()
    try:
        provider = build_provider()
        platform_client = PlatformClient(
            base_url=str(payload.platformBaseUrl),
            internal_secret=settings.internal_secret,
        )
        return await run_pipeline(
            provider=provider,
            platform_client=platform_client,
            conversation_id=conversation_id,
            user_message=payload.userMessage,
            actor=payload.actor,
        )
    except ProviderUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LlmValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except PlatformBridgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
