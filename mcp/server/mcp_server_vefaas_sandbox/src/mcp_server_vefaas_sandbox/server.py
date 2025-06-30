import argparse
import json
import logging
import os
import http.client
from typing import Optional, List, Dict

from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("vefaas-sandbox", port=int(os.getenv("PORT", "8000")))

# Constants
Sandbox_API_BASE = (
    "xxx.apigateway-cn-beijing.volceapi.com"  # 替换为用户沙盒服务 APIG 地址
)
SANDBOX_AUTH_KEY = os.getenv("SANDBOX_AUTH_KEY", "")

logger = logging.getLogger(__name__)

# send http reqeust to SandboxFusion run_code api
def send_request(payload):
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Authorization": f"Bearer {SANDBOX_AUTH_KEY}" if SANDBOX_AUTH_KEY else "",
    }
    sandbox_api = os.getenv("SANDBOX_API", Sandbox_API_BASE)
    if sandbox_api.startswith("http://"):
        sandbox_api = sandbox_api.removeprefix("http://")
    elif sandbox_api.startswith("https://"):
        sandbox_api = sandbox_api.removeprefix("https://")

    conn = http.client.HTTPSConnection(sandbox_api)
    conn.request("POST", "/run_code", payload, headers)
    resData = conn.getresponse().read()
    response = resData.decode("utf-8")
    # check if the code run successful
    successStr = '"status":"Success"'
    index = response.find(successStr)
    if index == -1:
        result = {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "run_result": response,
                }
            ),
        }
        return result
    res = json.loads(response)  # 解析JSON响应
    if "files" in res:
        for filename, content in res["files"].items():
            print(f"Fetched file [{filename}]: {content}")  # 打印文件内容
    result = {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"run_result": res}),
    }
    return result


@mcp.tool(description="""run your code str in sandbox server with your provided language,
 support to set these languages: python、nodejs、go、bash、typescript、java、cpp、php、csharp、lua、R、 swift、scala、ruby""")
def run_code(
    codeStr: str,
    language: str,
    fetch_files: Optional[List[str]] = None,
):
    """Execute code with given parameters.
    Args:
        codeStr: Source code to execute
        language: Programming language
        fetch_files: List of files to fetch
    Returns:
        Execution result as string
    """
    # try:
    #     fetch_files = json.loads(fetch_files_str)
    #     files = json.loads(files_str)
    # except json.JSONDecodeError as e:
    #     return f"JSON decode error: {str(e)}"
    payload_dict = {
        "compile_timeout": 60,
        "run_timeout": 60,
        "code": codeStr,
        "language": language,
    }
    if fetch_files is not None:  # 更明确的None检查
        payload_dict["fetch_files"] = fetch_files
    logger.info(f"code = {codeStr}")
    logger.info(f"fetch_files = {fetch_files}")
    payload = json.dumps(payload_dict)
    return send_request(payload=payload)

def main():
    """Main entry point for the MCP server."""
    parser = argparse.ArgumentParser(description="Run the Code Sandbox MCP Server")
    parser.add_argument(
        "--transport",
        "-t",
        choices=["sse", "stdio"],
        default="stdio",
        help="Transport protocol to use (sse or stdio)",
    )
    args = parser.parse_args()
    try:
        mcp.run(transport=args.transport)
    except Exception as e:
        logger.error(f"Error starting Code Sandbox MCP Server: {str(e)}")
        raise


if __name__ == "__main__":
    main()
