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

import base64
import json
import os
from typing import Dict, Any
from volcengine.base.Service import Service
from volcengine.Credentials import Credentials
from volcengine.ServiceInfo import ServiceInfo


class PodManager:
    def __init__(self):
        """初始化 Pod 管理器"""
        self.access_key_id = os.getenv("ACEP_AK")
        self.secret_key = os.getenv("ACEP_SK")
        self.account_id = os.getenv("ACEP_ACCOUNT_ID")
        self.volc_client = Service(
            service_info=ServiceInfo(
                credentials=Credentials(
                    ak=self.access_key_id,
                    sk=self.secret_key,
                    service="ACEP",
                    region="cn-beijing",
                ),
                host="open.volcengineapi.com",
                header={},
                connection_timeout=10,
                socket_timeout=10,
                scheme="https",
            ),
            api_info={},
        )
        # SDK init can load unrelated local credentials; use only configured ACEP keys.
        self.volc_client.set_ak(self.access_key_id)
        self.volc_client.set_sk(self.secret_key)

    def generate_websdk_sts_token(
        self, device_id: str, expire_duration: int = 60 * 30
    ) -> Dict[str, Any]:
        volc_policy = {
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": ["ACEP:PodStart"],
                    "Resource": [f"trn:ACEP::{self.account_id}:pod_id/{device_id}"],
                }
            ]
        }

        volc_user_token = self.volc_client.sign_sts2(
            policy=volc_policy, expire=expire_duration
        )

        return {
            "AccessKeyID": volc_user_token.access_key_id,
            "SecretAccessKey": volc_user_token.secret_access_key,
            "SessionToken": volc_user_token.session_token,
            "CurrentTime": volc_user_token.current_time,
            "ExpiredTime": volc_user_token.expired_time,
        }

    def generate_mobile_use_mcp_token(
        self, device_id: str, expire_duration: int = 60 * 30
    ) -> Dict[str, Any]:
        volc_policy = {
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "ACEP:RunSyncCommand",
                        "ACEP:AutoInstallApp",
                        "ACEP:LaunchApp",
                        "ACEP:CloseApp",
                        "ACEP:GetPodAppList",
                    ],
                    "Resource": [f"trn:ACEP::{self.account_id}:pod_id/{device_id}"],
                },
                {
                    "Effect": "Allow",
                    "Action": ["tos:PutObject", "tos:GetObject"],
                    "Resource": [f"trn:tos:::{os.environ['TOS_BUCKET']}/*"],
                },
            ]
        }
        volc_user_token = self.volc_client.sign_sts2(
            policy=volc_policy, expire=expire_duration
        )
        return {
            "AccessKeyID": volc_user_token.access_key_id,
            "SecretAccessKey": volc_user_token.secret_access_key,
            "SessionToken": volc_user_token.session_token,
            "CurrentTime": volc_user_token.current_time,
            "ExpiredTime": volc_user_token.expired_time,
        }

    def compute_auth_token(self, sts_token: Dict[str, Any]) -> str:
        auth_dict = {
            "AccessKeyId": sts_token["AccessKeyID"],
            "SecretAccessKey": sts_token["SecretAccessKey"],
            "CurrentTime": sts_token["CurrentTime"],
            "ExpiredTime": sts_token["ExpiredTime"],
            "SessionToken": sts_token["SessionToken"],
        }
        auth_bytes = json.dumps(auth_dict).encode("utf-8")
        auth = base64.b64encode(auth_bytes).decode("utf-8")
        return auth

    def get_resource(
        self, device_id: str, product_id: str, free_time: int = 60 * 30
    ) -> Dict[str, Any]:
        websdk_sts_token = self.generate_websdk_sts_token(device_id, free_time)
        mcp_sts_token = self.generate_mobile_use_mcp_token(device_id, free_time)
        auth = self.compute_auth_token(mcp_sts_token)
        auth_info = {
            "authorization": auth,
            "ak": websdk_sts_token["AccessKeyID"],
            "sk": websdk_sts_token["SecretAccessKey"],
            "session_token": websdk_sts_token["SessionToken"],
            "current_time": websdk_sts_token["CurrentTime"],
            "expired_time": websdk_sts_token["ExpiredTime"],
        }
        return {
            "error": {"code": 0, "message": "success"},
            "device_info": {
                "product_id": product_id,
                "device_id": device_id,
                "free_time": free_time,
                "width": 720,
                "height": 1520,
                "account_id": self.account_id,
            },
            "auth_info": auth_info,
        }


# 创建全局实例
pod_manager = PodManager()
