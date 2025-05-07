from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from common.context import set_request_id, get_request_id


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        header_rid = request.headers.get("X-Request-ID")
        set_request_id(header_rid)
        response = await call_next(request)
        return response