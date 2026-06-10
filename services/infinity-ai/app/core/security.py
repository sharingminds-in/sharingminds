from fastapi import Header, HTTPException, status

from app.core.config import get_settings


async def verify_internal_secret(
    x_infinity_ai_internal_secret: str | None = Header(default=None),
) -> None:
    settings = get_settings()
    if not settings.internal_secret or x_infinity_ai_internal_secret != settings.internal_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal secret")
