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
from pydantic import BaseModel

from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    TomlConfigSettingsSource,
)

class LoggingSettings(BaseModel):
    filename: str = "computer-use.log"
    env: str = "dev"
    format: str = "%(asctime)s %(levelname)7s %(filename)s:%(lineno)s - %(name)s - %(message)s"
    datefmt: str = "%Y-%m-%d %H:%M:%S"
    backup_count: int = 5
    max_bytes: int = 1024 * 1024 * 100

class Settings(BaseSettings):
    port: int = 8102
    display: str = ":5"
    log: LoggingSettings = LoggingSettings()
    screenshot_dir: str = "/tmp"
    model_config = SettingsConfigDict(
        env_prefix='',
        env_nested_delimiter='__',
        cli_parse_args=False,
    )

    @classmethod
    def settings_customise_sources(
            cls,
            settings_cls: type[BaseSettings],
            init_settings: PydanticBaseSettingsSource,
            env_settings: PydanticBaseSettingsSource,
            dotenv_settings: PydanticBaseSettingsSource,
            file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        config_files = cls._get_config_files()
        toml_source = TomlConfigSettingsSource(
            settings_cls,
            toml_file=config_files
        )
        return init_settings, env_settings, dotenv_settings, toml_source

    @classmethod
    def _get_config_files(cls) -> list[str]:
        env_files = os.getenv("CONFIG_FILES", "")
        if env_files:
            files = [f.strip() for f in env_files.split(",") if f.strip()]
            if files:
                return files
        return [
            'etc/config.toml',
            'config.toml',
            f'{os.getcwd()}/config.toml',
            f'{os.getcwd()}/etc/config.toml',
            '/etc/config.toml',
        ]

_settings = Settings()

def get_settings() -> Settings:
    return _settings
