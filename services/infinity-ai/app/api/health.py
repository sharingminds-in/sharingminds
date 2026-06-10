from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.service_name,
        "provider": settings.llm_provider,
        "providerOrder": settings.provider_order,
        "model": settings.resolved_model,
        "requireLlm": settings.require_llm,
        "llmConfigured": any(
            bool(settings.api_key_for_provider(provider))
            for provider in settings.provider_order
        ),
        "internalAuthConfigured": bool(settings.internal_secret),
    }
