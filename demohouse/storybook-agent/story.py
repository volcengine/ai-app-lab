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

import logging
from typing import Dict, Any, List
from generation import generate_storybook_plan, generate_storybook_images

# 配置日志
logger = logging.getLogger(__name__)

# 辅助函数：检查计划格式和必要字段
def validate_storybook_plan(plan):
    """验证故事书/漫画计划的格式和必要字段"""
    if not isinstance(plan, dict):
        raise ValueError("生成的计划格式错误，应为字典类型")
    
    # 检查必要字段
    required_fields = ["scenes_detail"]
    for field in required_fields:
        if field not in plan:
            raise ValueError(f"计划缺少必要字段: {field}")
    
    return True

# 步骤1：生成故事书计划
async def generate_plan_step(query, reference_images, ark_client, language, timestamp, mode="storybook"):
    """生成故事书计划的步骤"""
    plan = await generate_storybook_plan(
        query=query,
        reference_images=reference_images,
        ark_client=ark_client,
        language=language,
        timestamp=timestamp,
        mode=mode
    )
    
    # 验证计划格式
    validate_storybook_plan(plan)
    
    logger.info(f"生成的故事书计划: {plan}")
    return plan

# 步骤2：生成图片
async def generate_images_step(plan, reference_images, ark_client, size="2048x2048"):
    """生成图片的步骤"""
    # 从计划中提取图片生成提示
    image_prompt = plan["scenes_detail"]
    
    # 调用图片生成函数
    output_images = generate_storybook_images(
        image_prompt=image_prompt,
        reference_images=reference_images,
        ark_client=ark_client,
        size=size
    )
    
    logger.info(f"生成的图片URL列表: {output_images}")
    return output_images

# 步骤3：构建响应数据
def build_response_step(plan, output_images, mode="storybook"):
    """构建响应数据的步骤"""
    items = []
    scenes = plan.get("scenes", [])
    
    for i, image_url in enumerate(output_images):
        # 基础项，只包含Url字段
        item = {"Url": image_url}
        
        # 只有在mode="storybook"时才添加Text和IsCover字段
        if mode == "storybook":
            if i == 0:
                item["Text"] = ""
                item["IsCover"] = True
            else:
                sIdx = i - 1
                item["Text"] = scenes[sIdx] if sIdx < len(scenes) else ""
                item["IsCover"] = False
        
        items.append(item)
    
    response_data = {
        "Title": plan.get("title", ""),
        "Summary": plan.get("summary", ""),
        "Items": items,
        "Mode": mode
    }
    
    return {
        "status": "success",
        "data": response_data
    }