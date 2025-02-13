from local_bash_executor import LocalBashExecutor
from mcp.server.fastmcp import FastMCP


mcp = FastMCP("computer use")

bash_executor = LocalBashExecutor()


@mcp.tool()
async def run_command(command: str, work_dir: str = None) -> str:
    """执行 bash 命令

    Args:
        command: bash 命令
        work_dir: 选填，bash 命令运行的工作目录
    """
    console_output = await bash_executor.run_command(command, work_dir)
    return console_output.text


@mcp.tool()
async def create_file(file_name: str, content: str) -> str:
    """这个工具可以帮你创建文件, 如果该文件已经存在，则会覆盖之前的文件内容，如果文件不存在，则会自动创建这个文件

    Args:
        file_name: 文件名称，需包含文件名和相对路径名。示例：folder/text.txt
        content: 文件内容
    """
    console_output =  await bash_executor.create_file(file_name, content)
    return console_output.text


if __name__ == "__main__":
    # Initialize and run the server
    mcp.run(transport="sse")
