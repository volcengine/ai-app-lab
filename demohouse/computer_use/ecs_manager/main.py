import uuid
import uvicorn
from fastapi import FastAPI
from services.router import router
from common.logger import configure_logging
from common.config import get_settings
from asgi_correlation_id import CorrelationIdMiddleware
from middleware.request_id import RequestIDMiddleware
app = FastAPI(
    title="computer_use",
)
app.include_router(router)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CorrelationIdMiddleware,
    header_name='X-Request-ID',
    update_request_header=True,
    generator=lambda: uuid.uuid4().hex,
    transformer=lambda a: a,
)
configure_logging()
