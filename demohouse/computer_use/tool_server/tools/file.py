import base64
from pathlib import Path
from typing import Optional, Union
import tempfile
from tools.base import BaseError


class FilesystemService:
    """Service for handling filesystem operations within the container"""

    def __init__(self, base_path: str = tempfile.gettempdir()):
        self.base_path = Path(base_path)
        if not self.base_path.exists():
            raise ValueError(f"Base path {base_path} does not exist")

    def _validate_path(self, path: Union[str, Path]) -> Path:
        """Validate and resolve a path to ensure it's within base_path"""
        try:
            # Convert to Path object if it's a string
            path_obj = Path(path)

            # If path is not absolute, make it relative to base_path
            if not path_obj.is_absolute():
                full_path = (self.base_path / path_obj).resolve()
            else:
                # For absolute paths, just resolve them
                full_path = path_obj.resolve()

            # Check if the path is within the base directory
            if not str(full_path).startswith(str(self.base_path)):
                raise BaseError(
                    message="Access to paths outside base directory is not allowed"
                )
            return full_path
        except Exception as e:
            raise BaseError(
                message=f"Invalid path: {str(e)}"
            )

    async def read(self, path: str, encoding: Optional[str] = 'utf-8') -> Union[str, bytes]:
        """Read file content from the filesystem"""
        full_path = self._validate_path(path)

        if not full_path.exists():
            raise BaseError(
                message=f"File not found: {path}"
            )

        try:
            if encoding:
                return full_path.read_text(encoding=encoding)
            return full_path.read_bytes()
        except Exception as e:
            raise BaseError(
                message=f"Failed to read file: {str(e)}"
            )

    async def write(self, path: str, content: Union[str, bytes], encoding: Optional[str] = 'utf-8') -> None:
        """Write content to a file in the filesystem"""
        full_path = self._validate_path(path)

        try:
            # Create parent directories if they don't exist
            full_path.parent.mkdir(parents=True, exist_ok=True)

            if isinstance(content, str):
                full_path.write_text(content, encoding=encoding)
            else:
                full_path.write_bytes(content)
        except Exception as e:
            raise BaseError(
                message=f"Failed to write file: {str(e)}"
            )

    async def upload(self, path: str, content: str) -> None:
        """Upload base64 encoded content to a file"""
        try:
            decoded_content = base64.b64decode(content)
            await self.write(path, decoded_content, encoding=None)
        except Exception as e:
            raise BaseError(
                message=f"Failed to decode or write content: {str(e)}"
            )

    async def download(self, path: str) -> str:
        """Read file and return base64 encoded content"""
        try:
            content = await self.read(path, encoding=None)
            return base64.b64encode(content).decode()
        except Exception as e:
            raise BaseError(
                message=f"Failed to read or encode file: {str(e)}"
            )
