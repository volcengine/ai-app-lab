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

from typing import override

import uvicorn
from google.adk.agents.base_agent import BaseAgent
from google.adk.artifacts.in_memory_artifact_service import (
    InMemoryArtifactService,
)
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.cli.adk_web_server import AdkWebServer
from google.adk.cli.utils.base_agent_loader import BaseAgentLoader
from google.adk.evaluation.local_eval_set_results_manager import (
    LocalEvalSetResultsManager,
)
from google.adk.evaluation.local_eval_sets_manager import LocalEvalSetsManager
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.sessions.base_session_service import BaseSessionService
from veadk import Agent
from veadk.memory.short_term_memory import ShortTermMemory


class AgentKitAgentLoader(BaseAgentLoader):
    def __init__(self, agent: BaseAgent) -> None:
        super().__init__()

        self.agent = agent

    @override
    def load_agent(self, agent_name: str) -> BaseAgent:
        return self.agent

    @override
    def list_agents(self) -> list[str]:
        return [self.agent.name]


class AgentkitAgentServerApp:
    def __init__(
        self,
        agent: BaseAgent,
        short_term_memory: BaseSessionService | ShortTermMemory,
    ) -> None:
        super().__init__()

        _artifact_service = InMemoryArtifactService()
        _credential_service = InMemoryCredentialService()

        _eval_sets_manager = LocalEvalSetsManager(agents_dir=".")
        _eval_set_results_manager = LocalEvalSetResultsManager(agents_dir=".")

        self.server = AdkWebServer(
            agent_loader=AgentKitAgentLoader(agent),
            session_service=short_term_memory
            if isinstance(short_term_memory, BaseSessionService)
            else short_term_memory.session_service,
            memory_service=agent.long_term_memory
            if isinstance(agent, Agent) and agent.long_term_memory
            else InMemoryMemoryService(),
            artifact_service=_artifact_service,
            credential_service=_credential_service,
            eval_sets_manager=_eval_sets_manager,
            eval_set_results_manager=_eval_set_results_manager,
            agents_dir=".",
        )

        self.app = self.server.get_fast_api_app()

    def run(self, host: str, port: int = 8000) -> None:
        """Run the app with Uvicorn server."""
        uvicorn.run(self.app, host=host, port=port)
