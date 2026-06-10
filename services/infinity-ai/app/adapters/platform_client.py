from typing import Any

import httpx

from app.core.errors import PlatformBridgeError


class PlatformClient:
    def __init__(self, *, base_url: str, internal_secret: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {
            "Content-Type": "application/json",
            "X-Infinity-AI-Internal-Secret": internal_secret,
        }

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(base_url=self._base_url, timeout=30.0) as client:
            response = await client.post(path, headers=self._headers, json=payload)
        if response.status_code >= 400:
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = {}
            error_message = error_payload.get("error") if isinstance(error_payload, dict) else None
            error_code = error_payload.get("code") if isinstance(error_payload, dict) else None
            detail = f"{error_code}: {error_message}" if error_code and error_message else error_message
            raise PlatformBridgeError(detail or response.text or f"Platform bridge failed for {path}")
        return response.json()

    async def get_policy_context(self, *, conversation_id: str, actor: dict[str, Any]) -> dict[str, Any]:
        return await self._post(
            "/api/internal/infinity-ai/policy",
            {"conversationId": conversation_id, "actor": actor},
        )

    async def get_expert_candidates(
        self,
        *,
        conversation_id: str,
        actor: dict[str, Any],
        signal_snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._post(
            "/api/internal/infinity-ai/experts",
            {
                "conversationId": conversation_id,
                "actor": actor,
                "signalSnapshot": signal_snapshot,
            },
        )

    async def get_resource_candidates(
        self,
        *,
        conversation_id: str,
        actor: dict[str, Any],
        signal_snapshot: dict[str, Any],
        user_message: str,
    ) -> dict[str, Any]:
        return await self._post(
            "/api/internal/infinity-ai/resources",
            {
                "conversationId": conversation_id,
                "actor": actor,
                "signalSnapshot": signal_snapshot,
                "userMessage": user_message,
            },
        )

    async def persist(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/api/internal/infinity-ai/persist", payload)

    async def start_graph_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/api/internal/infinity-ai/graph-runs/start", payload)

    async def mark_graph_run_failed(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/api/internal/infinity-ai/graph-runs/fail", payload)
