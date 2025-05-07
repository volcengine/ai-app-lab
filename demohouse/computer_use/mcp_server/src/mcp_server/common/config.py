import os
from pathlib import Path

from dynaconf import Dynaconf


def find_project_root():

    current = Path(__file__).resolve()

    for parent in [current, *current.parents]:
        if (parent / "pyproject.toml").exists() or (parent / "setup.py").exists():
            return str(parent)

    return os.getcwd()


root_dir = find_project_root()

settings = Dynaconf(
    settings_files=[
        os.path.join(root_dir, "settings.toml"),
    ],
)

log_config = settings.get("logging", {})
tool_server_config = settings.get("tool_server", {})
