from contextvars import ContextVar
import uuid

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")

def get_request_id() -> str:
    return request_id_ctx.get()

def set_request_id(rid: str):
    request_id_ctx.set(rid)
