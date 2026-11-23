"""Server-controlled, expiring credentials bound to one caller and device."""

import hmac
import os
import time

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from starlette.middleware.base import BaseHTTPMiddleware


class AccessGrant(BaseModel):
    model_config = {"extra": "forbid", "frozen": True}

    token: str = Field(
        min_length=43, max_length=128, pattern=r"^[A-Za-z0-9_-]+$", repr=False
    )
    account_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    product_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    pod_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    expires_at: int = Field(strict=True, gt=0)

    def authorize_device(self, product_id: str, pod_id: str):
        if (product_id, pod_id) != (self.product_id, self.pod_id):
            raise HTTPException(status_code=403, detail="当前设备不匹配")


def load_access_grants() -> list[AccessGrant]:
    try:
        grants = TypeAdapter(list[AccessGrant]).validate_json(
            os.environ.get("MOBILE_AGENT_ACCESS_GRANTS", "")
        )
        if not grants or len({grant.token for grant in grants}) != len(grants):
            raise ValueError()
        if any(grant.expires_at > time.time() + 2 * 60 * 60 for grant in grants):
            raise ValueError()
        return grants
    except (ValidationError, ValueError):
        # Validation errors include input values, so never expose them in logs.
        raise RuntimeError(
            "MOBILE_AGENT_ACCESS_GRANTS must contain unique device-bound credentials expiring within two hours"
        ) from None


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, grants: list[AccessGrant]):
        super().__init__(app)
        self.grants = grants

    async def dispatch(self, request: Request, call_next):
        scheme, _, token = request.headers.get("Authorization", "").partition(" ")
        if scheme.lower() == "bearer" and 43 <= len(token) <= 128 and token.isascii():
            for grant in self.grants:
                if (
                    hmac.compare_digest(token, grant.token)
                    and time.time() < grant.expires_at
                ):
                    request.state.access_grant = grant
                    response = await call_next(request)
                    response.headers["Cache-Control"] = "no-store"
                    return response
        return JSONResponse(
            status_code=401,
            content={"error": {"code": 401, "message": "unauthorized"}},
            headers={"WWW-Authenticate": "Bearer", "Cache-Control": "no-store"},
        )
