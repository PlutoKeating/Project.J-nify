"""LLM router: POST /v1/llm/draft (SPEC §7.2) — draft only, no real side effects."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..common.auth import current_user_id
from ..config import settings
from ..schemas import DecisionOption, DraftRequest, DraftResponse
from ..services import jennifer_brain

router = APIRouter(prefix="/v1/llm", tags=["llm"])


@router.post("/draft", response_model=DraftResponse)
def draft(req: DraftRequest, user_id: str = Depends(current_user_id)) -> DraftResponse:
    # In this scaffold the LLM degrades to templates (SPEC §8 cost guardrail).
    title, body, options, _degraded = jennifer_brain.draft(
        type("Item", (), {"title": req.window_text or "有一件事", "category": "social"})(),
        type("Win", (), {"reason_text": req.window_text or ""})(),
    )
    return DraftResponse(
        model=settings.LLM_MODEL,
        title=title,
        body=body,
        degraded=True,
        options=[DecisionOption(**o.model_dump()) for o in options],
    )
