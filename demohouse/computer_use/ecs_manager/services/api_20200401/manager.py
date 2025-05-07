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

    
    