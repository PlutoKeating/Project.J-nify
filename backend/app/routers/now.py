"""Now router: GET /v1/now -> single best-window focus card or empty state."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..common.auth import current_user_id
from ..database import get_db
from ..models import ItemCommitment
from ..schemas import DecisionOption, NowItem, NowResponse
from ..services import opportunity_window_engine as window_engine
from ..services import jennifer_brain

router = APIRouter(prefix="/v1", tags=["now"])

ACTIVE_STATUSES = ("parked", "window_candidate", "nudged", "deferred")


@router.get("/now", response_model=NowResponse)
def get_now(db: Session = Depends(get_db), user_id: str = Depends(current_user_id)) -> NowResponse:
    item = (
        db.query(ItemCommitment)
        .filter(ItemCommitment.user_id == user_id, ItemCommitment.status.in_(ACTIVE_STATUSES))
        .order_by(ItemCommitment.created_at.asc())
        .first()
    )
    if item is None:
        return NowResponse(
            greeting="周六上午 · 只被允许想一件事",
            headline="现在，只递一件顺手的",
            item=None,
            empty_message="没有必须此刻处理的事",
        )

    window = window_engine.compute(item)
    _, _, options, _ = jennifer_brain.draft(item, window)
    options = [DecisionOption(**o.model_dump()) for o in options]

    now_item = NowItem(
        id=item.id,
        title=item.title,
        raw_text=item.raw_text,
        category=item.category,
        status=item.status,
        importance=item.importance,
        urgency=item.urgency,
        abandon_cost=item.abandon_cost,
        est_minutes=item.est_minutes,
        due_at=item.due_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        closed_at=item.closed_at,
        reason_code=window.reason_code,
        reason_text=window.reason_text,
        fit_score=window.fit_score,
        options=options,
    )
    return NowResponse(
        greeting="周六上午 · 只被允许想一件事",
        headline="现在，只递一件顺手的",
        item=now_item,
        empty_message=None,
    )
