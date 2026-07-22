# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at 
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import uuid
from fastapi import FastAPI
from services.router import router
from common.config import get_settings
from common.logger import configure_logging
from asgi_correlation_id import CorrelationIdMiddleware
from middleware.request_id import RequestIDMiddleware
from middleware.auth import AuthMiddleware

app = FastAPI(
    title="computer_use",
)
app.include_router(router)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(AuthMiddleware)
configure_logging()


def validate_security_settings(settings) -> None:
    if not settings.auth_key:
        raise RuntimeError("auth_key must be configured before starting tool_server")


def main():
    import uvicorn

    settings = get_settings()
    validate_security_settings(settings)

    uvicorn_kwargs = {
        "host": "0.0.0.0",
        "port": settings.port,
    }

    if settings.plugins.enable_https:
        if not settings.ssl.server_cert or not settings.ssl.server_key:
            raise RuntimeError(
                "plugins.enable_https is True but ssl.server_cert / ssl.server_key are not configured."
            )
        uvicorn_kwargs["ssl_certfile"] = settings.ssl.server_cert
        uvicorn_kwargs["ssl_keyfile"] = settings.ssl.server_key

    uvicorn.run(app, **uvicorn_kwargs)


if __name__ == "__main__":
    main()