import logging

from fastapi import APIRouter, HTTPException, Query

from projection import project_training
from schemas import (
    GhdExtractRequest,
    GhdLoginRequest,
    GhdMfaResumeRequest,
    GhdStatusRequest,
)
from service import auth_status, extract, login, resume_login, unlink

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/auth/login")
async def auth_login(body: GhdLoginRequest):
    try:
        result = login(body.user_id, body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if result.get("ok") or result.get("needs_mfa"):
        return result
    error = result.get("error", "login_failed")
    status = 401 if error in {"authentication_failed", "mfa_failed"} else 500
    if error == "rate_limited":
        status = 429
    raise HTTPException(status_code=status, detail=result)


@router.post("/auth/resume_login")
async def auth_resume_login(body: GhdMfaResumeRequest):
    try:
        result = resume_login(body.user_id, body.mfa_id, body.mfa_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if result.get("ok"):
        return result
    error = result.get("error", "mfa_failed")
    status = 400 if error == "invalid_or_expired_mfa" else 401
    raise HTTPException(status_code=status, detail=result)


@router.post("/auth/status")
async def auth_status_route(body: GhdStatusRequest):
    try:
        return auth_status(body.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/auth/unlink")
async def auth_unlink_route(body: GhdStatusRequest):
    try:
        return unlink(body.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/extract")
async def extract_route(body: GhdExtractRequest):
    try:
        result = extract(
            body.user_id,
            body.start_date,
            body.end_date,
            body.data_types,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if result.get("ok"):
        return result
    error = result.get("error", "extract_failed")
    if error == "not_linked":
        raise HTTPException(status_code=401, detail=result)
    if error == "extract_in_progress":
        raise HTTPException(status_code=409, detail=result)
    if isinstance(error, str) and error.startswith("Invalid"):
        raise HTTPException(status_code=400, detail=result)
    raise HTTPException(status_code=500, detail=result)


@router.get("/projection/training")
async def projection_training(
    user_id: str = Query(...),
    start_date: str = Query(..., description="Inclusive YYYY-MM-DD"),
    end_date: str = Query(..., description="Inclusive YYYY-MM-DD"),
):
    try:
        return project_training(user_id, start_date, end_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("projection failed")
        raise HTTPException(status_code=500, detail=str(e)) from e
