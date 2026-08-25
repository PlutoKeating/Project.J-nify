"""Items router: capture / decision / list (SPEC §7.2)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..common.auth import current_user_id, ensure_user
from ..database import get_db
from ..models import EscalationPolicy, ItemCommitment
from ..schemas import CaptureRequest, CaptureResponse, DecisionRequest, ItemCommitmentOut
from ..services import capture_service, decision_feedback_service

router = APIRouter(prefix="/v1/items", tags=["items"])


@router.post("/capture", response_model=CaptureResponse)
def capture_item(
    req: CaptureRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> CaptureResponse:
    ensure_user(db, user_id)
    item = capture_service.capture(
        db,
        user_id,
        raw_text=req.raw_text,
        source_type=req.source_type,
        category=req.category,
        due_at=req.due_at,
    )
    return CaptureResponse(
        item=ItemCommitmentOut.model_validate(item),
        status=item.status,
        message="记下了：不急，但我帮您盯着。",
    )


@router.get("", response_model=list[ItemCommitmentOut])
def list_items(
    status: str | None = None,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[ItemCommitmentOut]:
    q = db.query(ItemCommitment).filter(ItemCommitment.user_id == user_id)
    if status:
        q = q.filter(ItemCommitment.status == status)
    items = q.order_by(ItemCommitment.created_at.desc()).all()
    return [ItemCommitmentOut.model_validate(i) for i in items]


@router.post("/{item_id}/decision")
def decide_item(
    item_id: str,
    req: DecisionRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> dict:
    item = db.get(ItemCommitment, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="item not found")
    _record = decision_feedback_service.close_loop(
        db,
        user_id=user_id,
        item=item,
        decision=req.decision,
        reason=req.reason,
        option_id=req.option_id,
    )
    return {"id": item.id, "status": item.status}
