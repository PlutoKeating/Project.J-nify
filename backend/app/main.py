"""J-nify backend entrypoint.

Creates the FastAPI app (with Swagger at /docs), enables CORS, mounts all
routers under /v1/..., and listens on the single unique port controlled by
`.env` (`APP_HOST` / `APP_PORT`) — so it can be fronted by intranet
penetration to a production URL.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import create_all
from .routers import guardrails, items, llm, me, now, signals


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_all()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="J-nify — 低打扰行动秘书（Jennifer）后端 API。严格按 SPEC §6 数据模型建模。",
    lifespan=lifespan,
)

_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(items.router)
app.include_router(now.router)
app.include_router(signals.router)
app.include_router(guardrails.router)
app.include_router(me.router)
app.include_router(llm.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "internal_error"})


@app.get("/", tags=["health"])
def root() -> dict:
    return {"app": settings.APP_NAME, "env": settings.APP_ENV, "status": "ok"}


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}
