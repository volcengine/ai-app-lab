from typing import Optional
from llm_sandbox.base import ConsoleOutput
from llm_sandbox.docker import SandboxDockerSession
from llm_sandbox import SandboxSession
import tempfile

from config import AI_WORKSPACE


class LocalBashExecutor:
    def __init__(self):
        self.session: Optional[SandboxDockerSession] = None
        self.work_dir = "/ai_workspace"
        self.mount_folder = AI_WORKSPACE

    async def ensure_init(self):
        if self.session is None:
            self.session = SandboxSession(
                image="local_ci:latest",
                keep_template=True,
                lang="python",
                mounts=[
                    {
                        "target": "/ai_workspace",  # Path inside the container
                        "source": self.mount_folder,  # Path on the host
                        "type": "bind",  # Use bind mount
                    }
                ],
                verbose=True,
            )
            self.session.open()

    async def run_command(self, command, work_dir=None) -> ConsoleOutput:
        # return ConsoleOutput("Not implemented")
        await self.ensure_init()
        resolved_work_dir = self.work_dir
        if work_dir is not None:
            resolved_work_dir = resolved_work_dir + "/" + work_dir
        return self.session.execute_command(command, resolved_work_dir)

    async def create_file(self, file_name, content) -> ConsoleOutput:
        await self.ensure_init()
        with tempfile.NamedTemporaryFile("w") as tmp:
            tmp.write(content)
            tmp.flush()
            self.session.copy_to_runtime(tmp.name, self.work_dir + "/" + file_name)
            tmp_file_name = tmp.name.split("/")[-1]
            rename = self.session.execute_command(f"mv {tmp_file_name} {file_name}", self.work_dir)
            existing_files = self.session.execute_command("ls", self.work_dir)
            return ConsoleOutput(
                f"File successfully created. Now we have the following files:\n{existing_files.text}"
            )

    def close(self):
        if self.session:
            self.session.close()


if __name__ == "__main__":
    import  asyncio
    executor = LocalBashExecutor()
    asyncio.run(executor.create_file("aa.py", ""))