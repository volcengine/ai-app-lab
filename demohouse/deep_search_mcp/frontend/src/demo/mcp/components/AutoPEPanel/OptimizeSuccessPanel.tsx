// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useState } from 'react';

import { Input, Popover } from '@arco-design/web-react';
import type { GetRunAgentOnlineOptimizeStatusResult } from '@bam/autope/namespaces/optimization';

// import { useChatRequest } from '@/demo/mcp/hooks/useChatRequest';
import { AIButton } from '@/components/AIButton';
import { IconIconNewWindow } from '@/icon';
import globalVar from '@/platform/globalVar';
import { AutoPEService } from '@/platform/request/autope';
export interface IAutoPEPanelProps {
  sessionId: string;
  sessionQuery: string;
  agentProjectId: string;
  data?: GetRunAgentOnlineOptimizeStatusResult;
  handleRunAgentOnlineOptimize: () => Promise<void>;
  refetch: () => void;
}

const PromptData = [
  {
    name: '任务拆解 Prompt',
  },
  {
    name: '总结回复 Prompt',
  },
];

export const AutoPEOptimizeSuccessPanel = (props: IAutoPEPanelProps) => {
  const { data, agentProjectId, handleRunAgentOnlineOptimize, refetch } = props;
  const { PromptTemplateList = [] } = data || {};
  const [fallbackPromptLoading, setFallbackPromptLoading] = useState(false);
  const [optimizePromptLoading, setOptimizePromptLoading] = useState(false);

  const handleUpdatePrompt = () =>
    AutoPEService.UpdateAutoPEAgentPromptTemplate({
      AutoPEProjectId: agentProjectId,
      // StepIndex,
    }).then(() => setTimeout(refetch, 1000));
  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex-1 flex flex-col gap-[22px]">
        {PromptTemplateList?.map(({ PromptTemplate, StepIndex }) => (
          <div key={StepIndex} className="flex-1 flex flex-col gap-[11px]">
            <div className="flex items-center justify-between">
              <div className="text-color-2 text-body-3 font-semibold">
                {PromptData?.[StepIndex]?.name}
              </div>
              {/* <Button type="text" className="text-body-2 px-0" onClick={() => handleUpdatePrompt(StepIndex)}>
                恢复默认
              </Button> */}
            </div>
            <Input.TextArea
              value={PromptTemplate}
              className="flex-1"
              readOnly
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between w-full h-[72px] pt-5">
        <div
          className="flex items-center text-body-3 text-color-3 cursor-pointer"
          onClick={() => {
            window.open(
              `https://console.volcengine.com/${globalVar.ROOT_PATH}/autope/tasklist`,
              '_blank',
            );
          }}
        >
          <span>了解promptPilot</span>
          <IconIconNewWindow className="ml-1 text-body-1" />
        </div>
        <div className="flex items-center justify-end flex-1 gap-3">
          {/* <AIButton
            type="outline"
            onClick={() => {
              sessionQuery && sendUserMsg(sessionQuery);
            }}
          >
            DeepResearch重新回答
          </AIButton> */}
          <AIButton
            type="outline"
            loading={fallbackPromptLoading}
            onClick={() => {
              setFallbackPromptLoading(true);
              handleUpdatePrompt().finally(() => {
                setTimeout(() => setFallbackPromptLoading(false), 10000);
              });
            }}
          >
            恢复默认
          </AIButton>
          <Popover
            position="tr"
            content={
              <div className="text-body-1 text-color-2">
                已收集{' '}
                <span className="font-semibold">
                  {data?.AgentDataRecordTotal ?? 0}
                </span>{' '}
                条新的反馈数据，点击重新优化
              </div>
            }
          >
            <AIButton
              loading={optimizePromptLoading}
              type="primary"
              onClick={() => {
                setOptimizePromptLoading(true);
                handleRunAgentOnlineOptimize().finally(() => {
                  setTimeout(() => setOptimizePromptLoading(false), 10000);
                });
              }}
            >
              重新优化
            </AIButton>
          </Popover>
        </div>
      </div>
    </div>
  );
};
