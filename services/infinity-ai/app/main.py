from fastapi import FastAPI

from app.api.conversations import router as conversations_router
from app.api.health import router as health_router
from app.core.config import get_settings
from app.core.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(title="Infinity AI", version="1.0.0")
app.include_router(health_router)
app.include_router(conversations_router)
