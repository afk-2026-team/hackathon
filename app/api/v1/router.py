from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.v1.auth import router as auth_router
from app.api.v1.chat_completions import router as chat_router
from app.api.v1.discovery import router as discovery_router
from app.api.v1.responses import router as responses_router
from app.schemas.openai import ModelCard, ModelList

router = APIRouter()
router.include_router(chat_router)
router.include_router(discovery_router)
router.include_router(auth_router)
router.include_router(responses_router)


@router.get("/models")
async def list_models(request: Request) -> ModelList:
    config = request.app.state.config
    return ModelList(
        data=[ModelCard(id=pid, created=request.app.state.started_at, owned_by=config["AGENT_NAME"]) for pid in request.app.state.registry]
    )
