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

from abc import ABC, abstractmethod
from pydantic import BaseModel

class CreateSandboxRequest(BaseModel):
    pass

class DeleteSandboxRequest(BaseModel):
    pass

class DescribeSandboxesRequest(BaseModel):
    pass

class DescribeSandboxTerminalUrlRequest(BaseModel):
    pass

class ValidateVncTokenRequest(BaseModel):
    pass

class Manager(ABC):
    def __init__(self):
        pass

    @abstractmethod 
    def get_manager_request_name(self, action: str) -> str:
        pass

    @abstractmethod
    def create_sandbox(self, request: CreateSandboxRequest):
        pass

    @abstractmethod
    def delete_sandbox(self, request: DeleteSandboxRequest):
        pass
    
    @abstractmethod
    def describe_sandboxes(self, request: DescribeSandboxesRequest):
        pass

    @abstractmethod
    def describe_sandbox_terminal_url(self, request: DescribeSandboxTerminalUrlRequest):
        pass

    @abstractmethod
    def validate_vnc_token(self, request: ValidateVncTokenRequest):
        pass


class ManagerFactory(ABC):
    @classmethod
    @abstractmethod
    def create_manager(cls) -> Manager:
        pass


def get_manager(factory: type[ManagerFactory]) -> Manager:
    return factory.create_manager()

    
    