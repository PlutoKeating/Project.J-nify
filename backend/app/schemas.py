"""Pydantic schemas for the REST API (SPEC §7.2).

Focus on the MVP loop: capture -> parked -> best-window -> three options
(now / later / drop), plus guardrails, signals and the LLM-draft stub.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CaptureRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    raw_text: str = Field(..., min_length=1, description="一句话 / 分享 / 语音转写录入")
    source_type: str = "text"
    category: str = "life"
    due_at: datetime | None = None


class CaptureResponse(BaseModel):
    item: "ItemCommitmentOut"
    status: str = "captured"
    message: str


class DecisionRequest(BaseModel):
    decision: Literal["now", "later", "drop", "rescue"]
    reason: str = ""
    option_id: str | None = None


class ItemCommitmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    raw_text: str
    category: str
    status: str
    importance: int
    urgency: int
    abandon_cost: int
    est_minutes: int
    due_at: datetime | None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None


class ItemListItem(ItemCommitmentOut):
    pass


class NowItem(ItemCommitmentOut):
    reason_code: str | None = None
    reason_text: str | None = None
    fit_score: float | None = None
    options: list["DecisionOption"] = []


class NowResponse(BaseModel):
    greeting: str
    headline: str
    item: NowItem | None = None
    empty_message: str | None = None


class DecisionOption(BaseModel):
    code: str
    label: str
    action_type: str


class SignalEventIn(BaseModel):
    model_config = ConfigDict(extra="allow")

    signal_type: str
    payload: dict = {}
    occurred_at: datetime | None = None


class SignalEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    signal_type: str
    confidence: float
    occurred_at: datetime
    ingested_at: datetime


class GuardrailsIn(BaseModel):
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    max_nudge_budget: int | None = None
    privacy_scope: dict | None = None


class GuardrailsOut(BaseModel):
    quiet_hours_start: str
    quiet_hours_end: str
    max_nudge_budget: int
    privacy_scope: dict


class DraftRequest(BaseModel):
    item_id: str | None = None
    window_text: str = ""
    scenario: str = "reply"


class DraftResponse(BaseModel):
    model: str
    title: str
    body: str
    degraded: bool
    options: list[DecisionOption]


class DeleteDataResponse(BaseModel):
    deleted_users: int
    deleted_commitments: int
    deleted_signals: int
    message: str
