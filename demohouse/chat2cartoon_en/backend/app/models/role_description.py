from pydantic import BaseModel


class RoleDescription(BaseModel):
    description: str