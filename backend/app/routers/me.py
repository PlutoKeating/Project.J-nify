"""Me router: DELETE /v1/me/data -> verifiable deletion (SPEC §7.2 / §8)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..common.auth import current_user_id
from ..database import get_db
from ..models import (
    ContextSnapshot,
    Decision,
    EscalationPolicy,
    Feedback,
    IntegrationSource,
    ItemCommitment,
    ItemStep,
    MemoryNote,
    Nudge,
    NudgeOption,
    OpportunityWindow,
    SignalEvent,
    User,
    UserPreference,
)
from ..schemas import DeleteDataResponse

router = APIRouter(prefix="/v1/me", tags=["me"])


@router.delete("/data", response_model=DeleteDataResponse)
def delete_my_data(db: Session = Depends(get_db), user_id: str = Depends(current_user_id)) -> DeleteDataResponse:
    deleted_signals = db.query(SignalEvent).filter(SignalEvent.user_id == user_id).count()
    deleted_commitments = db.query(ItemCommitment).filter(ItemCommitment.user_id == user_id).count()
    _delete_for_user(db, user_id)
    db.commit()
    return DeleteDataResponse(
        deleted_users=1,
        deleted_commitments=deleted_commitments,
        deleted_signals=deleted_signals,
        message="已删除与您相关的全部数据（可验证删除）。",
    )


def _delete_for_user(db: Session, user_id: str) -> None:
    item_ids = [r[0] for r in db.query(ItemCommitment.id).filter(ItemCommitment.user_id == user_id).all()]
    window_ids = [r[0] for r in db.query(OpportunityWindow.id).filter(OpportunityWindow.item_id.in_(item_ids)).all()]
    nudge_ids = [r[0] for r in db.query(Nudge.id).filter(Nudge.item_id.in_(item_ids)).all()]
    decision_ids = [r[0] for r in db.query(Decision.id).filter(Decision.user_id == user_id).all()]

    if nudge_ids:
        db.query(NudgeOption).filter(NudgeOption.nudge_id.in_(nudge_ids)).delete(synchronize_session="fetch")
        db.query(Nudge).filter(Nudge.id.in_(nudge_ids)).delete(synchronize_session="fetch")
    if window_ids:
        db.query(OpportunityWindow).filter(OpportunityWindow.id.in_(window_ids)).delete(synchronize_session="fetch")
    if decision_ids:
        db.query(Feedback).filter(Feedback.decision_id.in_(decision_ids)).delete(synchronize_session="fetch")
    if item_ids:
        db.query(EscalationPolicy).filter(EscalationPolicy.item_id.in_(item_ids)).delete(synchronize_session="fetch")
        db.query(ItemStep).filter(ItemStep.item_id.in_(item_ids)).delete(synchronize_session="fetch")
        db.query(MemoryNote).filter(MemoryNote.item_id.in_(item_ids)).delete(synchronize_session="fetch")
        db.query(ItemCommitment).filter(ItemCommitment.id.in_(item_ids)).delete(synchronize_session="fetch")
    if decision_ids:
        db.query(Decision).filter(Decision.id.in_(decision_ids)).delete(synchronize_session="fetch")
    db.query(MemoryNote).filter(MemoryNote.user_id == user_id).delete(synchronize_session="fetch")
    db.query(Feedback).filter(Feedback.user_id == user_id).delete(synchronize_session="fetch")
    db.query(ContextSnapshot).filter(ContextSnapshot.user_id == user_id).delete(synchronize_session="fetch")
    db.query(SignalEvent).filter(SignalEvent.user_id == user_id).delete(synchronize_session="fetch")
    db.query(UserPreference).filter(UserPreference.user_id == user_id).delete(synchronize_session="fetch")
    db.query(IntegrationSource).filter(IntegrationSource.user_id == user_id).delete(synchronize_session="fetch")
    user = db.get(User, user_id)
    if user:
        db.delete(user)
