from typing import Optional

from pydantic import BaseModel, Field


class GhdLoginRequest(BaseModel):
    user_id: str
    email: str
    password: str


class GhdMfaResumeRequest(BaseModel):
    user_id: str
    mfa_id: str
    mfa_code: str


class GhdStatusRequest(BaseModel):
    user_id: str


class GhdExtractRequest(BaseModel):
    user_id: str
    start_date: str = Field(..., description="Inclusive start date YYYY-MM-DD")
    end_date: str = Field(..., description="Inclusive end date YYYY-MM-DD")
    data_types: Optional[list[str]] = None
