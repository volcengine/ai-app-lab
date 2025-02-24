import { AgentContext, llmClient, Agent, AgentMeta, AgentLauncher, AgentInputMessage } from '@ai-app/agent';

export default class CopilotAgent extends Agent {
  aiMeta: AgentMeta = {
    id: 'pocket_pal',
  };

  override async invoke(
    context: AgentContext,
    message?: AgentInputMessage | undefined,
    needFinalAnswer?: boolean | undefined
  ): Promise<any> {
    console.log('CopilotAgent invoke message = ', message);
    return Promise.resolve();
  }
}
