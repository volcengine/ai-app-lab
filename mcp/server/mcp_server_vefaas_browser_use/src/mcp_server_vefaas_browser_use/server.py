from __future__ import print_function
from mcp.server.fastmcp import FastMCP
import argparse
import os
import logging
import requests

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

mcp = FastMCP("VeFaaS Browser Use", port=int(os.getenv("PORT", "8000")))

SESSION_SAVE_PATH = os.environ.get('SESSION_SAVE_PATH') or '/tmp/deep_research_session/'

BROWSER_USE_AUTH_KEY = os.environ.get('BROWSER_USE_AUTH_KEY') or ""

HEADERS = {
        "X-Faas-Event-Type": "http",
        "Content-Type": "application/json",
        "x-faas-instance-name": "",
        "Authorization": f"Bearer {BROWSER_USE_AUTH_KEY}" if BROWSER_USE_AUTH_KEY else "",
    }

@mcp.tool(description="""Creates a browser use task which can automatically browse the web.
Use this when you need to create a browser use task with specific messages.
The endpoint is read from the environment variable BROWSER_USE_ENDPOINT.
After this tool is called, automatically call tool get_browser_use_task_result to get the result.
""")
def create_browser_use_task(task: str):
    """
    Args:
        task (str): The task description for the browser to execute. For example: "check the weather in beijing."
                The task should be a clear instruction of what you want the browser to do.

    Returns:
        str: The task ID that can be used to retrieve results later.
    """
    # check required environment variables and parameters
    endpoint = os.getenv("BROWSER_USE_ENDPOINT")
    logger.info(f"endpoint: {endpoint}")

    if not endpoint:
        raise ValueError("BROWSER_USE_ENDPOINT is not set")
    
    if not task:
        raise ValueError("Task are required")
    
    if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
        endpoint = f"http://{endpoint}"

    url = f"{endpoint}/tasks"
        
    payload = {
        "messages": [
            {
                "role": "user",
                "content": task
            }
        ]
    }
    
    try:
        # 1. create a new task
        response = requests.post(url, headers=HEADERS, json=payload)

        response.raise_for_status()
        
        response_json = response.json() if response.content else None
        
        task_id = response_json.get("task_id") if response_json else None
        pod_name = response.headers.get("x-faas-instance-name")

        print(f"Task ID: {task_id}")

        logger.info(f"task id: {task_id}, pod_name: {pod_name}")

        return {
            "task_id": task_id,
            "pod_name": pod_name
        }
        
    except requests.exceptions.RequestException as e:
        error_message = f"Error in browser use task: {str(e)}"
        raise ValueError(error_message)

@mcp.tool(description="""Retrieves the result of a browser use task.
The endpoint is read from the environment variable BROWSER_USE_ENDPOINT.
""")
def get_browser_use_task_result(task_id: str):
    """
    Args:
        task_id (str): The ID of the browser use task to retrieve results for. 
                    This is the ID returned by create_browser_use_task.

    Returns:
        str: The final result from the browser task, including any choices or completion data.
    """
    # check required environment variables and parameters
    endpoint = os.getenv("BROWSER_USE_ENDPOINT")

    if not endpoint:
        raise ValueError("BROWSER_USE_ENDPOINT is not set")

    if not task_id:
        raise ValueError("Task ID is required")
    
    if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
        endpoint = f"http://{endpoint}"

    logger.info("endpoint: ", endpoint)

    try: 
        
        # stream the response
        # url = f"{endpoint}/tasks/{task_id}/stream"
        # response = requests.get(url, headers=HEADERS, stream=True)
        #
        # response.raise_for_status()
        
        final_content = None

        # for line in response.iter_lines(decode_unicode=True):
        #     if line:
        #         if "choices" in line:
        #             return line
        with open(f"{SESSION_SAVE_PATH}/{task_id}.txt", mode="r") as result_file:
            return result_file.read()
        
    except requests.exceptions.RequestException as e:
        error_message = f"Error in browser use task: {str(e)}"
        raise ValueError(error_message)
    except Exception as e:
        error_message = f"Cannot get result from tools"
        raise ValueError(error_message)


def main():
    logger.info("Starting veFaaS browser use MCP Server")
    parser = argparse.ArgumentParser(description="Run the veFaaS browser use MCP Server")
    parser.add_argument(
        "--transport",
        "-t",
        choices=["sse", "stdio"],
        default="stdio",
        help="Transport protocol to use (sse or stdio)",
    )
    args = parser.parse_args()
    
    mcp.run(transport=args.transport)

if __name__ == "__main__":
    main()
