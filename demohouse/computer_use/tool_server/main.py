import uuid
from fastapi import FastAPI
from services.router import router
from common.logger import configure_logging
from asgi_correlation_id import CorrelationIdMiddleware
from middleware.request_id import RequestIDMiddleware

app = FastAPI(
    title="computer_use",
)
app.include_router(router)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(CorrelationIdMiddleware)
configure_logging()
