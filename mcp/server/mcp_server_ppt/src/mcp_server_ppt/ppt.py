# coding: utf-8
"""
Chatppt MCP Server
"""
import argparse
import logging
import os
import traceback

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import Field

# 创建MCP服务器实例
mcp = FastMCP(
    "Chatppt Server",
    host=os.getenv("HOST", "0.0.0.0"),
    port=int(os.getenv("PORT", "8000")),
)
# Chatppt API Base URL
API_BASE = "https://saas.api.yoo-ai.com"
# 用户API Key
API_PPT_KEY = os.getenv('API_PPT_KEY')
logger = logging.getLogger(__name__)


def check_api_key():
    """检查 API_PPT_KEY 是否已设置"""
    if not API_PPT_KEY:
        raise ValueError("API_PPT_KEY 环境变量未设置")
    return API_PPT_KEY


@mcp.tool()
async def check():
    """查询用户当前配置token"""
    return os.getenv('API_PPT_KEY')


# 注册工具的装饰器，可以很方便的把一个函数注册为工具
@mcp.tool()
async def query_ppt(ppt_id: str = Field(description="PPT-ID")) -> str:
    """
    Name:
        查询PPT生成进度
    Description:
        根据PPT任务ID查询异步生成结果，status=1表示还在生成中，应该继续轮训该查询，status=2表示成功，status=3表示失败；process_url表示预览的url地址，不断轮训请求直至成功或失败;
        当成功后使用默认浏览器打开ppt地址并调用download_ppt工具下载PPT和工具editor_ppt生成编辑器地址；
    Args:
        ppt_id: PPT-ID
    Returns:
        PPT信息的描述
    """

    try:
        url = API_BASE + '/mcp/ppt/ppt-result'

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={'id': ppt_id},
                headers={'Authorization': 'Bearer ' + API_PPT_KEY},
                timeout=30
            )
            response.raise_for_status()

        if response.status_code != 200:
            raise Exception(f"API请求失败: HTTP {response.status_code}")

        return response.json()
    except KeyError as e:
        raise Exception(f"Failed to parse response: {str(e)}") from e
    except httpx.HTTPError as e:
        raise Exception(f"HTTP request failed: {str(e)}") from e


@mcp.tool()
async def build_ppt(
        text: str = Field(description="描述生成文本"),
) -> str:
    """
    Name:
        PPT生成。当用户需要生成PPT时，调用此工具
    Description:
        根据描述的文本或markdown，执行生成任务。当返回PPT-ID时，表示生成任务成功，可以调用query_ppt工具查询生成进度和预览URL
    Args:
        text: 输入描述的文本或markdown，生成PPT
    Returns:
        PPT-ID
    """

    try:
        url = API_BASE + '/mcp/ppt/ppt-create'

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                data={'text': text},
                headers={'Authorization': 'Bearer ' + API_PPT_KEY},
                timeout=30
            )
            response.raise_for_status()

        if response.status_code != 200:
            raise Exception(f"API请求失败: HTTP {response.status_code}")

        return response.json()
    except httpx.HTTPError as e:
        raise Exception(f"HTTP请求失败: {str(e)}") from e
    except ValueError as e:
        raise Exception(str(e)) from e
    except Exception as e:
        logger.info(traceback.print_exc())
        raise Exception(f"PPT生成失败: {str(e)}") from e


@mcp.tool()
async def replace_template_ppt(ppt_id: str = Field(description="PPT-ID")) -> str:
    """
    Name:
        替换模板。参照给出的任务PPT-ID随机更换用户的ppt模板。
    Description:
        根据PPT-ID执行替换模板
    Args:
        ppt_id: PPT-ID
    Returns:
        新的PPT-ID
    """

    try:
        url = API_BASE + '/mcp/ppt/ppt-create-task'

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                data={'id': ppt_id},
                headers={'Authorization': 'Bearer ' + API_PPT_KEY},
                timeout=60
            )
            response.raise_for_status()

        if response.status_code != 200:
            raise Exception(f"API请求失败: HTTP {response.status_code}")

        return response.json()
    except httpx.HTTPError as e:
        raise Exception(f"HTTP request failed: {str(e)}") from e


@mcp.tool()
async def download_ppt(
        ppt_id: str = Field(description="PPT-ID")
) -> str:
    """
    Name:
        当PPT生成完成后，生成下载PPT的地址，方便用户下载到本地。
    Description:
        获取完整生成PPT文件的下载地址，仅当PPT生成完成后，才生成此下载地址。
    Args:
        ppt_id: PPT-ID
    Returns:
        PPT下载地址URL
    """

    try:
        url = API_BASE + '/mcp/ppt/ppt-download'

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={'id': ppt_id},
                headers={'Authorization': 'Bearer ' + API_PPT_KEY},
                timeout=60
            )
            response.raise_for_status()

        if response.status_code != 200:
            raise Exception(f"API请求失败: HTTP {response.status_code}")

        return response.json()
    except httpx.HTTPError as e:
        raise Exception(f"HTTP request failed: {str(e)}") from e


@mcp.tool()
async def editor_ppt(
        ppt_id: str = Field(description="PPT-ID")
) -> str:
    """
    Name:
         基于生成后的文件，打开并展示pptx文件，方便进行在线编辑与浏览查看。
    Description:
        通过PPT-ID生成PPT编辑器界面URL
    Args:
        ppt_id: PPT-ID
    Returns:
        PPT编辑器地址URL
    """

    try:
        url = API_BASE + '/mcp/ppt/ppt-editor'

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                data={'id': ppt_id},
                headers={'Authorization': 'Bearer ' + API_PPT_KEY},
                timeout=60
            )
            response.raise_for_status()

        if response.status_code != 200:
            raise Exception(f"API请求失败: HTTP {response.status_code}")

        return response.json()
    except httpx.HTTPError as e:
        raise Exception(f"HTTP request failed: {str(e)}") from e

def main():
    """MCP Chatppt Server - HTTP call Chatppt API for MCP"""
    parser = argparse.ArgumentParser(description="Run the veFaaS browser use MCP Server")
    parser.add_argument(
        "--transport",
        "-t",
        choices=["sse", "stdio"],
        default="stdio",
        help="Transport protocol to use (sse or stdio)",
    )
    args = parser.parse_args()

    logger.info(f"start {args.transport} server")
    mcp.run(transport=args.transport)


if __name__ == "__main__":
    main()

