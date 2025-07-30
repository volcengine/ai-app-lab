import io
from typing import Tuple

import requests
from arkitect.core.errors import InvalidParameter

from app.logger import INFO, ERROR, WARN


def _get_image_extension_from_response(response):
    # Extract Content-Type header
    content_type = response.headers.get('Content-Type')

    if content_type:
        # Map MIME type to file extension
        extension_map = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/bmp': 'bmp',
            'image/tiff': 'tiff',
            # Add more mappings if needed
        }
        return extension_map.get(content_type, None)
    return None


class DownloaderClient:
    def __init__(self):
        self.chunk_size = 1024
        self.max_file_size = 20 * 1024 * 1024  # 20 MB

    def download_to_memory(self, url: str) -> Tuple[io.BytesIO, str]:
        response = requests.get(url, stream=True)
        response.raise_for_status()

        file_extension = _get_image_extension_from_response(response)
        if file_extension is None:
            WARN("file extension is not determined")

        file_buffer = io.BytesIO()
        total_size = 0

        for chunk in response.iter_content(chunk_size=self.chunk_size):
            if chunk:
                total_size += len(chunk)
                if total_size > self.max_file_size:
                    ERROR("file size exceeds 20 MB. Download stopped.")
                    raise InvalidParameter("messages", "image file size exceed limit")
                file_buffer.write(chunk)

        file_buffer.seek(0)
        INFO(f"downloaded file to memory, size: {total_size / (1024 * 1024):.2f} MB")
        return file_buffer, file_extension
