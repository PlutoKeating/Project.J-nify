"""SQLAlchemy models — strictly mirroring SPEC §6 (the real data model ER).

Entities (15): USER, USER_PREFERENCE, INTEGRATION_SOURCE, SIGNAL_EVENT,
CONTEXT_SNAPSHOT, ITEM_COMMITMENT, ITEM_STEP, ESCALATION_POLICY,
OPPORTUNITY_WINDOW, MESSAGE_TEMPLATE, NUDGE, NUDGE_OPTION, DECISION,
FEEDBACK, MEMORY_NOTE.

SQLite mapping notes (per plan): UUID -> String(36), JSON -> sqlalchemy.JSON
(stored as TEXT), DateTime -> DateTime.

Key field semantics from SPEC §6.2 are preserved as-is (fit_score, reason_code,
abandon_cost, est_minutes, nudge_count/max_nudges, effect_metrics).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Column,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _pk() -> Mapped[str]:
    return mapped_column(String(36), primary_key=True, default=_uuid)


# --- Association table: signals aggregate into a context snapshot (M2M) -------
context_snapshot_signals = Table(
    "context_snapshot_signals",
    Base.metadata,
    Column("context_snapshot_id", String(36), ForeignKey("context_snapshot.id"), primary_key=True),
    Column("signal_event_id", String(36), ForeignKey("signal_event.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = _pk()
    nickname: Mapped[str | None] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    jennifer_tone: Mapped[str] = mapped_column(String(64), default="default")
    privacy_scope: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    preferences: Mapped[list["UserPreference"]] = relationship(back_populates="user")
    integration_sources: Mapped[list["IntegrationSource"]] = relationship(back_populates="user")
    commitments: Mapped[list["ItemCommitment"]] = relationship(back_populates="user")
    memories: Mapped[list["MemoryNote"]] = relationship(back_populates="user")
    feedback: Mapped[list["Feedback"]] = relationship(back_populates="user")
    decisions: Mapped[list["Decision"]] = relationship(back_populates="user")


class UserPreference(Base):
    __tablename__ = "user_preference"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), index=True)
    scene: Mapped[str] = mapped_column(String(64))
    key: Mapped[str] = mapped_column(String(128))
    value: Mapped[str] = mapped_column(String(512))
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="preferences")


class IntegrationSource(Base):
    __tablename__ = "integration_source"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), index=True)
    provider: Mapped[str] = mapped_column(String(64))
    auth_status: Mapped[str] = mapped_column(String(32), default="not_connected")
    scopes: Mapped[dict | None] = mapped_column(JSON)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped["User"] = relationship(back_populates="integration_sources")
    signal_events: Mapped[list["SignalEvent"]] = relationship(back_populates="source")


class SignalEvent(Base):
    __tablename__ = "signal_event"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("integration_source.id"), index=True)
    signal_type: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict | None] = mapped_column(JSON)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped["IntegrationSource"] = relationship(back_populates="signal_events")
    context_snapshots: Mapped[list["ContextSnapshot"]] = relationship(
        secondary="context_snapshot_signals", back_populates="signal_events"
    )


class ContextSnapshot(Base):
    __tablename__ = "context_snapshot"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), index=True)
    snapshot_key: Mapped[str] = mapped_column(String(128))
    context_features: Mapped[dict | None] = mapped_column(JSON)
    availability_score: Mapped[float] = mapped_column(Float, default=0.0)
    friction_score: Mapped[float] = mapped_column(Float, default=0.0)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    signal_events: Mapped[list["SignalEvent"]] = relationship(
        secondary="context_snapshot_signals", back_populates="context_snapshots"
    )
    opportunity_windows: Mapped[list["OpportunityWindow"]] = relationship(back_populates="context")


class ItemCommitment(Base):
    __tablename__ = "item_commitment"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    raw_text: Mapped[str] = mapped_column(String(2048))
    source_type: Mapped[str] = mapped_column(String(32), default="text")
    category: Mapped[str] = mapped_column(String(64), default="life")
    status: Mapped[str] = mapped_column(String(32), default="captured", index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime)
    window_start: Mapped[datetime | None] = mapped_column(DateTime)
    window_end: Mapped[datetime | None] = mapped_column(DateTime)
    importance: Mapped[int] = mapped_column(Integer, default=3)
    urgency: Mapped[int] = mapped_column(Integer, default=3)
    abandon_cost: Mapped[int] = mapped_column(Integer, default=0)
    est_minutes: Mapped[int] = mapped_column(Integer, default=10)
    constraints: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped["User"] = relationship(back_populates="commitments")
    steps: Mapped[list["ItemStep"]] = relationship(back_populates="item")
    escalation_policies: Mapped[list["EscalationPolicy"]] = relationship(back_populates="item")
    windows: Mapped[list["OpportunityWindow"]] = relationship(back_populates="item")
    nudges: Mapped[list["Nudge"]] = relationship(back_populates="item")
    memories: Mapped[list["MemoryNote"]] = relationship(back_populates="item")


class ItemStep(Base):
    __tablename__ = "item_step"

    id: Mapped[str] = _pk()
    item_id: Mapped[str] = mapped_column(ForeignKey("item_commitment.id"), index=True)
    step_order: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(512))
    est_minutes: Mapped[int] = mapped_column(Integer, default=5)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    action_payload: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    done_at: Mapped[datetime | None] = mapped_column(DateTime)

    item: Mapped["ItemCommitment"] = relationship(back_populates="steps")


class EscalationPolicy(Base):
    __tablename__ = "escalation_policy"

    id: Mapped[str] = _pk()
    item_id: Mapped[str] = mapped_column(ForeignKey("item_commitment.id"), index=True)
    policy_type: Mapped[str] = mapped_column(String(64), default="standard")
    max_nudges: Mapped[int] = mapped_column(Integer, default=3)
    nudge_count: Mapped[int] = mapped_column(Integer, default=0)
    warm_up_curve: Mapped[dict | None] = mapped_column(JSON)
    quiet_hours: Mapped[dict | None] = mapped_column(JSON)
    rescue_actions: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    item: Mapped["ItemCommitment"] = relationship(back_populates="escalation_policies")


class OpportunityWindow(Base):
    __tablename__ = "opportunity_window"

    id: Mapped[str] = _pk()
    item_id: Mapped[str] = mapped_column(ForeignKey("item_commitment.id"), index=True)
    context_id: Mapped[str | None] = mapped_column(ForeignKey("context_snapshot.id"))
    window_start: Mapped[datetime | None] = mapped_column(DateTime)
    window_end: Mapped[datetime | None] = mapped_column(DateTime)
    fit_score: Mapped[float] = mapped_column(Float, default=0.0)
    reason_code: Mapped[str] = mapped_column(String(64))
    reason_text: Mapped[str] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(32), default="candidate")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expired_at: Mapped[datetime | None] = mapped_column(DateTime)

    item: Mapped["ItemCommitment"] = relationship(back_populates="windows")
    context: Mapped["ContextSnapshot | None"] = relationship(back_populates="opportunity_windows")
    nudges: Mapped[list["Nudge"]] = relationship(back_populates="window")


class MessageTemplate(Base):
    __tablename__ = "message_template"

    id: Mapped[str] = _pk()
    scene: Mapped[str] = mapped_column(String(64))
    tone: Mapped[str] = mapped_column(String(64), default="jennifer")
    intensity_band: Mapped[str] = mapped_column(String(32), default="soft")
    template_text: Mapped[str] = mapped_column(String(2048))
    variables: Mapped[dict | None] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="active")

    nudges: Mapped[list["Nudge"]] = relationship(back_populates="template")


class Nudge(Base):
    __tablename__ = "nudge"

    id: Mapped[str] = _pk()
    item_id: Mapped[str] = mapped_column(ForeignKey("item_commitment.id"), index=True)
    window_id: Mapped[str | None] = mapped_column(ForeignKey("opportunity_window.id"))
    template_id: Mapped[str | None] = mapped_column(ForeignKey("message_template.id"))
    intensity: Mapped[int] = mapped_column(Integer, default=1)
    channel: Mapped[str] = mapped_column(String(32), default="push")
    title: Mapped[str] = mapped_column(String(512))
    body: Mapped[str] = mapped_column(String(2048))
    status: Mapped[str] = mapped_column(String(32), default="scheduled")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    item: Mapped["ItemCommitment"] = relationship(back_populates="nudges")
    window: Mapped["OpportunityWindow | None"] = relationship(back_populates="nudges")
    template: Mapped["MessageTemplate | None"] = relationship(back_populates="nudges")
    options: Mapped[list["NudgeOption"]] = relationship(back_populates="nudge")
    decision: Mapped["Decision | None"] = relationship(back_populates="nudge")


class NudgeOption(Base):
    __tablename__ = "nudge_option"

    id: Mapped[str] = _pk()
    nudge_id: Mapped[str] = mapped_column(ForeignKey("nudge.id"), index=True)
    option_code: Mapped[str] = mapped_column(String(32))
    label: Mapped[str] = mapped_column(String(128))
    action_type: Mapped[str] = mapped_column(String(32))
    action_payload: Mapped[dict | None] = mapped_column(JSON)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    nudge: Mapped["Nudge"] = relationship(back_populates="options")
    decision: Mapped["Decision | None"] = relationship(back_populates="option")


class Decision(Base):
    __tablename__ = "decision"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), index=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("item_commitment.id"), index=True)
    nudge_id: Mapped[str | None] = mapped_column(ForeignKey("nudge.id"))
    option_id: Mapped[str | None] = mapped_column(ForeignKey("nudge_option.id"))
    decision: Mapped[str] = mapped_column(String(32))
    reason: Mapped[str] = mapped_column(String(1024), default="")
    effect_metrics: Mapped[dict | None] = mapped_column(JSON)
    decided_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="decisions", foreign_keys=[user_id])
    nudge: Mapped["Nudge | None"] = relationship(back_populates="decision", foreign_keys=[nudge_id])
    option: Mapped["NudgeOption | None"] = relationship(back_populates="decision", foreign_keys=[option_id])
    feedback: Mapped[list["Feedback"]] = relationship(back_populates="decision")
    memories: Mapped[list["MemoryNote"]] = relationship(back_populates="decision")


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), index=True)
    decision_id: Mapped[str | None] = mapped_column(ForeignKey("decision.id"))
    feedback_type: Mapped[str] = mapped_column(String(64))
    rating: Mapped[int] = mapped_column(Integer, default=0)
    comment: Mapped[str] = mapped_column(String(1024), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="feedback", foreign_keys=[user_id])
    decision: Mapped["Decision | None"] = relationship(back_populates="feedback", foreign_keys=[decision_id])


class MemoryNote(Base):
    __tablename__ = "memory_note"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), index=True)
    item_id: Mapped[str | None] = mapped_column(ForeignKey("item_commitment.id"))
    decision_id: Mapped[str | None] = mapped_column(ForeignKey("decision.id"))
    memory_type: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(String(2048))
    salience: Mapped[float] = mapped_column(Float, default=0.5)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="memories", foreign_keys=[user_id])
    item: Mapped["ItemCommitment | None"] = relationship(back_populates="memories", foreign_keys=[item_id])
    decision: Mapped["Decision | None"] = relationship(back_populates="memories", foreign_keys=[decision_id])
