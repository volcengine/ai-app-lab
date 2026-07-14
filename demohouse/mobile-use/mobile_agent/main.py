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

import uvicorn
import logging
from mobile_agent.config.settings import settings


# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

LOCAL_HOST = "127.0.0.1"


def main():
    # 打印配置信息
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Environment: {settings.env}")
    if settings.server.host != LOCAL_HOST:
        logger.warning(
            "Configured host %s is ignored; local server listens on %s only",
            settings.server.host,
            LOCAL_HOST,
        )
    logger.info(
        f"Server config: host={LOCAL_HOST}, port={settings.server.port}"
    )

    # 启动服务器
    uvicorn.run("app:app", host=LOCAL_HOST, port=settings.server.port)


if __name__ == "__main__":
    main()
