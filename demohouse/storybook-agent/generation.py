from weakref import ref
from fastapi import HTTPException
from typing import Dict, Any, List
import logging
from datetime import datetime
import json
import os
from const import StoryBookPlanningPrompt, ComicsBookPlanningPrompt

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def generate_storybook_plan(
    query: str, 
    reference_images: List[str], 
    ark_client,  # 需要作为参数传入
    language: str = "zh_CN", 
    timestamp: str = None,
    mode: str = "storybook"
) -> Dict[str, Any]:
    """
    生成故事书或漫画计划
    
    Args:
        query: 用户输入的故事要求
        reference_images: 参考图片URL列表
        ark_client: Ark客户端实例
        language: 语言设置
        timestamp: 时间戳
        mode: 生成模式，可以是storybook或comics
        
    Returns:
        处理后的计划
    """
    if not ark_client:
        raise HTTPException(status_code=503, detail="服务暂不可用，请检查配置")
    
    # 使用当前服务器日期和时间作为默认值
    if timestamp is None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    logger.info(f"生成{'故事书' if mode == 'storybook' else '漫画'}计划，语言: {language}, 时间: {timestamp}, 模式: {mode}")
    
    # 根据mode选择不同的prompt
    if mode == "comics":
        prompt_content = ComicsBookPlanningPrompt.replace('$__locale__$', language)
    else:
        prompt_content = StoryBookPlanningPrompt.replace('$__locale__$', language)
    
    # 并在system prompt开头添加语言、时间信息和模式
    prompt = f"语言：{language} 时间：{timestamp} 模式：{mode}\n{prompt_content}"
    
    # 构建messages
    messages = [
        {"role": "system", "content": prompt}
    ]
    
    # 添加用户查询作为第一个消息部分
    user_messages = [
        {
            "type": "text",
            "text": query
        }
    ]
    
    # 如果有参考图片，将其添加到用户消息中
    if reference_images:
        for img_url in reference_images:
            user_messages.append({
                "type": "image_url",
                "image_url": {
                    "url": img_url
                }
            })
    
    # 添加完整的用户消息
    messages.append({
        "role": "user",
        "content": user_messages
    })
    
    # 获取模型名称
    import os
    model_name = os.getenv("MODEL_NAME", "doubao-seed-1-6-251015")
    
    # 调用方舟模型，设置返回格式为 JSON 对象并禁用思考过程
    result = ark_client.chat_completion(
        model=model_name,
        messages=messages,
        stream=False,
        response_format='json_object',
        disable_thinking=True
    )
    
    try:
        # 尝试将返回的内容解析为 JSON 对象
        content_json = json.loads(result["content"])
        
        # 对storyBookContent的scenes_detail进行二次加工
        if isinstance(content_json, dict) and "scenes_detail" in content_json:
            scenes_detail = content_json["scenes_detail"]
            # 确保scenes_detail是数组格式
            if isinstance(scenes_detail, list):
                if mode == "comics":
                    # 漫画模式：使用用户要求的格式
                    content_json["scenes_detail"] = f"贴合用户诉求：{query}\n\n  同时结合如下描述生成一组连环画图片：\n" + '\n'.join(content_json["scenes_detail"])
                else:
                    # 故事书模式：原有处理逻辑
                    # 处理每个场景，添加图片编号前缀
                    for i in range(len(scenes_detail)):
                        scenes_detail[i] = f"\n 图片{i + 2}：{scenes_detail[i]}；  "
                    
                    # 在开头添加封面图指令和用户诉求
                    scenes_detail.insert(0, '\n 图片1：结合整体故事生成一张封面图；  ')
                    scenes_detail.insert(0, f'贴合用户诉求： {query}\n\n  同时结合如下描述生成一组绘本图片：')
                    
                    # 添加检查指令
                    scenes_detail.append('\n\n  最后，检查每一张图片，并去掉图片中的文字。')
                    
                    # 将数组合并为字符串
                    content_json["scenes_detail"] = '\n'.join(scenes_detail)
        
        return content_json
    except json.JSONDecodeError:
        # 如果解析失败，则返回包含原始内容的字典
        logger.warning("返回内容不是有效的 JSON 格式，返回原始内容")
        return {
            "content": result["content"]
        }


def generate_storybook_images(
    image_prompt: str,
    reference_images: List[str],
    ark_client,
    size: str = "2048x2048"
) -> List[str]:
    """
    为故事书生成图片
    
    Args:
        image_prompt: 图片生成的提示词
        ark_client: Ark客户端实例
        
    Returns:
        生成的图片URL列表
    """
    if not ark_client:
        raise HTTPException(status_code=503, detail="服务暂不可用，请检查配置")
    
    logger.info("开始生成故事书图片")
    
    # 创建图片生成请求参数
    image_model = os.getenv("VISION_MODEL_NAME", "doubao-seedream-4-0-250828")
    
    # 调用ark_client的images_generate方法
    image_result = ark_client.images_generate(
        model=image_model,
        prompt=image_prompt,
        image=reference_images,
        sequential_image_generation="auto",  # 启用顺序图片生成
        response_format="url",
        size=size,
        stream=False,
        watermark=True
    )
    
    return [image.get("url", "") for image in image_result.get("data", [])]

async def generate_storybook_images_stream(
    image_prompt: str,
    reference_images: List[str],
    ark_client,
    size: str = "2048x2048"
):
    if not ark_client:
        raise HTTPException(status_code=503, detail="服务暂不可用，请检查配置")
    logger.info("开始流式生成故事书图片")
    image_model = os.getenv("VISION_MODEL_NAME", "doubao-seedream-4-0-250828")
    
    # 使用普通for循环处理流式响应
    for url in ark_client.images_generate_stream(
        model=image_model,
        prompt=image_prompt,
        image=reference_images,
        sequential_image_generation="auto",
        response_format="url",
        size=size,
        watermark=True
    ):
        yield url
