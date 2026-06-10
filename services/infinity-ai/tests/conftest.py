from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import get_settings


@pytest.fixture(autouse=True)
def isolate_turn_controller_flag(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("INFINITY_AI_TURN_CONTROLLER_ENABLED", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
