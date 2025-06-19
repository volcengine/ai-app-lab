import React, { useMemo, useRef, useCallback, useState } from 'react';

import clsx from 'classnames';
import { isNumber } from 'lodash';
import { useQuery } from '@tanstack/react-query';
import { JobState } from '@bam/autope/namespaces/schema';
import { GetRunAgentOnlineOptimizeStatusResult } from '@bam/autope/namespaces/optimization';

import { AIButton } from '@/components/AIButton';
import { AutoPEService } from '@/platform/request/autope';
import { useAutoPEStore } from '@/demo/mcp/store/AutoPEStore';
import { useChatInstance } from '@/demo/mcp/hooks/useInstance';

import { PromptGenerate } from './svg/prompt_generate';
import { PromptGeneratePropgress } from './svg/progress';
import { PromptGenerateFailed } from './svg/running_failed';
import { AutoPEOptimizeSuccessPanel } from './OptimizeSuccessPanel';
import styles from './style.module.less';

const AutoPEBG =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/LM-STH-hahK/ljhwZthlaukjlkulzlp/ark/app/cards/mcp/autope-bg.png';

export enum ComposedJobStatus {
  NOTINIT = 0,
  CREATED = 1,
  OPTIMIZING = 3,
  OPTIMIZE_SUCCESS = 7,
  OPTIMIZE_FAILED = 17,
}
export interface IAutoPEPanelProps {
  sessionId: string;
  sessionQuery: string;
  agentProjectId: string;
  handleRunAgentOnlineOptimize: () => Promise<void>;
  refetch: () => void;
  data?: GetRunAgentOnlineOptimizeStatusResult;
}

const AutoPEInitPanel = (props: IAutoPEPanelProps) => {
  const { data, handleRunAgentOnlineOptimize } = props;
  const [loading, setLoading] = useState(false);
  const hasEnoughData = useMemo(() => {
    if (!data?.AgentDataRecordTotal) {
      return false;
    } // 兜底数据
    const delta = data.AgentDataRecordTotal - data.AgentDataRecordRequiredTotal;
    return delta >= 0;
  }, [data]);

  return (
    <div>
      <div className="flex items-center justify-between p-5 rounded-xl bg-[#F3F7FF]">
        <div className="flex flex-col gap-[3px]">
          <div className="text-body-3 text-color-2">已收集数据/目标收集数据</div>
          <div className="text-[36px] text-color-2">
            {data?.AgentDataRecordTotal ?? 0}/{data?.AgentDataRecordRequiredTotal ?? 0}
          </div>
        </div>
        {hasEnoughData ? (
          <AIButton
            loading={loading}
            type="primary"
            onClick={() => {
              setLoading(true);
              handleRunAgentOnlineOptimize().finally(() => {
                setTimeout(() => setLoading(false), 10000);
              });
            }}
          >
            立即开启
          </AIButton>
        ) : (
          <AIButton type="primary" disabled>
            待开启
          </AIButton>
        )}
      </div>
      {/* <div className="p-4 mt-[22px] rounded border border-[#DDE2E9]">
        <div className={clsx(styles.gradientext, 'font-medium text-[16px]')}>
          对模型回答进行给出评价或进行点赞、点踩。
        </div>
        <img src={AutoPEBG} className="mt-3 w-full rounded-lg border border-[#EAEDF1]" />
      </div> */}
    </div>
  );
};

const AutoPEOptimizingPanel = () => (
  <div className="w-full h-full flex items-center justify-center">
    <div className="flex flex-col items-center gap-5">
      <PromptGenerate />
      <PromptGeneratePropgress />
      <div className={clsx(styles.gradientext, 'text-body-3')}>系统 Prompt 正在优化中，预计需要10分钟，请稍后...</div>
    </div>
  </div>
);

const AutoPEOptimizeFailedPanel = (props: IAutoPEPanelProps) => {
  const { handleRunAgentOnlineOptimize } = props;
  const [loading, setLoading] = useState(false);
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <PromptGenerateFailed />
        <div className={clsx(styles.gradientext, 'text-body-3')}>服务异常或超时，你可以联系 Oncall 解决问题或重试</div>
        <AIButton
          loading={loading}
          onClick={() => {
            setLoading(true);
            handleRunAgentOnlineOptimize().finally(() => {
              setTimeout(() => setLoading(false), 10000);
            });
          }}
          type="primary"
          className="w-[138px] h-8 body-2"
        >
          重试
        </AIButton>
      </div>
    </div>
  );
};
const Status2Component = {
  [ComposedJobStatus.NOTINIT]: AutoPEInitPanel, // AutoPEInitPanel
  [ComposedJobStatus.OPTIMIZING]: AutoPEOptimizingPanel,
  [ComposedJobStatus.OPTIMIZE_SUCCESS]: AutoPEOptimizeSuccessPanel,
  [ComposedJobStatus.OPTIMIZE_FAILED]: AutoPEOptimizeSuccessPanel, // AutoPEOptimizeFailedPanel,
};

// 和后端约定，只处理SUMMARY的任务状态，也就是STEP=1的任务状态
const getComposedJobStatus = (data?: GetRunAgentOnlineOptimizeStatusResult) => {
  if (!data?.JobState?.length || data?.JobState?.every(status => status === null)) {
    return ComposedJobStatus.NOTINIT;
  }
  const summaryJobState = data?.JobState?.[1];
  if (!summaryJobState) {
    return ComposedJobStatus.NOTINIT;
  }
  // OPTIMIZING
  if (summaryJobState <= JobState.OPTIMIZING) {
    return ComposedJobStatus.OPTIMIZING;
  }
  // OPTIMIZE_SUCCESS
  if (summaryJobState === JobState.OPTIMIZE_SUCCESS) {
    return ComposedJobStatus.OPTIMIZE_SUCCESS;
  }
  // OPTIMIZE_CANCELLED、OPTIMIZE_CANCELLING、OPTIMIZE_FAILED
  return ComposedJobStatus.OPTIMIZE_FAILED;
};
const AutoPEPanel = () => {
  const { sessionId, sessionQuery } = useAutoPEStore();
  const { accountId, userId } = useChatInstance();
  const agentProjectId = `dr-${accountId}-${userId}`;

  const { data: AgentOnlineOptimizeResult, refetch } = useQuery({
    queryKey: ['GetRunAgentOnlineOptimizeResult', agentProjectId],
    queryFn: () =>
      AutoPEService.GetRunAgentOnlineOptimizeResult({
        // @ts-expect-error
        AutoPEProjectId: agentProjectId,
      }),
    enabled: true,
    refetchInterval: query => 10000,
    // if (getComposedJobStatus(query.state.data) !== ComposedJobStatus.OPTIMIZE_SUCCESS) {
    //   // 优化中10s轮询一次
    //   return 10000;
    // } else {
    //   return false;
    // }
  });

  const handleRunAgentOnlineOptimize = () =>
    AutoPEService.RunAgentOnlineOptimize({
      // @ts-expect-error
      AutoPEProjectId: agentProjectId,
    }).then(() => {
      // 强制跳转到优化页面
      setTimeout(refetch, 1000);
    });

  const composedStatus = getComposedJobStatus(AgentOnlineOptimizeResult);

  const Component = Status2Component[composedStatus];

  return (
    <div className="p-6 w-full h-full">
      <Component
        sessionId={sessionId}
        sessionQuery={sessionQuery}
        agentProjectId={agentProjectId}
        data={AgentOnlineOptimizeResult}
        handleRunAgentOnlineOptimize={handleRunAgentOnlineOptimize}
        refetch={refetch}
      />
    </div>
  );
};

export default AutoPEPanel;
