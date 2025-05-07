import logging

from fastapi import APIRouter, HTTPException, Request
from .api_20200401.api import handle_20200401
from common.config import get_settings
from fastapi import Query
from pydantic import BaseModel
from fastapi.responses import JSONResponse

router = APIRouter(prefix="")

logger = logging.getLogger(__name__)


class ResponseMetadataModel(BaseModel):
    RequestId: str = ""
    Action: str
    Version: str
    Service: str = "ecs"
    Region: str = ""


class BaseResponse(BaseModel):
    ResponseMetadata: ResponseMetadataModel = None
    Result: dict = None
    Error: str = None

@router.get("/config")
async def get_config():
    return {"config": get_settings().model_dump()}


@router.get("/")
async def handle(
        action: str = Query(..., description="Action", alias="Action"),
        version: str = Query(..., description="Version", alias="Version"),
        request: Request = None,
):
    if action == "" or version == "" :
        raise HTTPException(
            status_code=404,
            detail="Invalid Action or Version.",
        )
    request_id = request.headers.get("X-Request-ID")
    resp = BaseResponse(
        ResponseMetadata=ResponseMetadataModel(
            Action=action,
            Version=version,
            RequestId=request_id,
            Region=get_settings().mgr.region,
        )
    )
    params = {k: v for k, v in dict(request.query_params).items() if k not in ("Action", "Version")}
    try:

        if version == "2020-04-01":
            logger.info(f"Action: {action} Params: {params}")
            result = await handle_20200401(action,params)
            logger.info(f"Result: {result}")
        else:
            resp.Error = "Invalid Action or Version."
            raise JSONResponse(
                status_code=404,
                content=resp.dict(exclude_none=True)
            )
    except Exception as e:
            logger.error(f"Error: {e}")
            resp.Error = str(e)
            return JSONResponse(
                status_code=500,
                content=resp.dict(exclude_none=True)
            )
    if action == "ValidateVncToken":
        return result
    resp.Result=result
    return resp
