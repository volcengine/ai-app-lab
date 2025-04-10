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
import os
from typing import Any
import httpx
import json
import http.client
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP(name="vefaas-sandbox", port=7003)

# Constants
Sandbox_API_BASE = (
    os.getenv("SANDBOX_FAAS_URL")  # 替换为用户沙盒服务地址
)


# send http reqeust to SandboxFusion run_code api
# https://bytedance.github.io/SandboxFusion/docs/api/run-code-run-code-post
def send_request(payload):
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
    }
    conn = http.client.HTTPSConnection(Sandbox_API_BASE)

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

    # extract code run results
    run_result = json.loads(response).get("run_result")
    stdout = run_result.get("stdout")
    stderr = run_result.get("stderr")

    message = ""
    if stdout:
        message = stdout
    elif stderr:
        message = stderr

    result = {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"run_result": message}),
    }
    return result


def run_code(codeStr, language):
    payload = json.dumps(
        {
            "compile_timeout": 60,
            "run_timeout": 60,
            "code": codeStr,
            "language": language,
            "files": {},
        }
    )
    return send_request(payload=payload)


@mcp.tool()
def run_bash(bashStr) -> str:
    """run a bash code"""
    return run_code(bashStr, "bash")


@mcp.tool()
def run_python(pyCode) -> str:
    """run a python code, if you need to save files, write them into /mnt/tos directory. remember to use print() to
    echo the results into stdout."""
    return run_code(pyCode, "python")


if __name__ == "__main__":
    # Initialize and run the server
    mcp.run(transport="sse")
