from pydantic import BaseModel, Field

from models.planning import Planning, PlanningItem


class PlanningHolder(BaseModel):
    planning: Planning = Field(default_factory=Planning)

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def add_task(self, task_description: str, worker_name: str) -> str:
        """当你要向计划中添加一个任务的时候，调用此函数

            Args:
                task_description(str): 任务描述
                worker_name(str): 该任务要分配给哪个团队成员执行
            Returns:
                None
        """
        next_id = len(self.planning.items) + 1
        self.planning.items.append(PlanningItem(
            id=str(next_id),
            description=task_description,
            assign_agent=worker_name,
        ))
        return "task saved."

    async def update_task(self, task_id: str | int, new_description: str, worker_name: str) -> str:
        """当你要调整计划中的一个任务时，调用此函数

            Args:
                task_id(str): 要调整的任务id
                new_description(str): 新的任务描述
                worker_name(str): 该任务要分配给哪个团队成员执行
            Returns:
                None
        """
        task = self.planning.get_item(str(task_id))
        if task:
            if task.done:
                return 'this task is done, could not be modified any more.'
            if task.result_summary:
                # archive
                task.history.append(task.result_summary)
                task.result_summary = ""
            task.description = new_description
            task.assign_agent = worker_name
            self.planning.update_item(task_id, task)

        return "task updated."

    async def mark_task_done(self, task_id: str | int) -> str:
        """当你要标记计划中的一个任务为已完成时，调用此函数

            Args:
                task_id(str): 要标记为完成的任务id
            Returns:
                None
        """
        task = self.planning.get_item(str(task_id))
        if task:
            if not task.result_summary:
                return "because there is no result for this task now, we could not mark it done."
            task.done = True
            self.planning.update_item(task_id, task)

        return "task done."
