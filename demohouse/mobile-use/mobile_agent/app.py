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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 导入配置
from mobile_agent.middleware.middleware import ResponseMiddleware
from mobile_agent.config.settings import settings
from mobile_agent.routers.base import register_routers


# 创建FastAPI应用
app = FastAPI(
    title=settings.app_name,
    description="HTTP Server for Mobile Agent",
    version=settings.app_version,
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加响应格式中间件
app.add_middleware(ResponseMiddleware)

# 注册所有路由
register_routers(app)
