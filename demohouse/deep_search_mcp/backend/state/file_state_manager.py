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

import json
import aiofiles
import os
from pathlib import Path
from typing import Optional
from pydantic import ValidationError, BaseModel

from state.deep_research_state import DeepResearchStateManager, DeepResearchState


class FileStateManager(BaseModel, DeepResearchStateManager):
    path: str = ''

    async def _ensure_directory(self) -> None:
        """确保存储目录存在（异步安全方式）"""
        dir_path = Path(self.path).parent
        if not dir_path.exists():
            os.makedirs(dir_path, exist_ok=True)

    async def dump(self, state: DeepResearchState) -> None:
        """将状态异步保存到 JSON 文件"""
        try:
            await self._ensure_directory()
            async with aiofiles.open(self.path, 'w', encoding='utf-8') as f:
                # 使用 Pydantic 模型自带的序列化方法
                state_dict = state.model_dump(mode='json')
                await f.write(json.dumps(state_dict, indent=2))
        except (IOError, OSError) as e:
            raise RuntimeError(f"Failed to save state to {self.path}: {str(e)}") from e
        except Exception as e:
            raise RuntimeError(f"Unexpected error during state save: {str(e)}") from e

    async def load(self) -> Optional[DeepResearchState]:
        """从 JSON 文件异步加载状态"""
        try:
            if not os.path.exists(self.path):
                return None

            async with aiofiles.open(self.path, 'r', encoding='utf-8') as f:
                content = await f.read()
                state_dict = json.loads(content)
                return DeepResearchState.model_validate(state_dict)
        except FileNotFoundError:
            return None
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON format in {self.path}: {str(e)}") from e
        except ValidationError as e:
            raise ValueError(f"Data validation failed for {self.path}: {str(e)}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to load state from {self.path}: {str(e)}") from e
