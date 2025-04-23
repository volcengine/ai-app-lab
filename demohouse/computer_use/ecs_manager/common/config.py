import os
from pydantic import BaseModel

from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    TomlConfigSettingsSource,
)

class LoggingSettings(BaseModel):
    filename: str = "ecs_manager.log"
    env: str = "dev"
    format: str = "%(asctime)s %(levelname)7s %(request_id)s %(filename)s:%(lineno)s - %(name)s - %(message)s"
    datefmt: str = "%Y-%m-%d %H:%M:%S"
    backup_count: int = 5
    max_bytes: int = 1024 * 1024 * 100

class MangerSettings(BaseModel):
    access_key: str = "access_key"
    secret_key: str = "secret_key"
    region: str = "cn-beijing"
    host: str = "open.volcengineapi.com"
    session_token: str = ""

class InstanceConfig(BaseModel):
    instance_name: str = "sandbox"
    instance_type: str = ""
    password: str = ""
    zone: str = ""
    tag_key: str = "computer-use-sandbox"
    tag_value: str = "sandbox"
    user_data: str = ""
    image_id: str = "image-linux"
    windows_image_id: str = "image-windows"
    project_name: str = "project-1"
    subnet_id: str = "subnet-id"
    security_group_ids: list[str] = ["sg-id"]
    volume_size: int = 80

class Settings(BaseSettings):
    port: int = 8102
    log: LoggingSettings = LoggingSettings()
    mgr: MangerSettings = MangerSettings()
    instance_config: InstanceConfig = InstanceConfig()
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


def get_settings() -> Settings:
    return Settings()
