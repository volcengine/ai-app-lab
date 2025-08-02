# -*- coding: UTF-8 -*-
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

import os

MODEL_ID = os.getenv("MODEL_ID")
ARK_API_KEY = os.getenv("ARK_API_KEY")
TOS_ACCESS_KEY = os.getenv("TOS_ACCESS_KEY")
TOS_SECRET_KEY = os.getenv("TOS_SECRET_KEY")
TOS_ENDPOINT = os.getenv("TOS_ENDPOINT")
TOS_REGION = os.getenv("TOS_REGION")
TOS_BUCKET = os.getenv("TOS_BUCKET")
AUC_APP_ID = os.getenv("AUC_APP_ID")
AUC_ACCESS_TOKEN = os.getenv("AUC_ACCESS_TOKEN")
AUC_CLUSTER_ID = os.getenv("AUC_CLUSTER_ID", None)  # 选填, 填这个可以试用
WEB_ACCESS_PASSWORD = os.getenv("WEB_ACCESS_PASSWORD", None)  # 选填, 填这个可以开启 Web 端访问密码

os.environ["ARK_API_KEY"] = ARK_API_KEY  # 设置环境变量以供 arkitect 使用
