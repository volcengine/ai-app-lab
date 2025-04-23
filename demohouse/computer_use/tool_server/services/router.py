import logging

from fastapi import APIRouter, HTTPException, Request
from .api_20200401.computer import handle_20200401
from common.config import get_settings
from fastapi import Query
from pydantic import BaseModel

router = APIRouter(prefix="")

logger = logging.getLogger(__name__)


class ResponseMetadataModel(BaseModel):
    RequestId: str = ""
    Action: str
    Version: str
    Service: str = "tool_server"
    Region: str = ""


class BaseResponse(BaseModel):
    ResponseMetadata: ResponseMetadataModel = None
    Result: dict = None


@router.get("/config")
async def get_config():
    return {"config": get_settings().model_dump()}


@router.get("/")
async def handle(
        action: str = Query(..., description="Action", alias="Action"),
        version: str = Query(..., description="Version", alias="Version"),
        request: Request = None,
) -> BaseResponse:
    request_id = request.headers.get("X-Request-ID")
    if action == "" or version == "" :
        return BaseResponse(
            ResponseMetadata=ResponseMetadataModel(
                Action=action,
                Version=version,
                RequestId=request_id,
            ),
            Result={
                "Error": "Invaild Action or Version.",
            }
        )
    resp = BaseResponse(
        ResponseMetadata=ResponseMetadataModel(
            Action=action,
            Version=version,
            RequestId=request_id,
        )
    )
    params = {k: v for k, v in dict(request.query_params).items() if k not in ("Action", "Version")}
    if version == "2020-04-01":
        logger.info("get request, action: %s, params: %s", action, params)
        result = await handle_20200401(action,params)
        logger.info("handle result: %s", result)
    else:
        return BaseResponse(
            ResponseMetadata=ResponseMetadataModel(
                Action=action,
                Version=version,
                RequestId=request_id,
            ),
            Result={
                "Error": "Invaild Action or Version.",
            }
        )
    resp.Result=result
    return resp
