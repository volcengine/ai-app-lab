from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
import asyncio
import os
import logging
from typing import Dict, Any, List, Optional
import uvicorn
import json
from dotenv import load_dotenv
from ark_client import ArkClient
from datetime import datetime
from story import generate_plan_step, generate_images_step, build_response_step
from generation import generate_storybook_images_stream

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

# 获取有效的User Token列表
# 在实际生产环境中，应该从更安全的地方获取，比如数据库或密钥管理服务
VALID_USER_TOKENS = os.getenv("VALID_USER_TOKENS", "test_api_key").split(",")

# 创建User Token头部验证器
user_token_header = APIKeyHeader(name="X-User-Token", auto_error=False)

# User Token验证依赖
async def verify_user_token(user_token: str = Depends(user_token_header)):
    if not user_token:
        raise HTTPException(
            status_code=401,
            detail="缺少User Token，请在请求头中提供X-User-Token"
        )
    if user_token not in VALID_USER_TOKENS:
        raise HTTPException(
            status_code=403,
            detail="无效的User Token"
        )
    return user_token

# 创建FastAPI应用
app = FastAPI(
    title="Storybook Agent API",
    description="使用火山方舟模型的聊天和图片生成接口",
    version="1.0.0"
)

# 添加CORS中间件
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该设置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StoryBookGenerateRequest(BaseModel):
    query: str = Field(..., description="用户输入的故事要求")
    reference_images: List[str] = Field(default_factory=list, description="参考图片URL列表")
    mode: str = Field(default="storybook", description="生成模式，可以是storybook或comics", pattern="^(storybook|comics)$")
    size: str = Field(default="2048x2048", description="生成图片的尺寸，格式为widthxheight")

# 根路径
@app.get("/")
async def root():
    return {"message": "Chat API 服务运行中"}

# 初始化Ark客户端
try:
    ark_client = ArkClient()
    logger.info("Ark客户端初始化成功")
except Exception as e:
    logger.error(f"Ark客户端初始化失败: {str(e)}")
    # 在实际部署中，可能需要根据配置决定是否继续启动服务
    ark_client = None

# Storybook生成接口（需要User Token验证）
@app.post("/api/storybook/generate")
async def generate_storybook(request: Request, story_request: StoryBookGenerateRequest, user_token: str = Depends(verify_user_token)):
    try:
        # 从header中获取语言和时间信息，如果没有则使用默认值
        language = request.headers.get("language", "zh_CN")
        # 使用当前服务器日期和时间作为默认值
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M")
        timestamp = request.headers.get("timestamp", current_time)
        
        logger.info(f"收到storybook生成请求，语言: {language}, 时间: {timestamp}")
        
        # Step1： 生成计划
        plan = await generate_plan_step(
            query=story_request.query,
            reference_images=story_request.reference_images,
            ark_client=ark_client,
            language=language,
            timestamp=timestamp,
            mode=story_request.mode
        )
        
        # Step2: 生成图片
        output_images = await generate_images_step(
            plan=plan,
            reference_images=story_request.reference_images,
            ark_client=ark_client,
            size=story_request.size
        )
        
        # Step3: 构建响应数据
        return build_response_step(plan=plan, output_images=output_images, mode=story_request.mode)
        
    except ValueError as ve:
        logger.warning(f"storybook生成请求参数错误: {str(ve)}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"处理storybook生成请求时发生错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"storybook生成失败: {str(e)}")

# User Token验证接口
@app.post("/api/storybook/validate-token")
async def validate_user_token_endpoint(user_token: str = Depends(verify_user_token)):
    """
    验证User Token的有效性
    成功返回200状态码，失败返回401或403状态码
    """
    return {"valid": True, "message": "User Token验证成功"}

# Storybook流式生成接口（需要User Token验证）
@app.post("/api/storybook/generate_stream")
async def generate_storybook_stream(request: Request, story_request: StoryBookGenerateRequest, user_token: str = Depends(verify_user_token)):
    if not ark_client:
        raise HTTPException(status_code=503, detail="服务暂不可用，请检查配置")
    language = request.headers.get("language", "zh_CN")
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M")
    timestamp = request.headers.get("timestamp", current_time)
    logger.info(f"收到storybook流式生成请求，语言: {language}, 时间: {timestamp}")
    async def event_generator():
        yield f"event: image-generation\ndata: {json.dumps({'status': 'start'}, ensure_ascii=False)}\n\n"
        plan = await generate_plan_step(
            query=story_request.query,
            reference_images=story_request.reference_images,
            ark_client=ark_client,
            language=language,
            timestamp=timestamp,
            mode=story_request.mode
        )
        yield f"event: image-generation\ndata: {json.dumps({'status': 'plan', 'Title': plan.get('title', ''), 'Summary': plan.get('summary', '')}, ensure_ascii=False)}\n\n"
        scenes = plan.get("scenes", [])
        i = 0
        # 构建image_prompt，保持与之前逻辑一致
        image_prompt = ""
        if story_request.mode == "storybook":
            image_prompt = f"贴合用户诉求：{story_request.query}\n根据标题与摘要生成绘本封面：标题《{plan.get('title', '')}》，摘要：{plan.get('summary', '')}"
            for scene in scenes:
                image_prompt += f"\n根据场景描述生成绘本插图：{scene}"
        else:
            for scene in scenes:
                image_prompt += f"\n根据漫画分镜描述生成连环画图片：{scene}"
        
        async for image_url in generate_storybook_images_stream(
            image_prompt=image_prompt,
            reference_images=story_request.reference_images,
            ark_client=ark_client,
            size=story_request.size
        ):
            item = {"Url": image_url}
            if story_request.mode == "storybook":
                if i == 0:
                    item["Text"] = ""
                    item["IsCover"] = True
                else:
                    sIdx = i - 1
                    item["Text"] = scenes[sIdx] if sIdx < len(scenes) else ""
                    item["IsCover"] = False
            payload = {"status": "content", "Items": [item]}
            yield f"event: image-generation\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0)
            i += 1
        yield f"event: image-generation\ndata: {json.dumps({'status': 'end'}, ensure_ascii=False)}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

# 健康检查接口
@app.get("/api/health")
async def health_check():
    status = "healthy" if ark_client else "unhealthy"
    return {
        "status": status,
        "timestamp": asyncio.get_event_loop().time(),
        "service": "storybook-agent"
    }

if __name__ == "__main__":
    # 从环境变量读取配置
    host = os.getenv("API_HOST", "127.0.0.1")
    port = int(os.getenv("API_PORT", "8000"))
    
    logger.info(f"启动服务，监听地址: {host}:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=True)