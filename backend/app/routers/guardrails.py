"""Guardrails router: GET/PUT /v1/guardrails (SPEC §7.2)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..common.auth import current_user_id
from ..config import settings
from ..database import get_db
from ..schemas import GuardrailsIn, GuardrailsOut

router = APIRouter(prefix="/v1/guardrails", tags=["guardrails"])

_STATE: dict[str, dict] = {}


@router.get("", response_model=GuardrailsOut)
def get_guardrails(user_id: str = Depends(current_user_id)) -> GuardrailsOut:
    cfg = _STATE.get(user_id, {})
    return GuardrailsOut(
        quiet_hours_start=cfg.get("quiet_hours_start", settings.QUIET_HOURS_START),
        quiet_hours_end=cfg.get("quiet_hours_end", settings.QUIET_HOURS_END),
        max_nudge_budget=cfg.get("max_nudge_budget", settings.MAX_NUDGE_BUDGET),
        privacy_scope=cfg.get("privacy_scope", {"calendar": True, "weather": True, "coarse_location": True}),
    )


@router.put("", response_model=GuardrailsOut)
def put_guardrails(req: GuardrailsIn, user_id: str = Depends(current_user_id)) -> GuardrailsOut:
    cfg = dict(_STATE.get(user_id, {}))
    for field in ("quiet_hours_start", "quiet_hours_end", "max_nudge_budget", "privacy_scope"):
        value = getattr(req, field)
        if value is not None:
            cfg[field] = value
    _STATE[user_id] = cfg
    return get_guardrails(user_id)
