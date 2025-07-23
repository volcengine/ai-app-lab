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
