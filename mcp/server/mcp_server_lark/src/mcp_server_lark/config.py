from enum import Enum
from pathlib import Path
from typing import List, Optional, Dict

import yaml
from pydantic import BaseModel


class IdType(str, Enum):
    email = "email"
    chat_id = "chat_id"
    user_id = "user_id"


class Contact(BaseModel):
    name: str
    description: Optional[str] = None
    id_type: IdType
    id: str


class Config(BaseModel):
    app_id: str
    app_secret: str
    dest_folder_token: str
    contact_list: List[Contact]

    @property
    def contact_dict(self) -> Dict[str, Contact]:
        return {c.name: c for c in self.contact_list}


def load_config(file_path: str) -> dict:
    path = Path(file_path)
    try:
        return Config(**yaml.safe_load(path.read_text()))
    except FileNotFoundError as e:
        raise FileNotFoundError(f"Config file not found: {file_path}") from e
