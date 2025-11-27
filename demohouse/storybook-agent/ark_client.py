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

from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime.types.images.images import SequentialImageGenerationOptions
from typing import List, Dict, Any, Optional
import os
import logging
from dotenv import load_dotenv

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

class ArkClient:
    def __init__(self):
        # 从环境变量获取配置
        self.api_key = os.getenv("ARK_API_KEY")
        self.base_url = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
        
        if not self.api_key:
            raise ValueError("请设置ARK_API_KEY环境变量")
        
        # 初始化客户端
        self.client = Ark(
            base_url=self.base_url,
            api_key=self.api_key
        )
    

    
    def chat_completion(
        self,
        model: str,
        messages: List[Dict],
        temperature: float = 0.7,
        max_tokens: int = 2000,
        stream: bool = False,
        response_format: Optional[str] = None,
        disable_thinking: bool = False
    ) -> Dict[str, Any]:
        """调用火山方舟聊天模型API"""
        try:
            logger.info(f"开始调用火山方舟聊天模型API，模型: {model}")
            
            # 参数验证
            if not messages or len(messages) == 0:
                raise ValueError("messages不能为空")
            
            # 构建请求参数
            request_params = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": stream
            }
            
            # 添加可选参数
            if response_format:
                request_params["response_format"] = {
                    "type": response_format
                }
            
            # 添加disable_thinking参数
            if disable_thinking:
                request_params["thinking"] = {"type": "disabled"}
            
            # 调用API
            response = self.client.chat.completions.create(**request_params)
            
            # 处理响应
            result = {
                "status": "success",
                "content": ""
            }
            
            if hasattr(response, 'choices') and len(response.choices) > 0:
                choice = response.choices[0]
                if hasattr(choice, 'message') and hasattr(choice.message, 'content'):
                    result["content"] = choice.message.content
            
            logger.info("聊天模型调用成功")
            return result
            
        except Exception as e:
            error_message = f"调用火山方舟聊天模型API失败: {str(e)}"
            logger.error(error_message)
            raise Exception(error_message)
    
    def images_generate(
        self,
        model: str,
        prompt: str,
        image: Optional[List[str]] = None,
        sequential_image_generation: str = "auto",
        response_format: str = "url",
        size: str = "2K",
        stream: bool = False,
        watermark: bool = True
    ) -> Dict[str, Any]:
        """调用火山方舟图片生成API"""
        try:
            logger.info(f"开始调用火山方舟图片生成API，模型: {model}")
            
            # 参数验证
            if not prompt or len(prompt.strip()) == 0:
                raise ValueError("提示词不能为空")
            
            # 构建请求参数
            request_params = {
                "model": model,
                "prompt": prompt,
                "image": image,
                "sequential_image_generation": sequential_image_generation,
                "sequential_image_generation_options": SequentialImageGenerationOptions(max_images=15 - len(image)), 
                "response_format": response_format,
                "size": size,
                "stream": stream,
                "watermark": watermark
            }
            
            # 调用API
            response = self.client.images.generate(**request_params)
            
            logger.info(f"response: {response}")
            
            # 处理响应
            result = {
                "status": "success",
                "data": []
            }
            
            if hasattr(response, 'data'):
                for item in response.data:
                    if hasattr(item, 'url'):
                        result["data"].append({
                            "url": item.url
                        })
            
            logger.info(f"图片生成成功，返回{len(result['data'])}张图片")
            return result
            
        except Exception as e:
            print(e)
            error_message = f"调用火山方舟图片生成API失败: {str(e)}"
            logger.error(error_message)
            raise Exception(error_message)

    def images_generate_stream(
        self,
        model: str,
        prompt: str,
        image: Optional[List[str]] = None,
        sequential_image_generation: str = "auto",
        response_format: str = "url",
        size: str = "2K",
        watermark: bool = True
    ):
        try:
            logger.info(f"开始流式调用图片生成API，模型: {model}")
            if not prompt or len(prompt.strip()) == 0:
                raise ValueError("提示词不能为空")
            remaining = 15 - (len(image) if image else 0)
            request_params = {
                "model": model,
                "prompt": prompt,
                "image": image,
                "sequential_image_generation": sequential_image_generation,
                "sequential_image_generation_options": SequentialImageGenerationOptions(max_images=remaining),
                "response_format": response_format,
                "size": size,
                "stream": True,
                "watermark": watermark
            }
            response = self.client.images.generate(**request_params)
            for event in response:
                print(event)
                # 直接从event对象获取url，根据提供的样例
                if hasattr(event, 'url') and event.url:
                    yield event.url
        except Exception as e:
            print(e)
            error_message = f"流式调用图片生成API失败: {str(e)}"
            logger.error(error_message)
            raise Exception(error_message)