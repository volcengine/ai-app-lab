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

from fastapi import FastAPI, HTTPException, Request, WebSocket


class TaskManager:
    def __init__(self):
        self.active_tasks = {}
        pass

    def add_task(self, task_id: str, task: dict):
        self.active_tasks[task_id] = task

    def update_task(self, task_id: str, task: dict):
        # TODO: kuoxin@ refine this logic with a task object
        self.active_tasks[task_id].update(task)

    def remove_task(self, task_id: str):
        if task_id in self.active_tasks:
            del self.active_tasks[task_id]

    def get_active_tasks(self) -> dict:
        # TODO: kuoxin@ refine this logic with a task object
        return self.active_tasks

    def get_num_of_tasks(self) -> dict:
        # TODO: kuoxin@ refine this logic with a task object
        return len(self.active_tasks)

    def get_task_by_id(self, task_id: str) -> dict:
        # TODO: kuoxin@ refine this logic with a task object
        return self.active_tasks[task_id]

    async def get_task_port(self, task_id: str, websocket: WebSocket | None = None) -> int | None:
        if not task_id:
            if websocket:
                await websocket.close(code=4000, reason="task_id is required")
                return None
            raise HTTPException(status_code=400, detail="task_id is required")

        if task_id not in self.active_tasks:
            if websocket:
                await websocket.close(code=4000, reason=f"Task ID {task_id} not found")
                return None
            raise HTTPException(
                status_code=404, detail=f"Task {task_id} not found")

        port = self.active_tasks[task_id].get('port')
        if not port:
            if websocket:
                await websocket.close(code=4000, reason=f"No port found for task ID {task_id}")
                return None
            raise HTTPException(
                status_code=500, detail=f"No port found for task {task_id}")

        return port
