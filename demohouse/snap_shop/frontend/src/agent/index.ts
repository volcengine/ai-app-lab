import { Agent, AgentContext, AgentInputMessage, AgentMeta } from '@ai-app/agent';

export default class MyAppletAgent extends Agent {
  aiMeta: AgentMeta = {
    id: 'shopping-demo'
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
