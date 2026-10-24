from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.v1.chat_completions import router as chat_router
from app.schemas.openai import ModelCard, ModelList

router = APIRouter()
router.include_router(chat_router)


@router.get("/models")
async def list_models(request: Request) -> ModelList:
    config = request.app.state.config
    return ModelList(
        data=[ModelCard(id=pid, created=request.app.state.started_at, owned_by=config["AGENT_NAME"]) for pid in request.app.state.registry]
    )
