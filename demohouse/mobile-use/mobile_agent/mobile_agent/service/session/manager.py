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
from pydantic import BaseModel
from typing import Any, Dict, Optional
import asyncio
import os
import logging
import time
from mobile_agent.service.pod.manager import pod_manager

logger = logging.getLogger(__name__)

LOCAL_ACCOUNT_ID = "local"


class StsToken(BaseModel):
    AccessKeyID: str
    SecretAccessKey: str
    SessionToken: str
    CurrentTime: str
    ExpiredTime: str


class PodSize(BaseModel):
    width: int
    height: int


class SessionState(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    account_id: str
    # agent chat 上下文id
    chat_thread_id: str
    pod_session_expired_time: int  # pod剩余时间（秒）
    # podid
    pod_id: str
    # 产品id
    product_id: str
    # 云手机账号id
    pod_account_id: str
    # 授权 mcp 的 token
    authorization_token: str
    pod_size: PodSize
    sts_token: StsToken
    sse_connection: Optional[asyncio.Event] = None
    # tos
    tos_bucket: str
    tos_region: str
    tos_endpoint: str
    # 添加时间戳用于过期检查
    created_at: float = None
    last_accessed_at: float = None
    pod_updated_at: float = None  # pod信息最后更新时间

    def __init__(self, **data):
        super().__init__(**data)
        current_time = time.time()
        if self.created_at is None:
            self.created_at = current_time
        if self.last_accessed_at is None:
            self.last_accessed_at = current_time
        if self.pod_updated_at is None:
            self.pod_updated_at = current_time


class SessionManager:
    """
    会话管理器
    """

    thread_map: Dict[str, SessionState]  # session_id -> thread_chat_id

    def __init__(self, session_timeout: int = 60 * 60 * 2):  # 默认2小时超时
        self.thread_map = {}
        self.session_timeout = session_timeout  # 会话超时时间（秒）
        self.last_cleanup_time = time.time()
        self.cleanup_interval = 10 * 60  # 每10分钟执行一次清理

    def _lazy_cleanup_expired_sessions(self):
        """
        懒检查：清理过期的会话
        只有在距离上次清理超过cleanup_interval时才执行
        """
        current_time = time.time()

        # 如果距离上次清理时间不够，跳过清理
        if current_time - self.last_cleanup_time < self.cleanup_interval:
            return

        self.last_cleanup_time = current_time
        expired_threads = []

        for thread_id, session in self.thread_map.items():
            # 检查是否超过了pod过期时间（pod_updated_at + pod_session_expired_time）
            if session.pod_session_expired_time > 0:
                pod_expire_time = (
                    session.pod_updated_at + session.pod_session_expired_time
                )
                if current_time > pod_expire_time:
                    expired_threads.append(thread_id)
                    logger.info(
                        f"Session {thread_id} expired due to pod_session_expired_time. "
                        f"Pod updated at: {session.pod_updated_at}, "
                        f"remaining time: {session.pod_session_expired_time}s, "
                        f"expire time: {pod_expire_time}, current: {current_time}"
                    )
                    continue

            # 检查是否超过了会话超时时间（基于最后访问时间）
            if current_time - session.last_accessed_at > self.session_timeout:
                expired_threads.append(thread_id)
                logger.info(f"Session {thread_id} expired due to inactivity timeout")
                continue

        # 清理过期的会话
        for thread_id in expired_threads:
            try:
                self.destroy_thread(thread_id)
                logger.info(f"Cleaned up expired session: {thread_id}")
            except Exception as e:
                logger.error(f"Error cleaning up session {thread_id}: {e}")

        if expired_threads:
            logger.info(f"Cleaned up {len(expired_threads)} expired sessions")

    def _update_last_accessed(self, thread_id: str):
        """更新会话的最后访问时间"""
        if thread_id not in self.thread_map:
            logger.debug(f"Thread {thread_id} not found, skipping update last accessed")
            return

        try:
            session = self.thread_map[thread_id]
            self.thread_map[thread_id] = session.model_copy(
                update={"last_accessed_at": time.time()}
            )
        except KeyError:
            # 在更新过程中被其他操作删除了，忽略
            logger.debug(f"Thread {thread_id} was removed during update, skipping")

    def has_thread(self, thread_id: Optional[str]) -> bool:
        if not thread_id:
            return False
        # 执行懒检查
        self._lazy_cleanup_expired_sessions()
        return thread_id in self.thread_map

    # 获取会话状态
    def get_thread_state(self, thread_id: str) -> SessionState:
        # 执行懒检查
        self._lazy_cleanup_expired_sessions()
        # 更新最后访问时间
        self._update_last_accessed(thread_id)
        return self.thread_map[thread_id]

    async def validate(
        self,
        device_id: str,
        product_id: str,
    ):
        resource = pod_manager.get_resource(device_id=device_id, product_id=product_id)
        return resource

    def update_thread_state(
        self,
        thread_id: str,
        device_info: Dict[str, Any],
        auth_info: Dict[str, Any],
        # tos_info: Dict[str, Any],
    ):
        session = self.thread_map[thread_id]
        current_time = time.time()
        self.thread_map[thread_id] = session.model_copy(
            update={
                "pod_session_expired_time": device_info["free_time"],
                "authorization_token": auth_info["authorization"],
                "pod_size": PodSize(
                    width=device_info["width"], height=device_info["height"]
                ),
                "pod_id": device_info["device_id"],
                "product_id": device_info["product_id"],
                "pod_account_id": device_info["account_id"],
                "sts_token": StsToken(
                    AccessKeyID=auth_info["ak"],
                    SecretAccessKey=auth_info["sk"],
                    SessionToken=auth_info["session_token"],
                    CurrentTime=auth_info["current_time"],
                    ExpiredTime=auth_info["expired_time"],
                ),
                "last_accessed_at": current_time,  # 更新访问时间
                "pod_updated_at": current_time,  # 更新pod信息时间
            }
        )
        return self.thread_map[thread_id]

    def update_thread_chat_id(self, thread_id: str, chat_thread_id: str):
        session = self.thread_map[thread_id]
        self.thread_map[thread_id] = session.model_copy(
            update={
                "chat_thread_id": chat_thread_id,
                "last_accessed_at": time.time(),  # 更新访问时间
            }
        )
        return self.thread_map[thread_id]

    # 创建会话
    def create_thread(
        self,
        account_id: str,
        thread_id: str,
        device_info: Dict[str, Any],  # 云手机设备信息
        auth_info: Dict[str, Any],  # 授权信息
        # tos_info: Dict[str, Any] = None,  # tos 信息
    ):
        session = SessionState(
            account_id=account_id,
            chat_thread_id=str(uuid.uuid4()),
            pod_session_expired_time=device_info["free_time"],
            pod_id=device_info["device_id"],
            product_id=device_info["product_id"],
            pod_size=PodSize(width=device_info["width"], height=device_info["height"]),
            authorization_token=auth_info["authorization"],
            pod_account_id=device_info["account_id"],
            sts_token=StsToken(
                AccessKeyID=auth_info["ak"],
                SecretAccessKey=auth_info["sk"],
                SessionToken=auth_info["session_token"],
                CurrentTime=auth_info["current_time"],
                ExpiredTime=auth_info["expired_time"],
            ),
            tos_bucket=os.environ.get("TOS_BUCKET"),
            tos_region=os.environ.get("TOS_REGION"),
            tos_endpoint=os.environ.get("TOS_ENDPOINT"),
        )
        self.thread_map[thread_id] = session
        return session

    def reset_thread(self, thread_id: str, new_chat_thread_id: str) -> SessionState:
        """
        重置会话，保持同一个 pod 但使用新的 threadId
        """
        if thread_id not in self.thread_map:
            raise ValueError(f"Thread {thread_id} not found")

        self.stop_sse_connection(thread_id)
        session = self.update_thread_chat_id(
            thread_id=thread_id, chat_thread_id=new_chat_thread_id
        )
        return session

    # 销毁会话
    def destroy_thread(self, thread_id: str):
        if thread_id not in self.thread_map:
            logger.debug(f"Thread {thread_id} already removed or does not exist")
            return
        self.stop_sse_connection(thread_id)
        # 删除逻辑
        self.thread_map.pop(thread_id, None)

    # 设置 sse 连接状态
    def set_sse_connection(self, thread_id: str):
        stop_event = asyncio.Event()
        self.thread_map[thread_id].sse_connection = stop_event

    # 停止 sse 连接
    def stop_sse_connection(self, thread_id: str):
        try:
            session = self.thread_map.get(thread_id)
            if session and session.sse_connection:
                session.sse_connection.set()
        except (KeyError, AttributeError):
            # 会话已被删除或sse_connection为None，忽略错误
            pass


session_manager = SessionManager()
