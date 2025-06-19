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

import React, { useCallback, useState, useContext, useMemo } from 'react';

import { Button, Input, Message, Popover } from '@arco-design/web-react';
import {
  IconThumbDown,
  IconThumbDownFill,
  IconThumbUp,
  IconThumbUpFill,
} from '@arco-design/web-react/icon';
import { IconRight } from '@arco-design/web-react/icon';
import { ContentType, VoteType } from '@bam/autope/namespaces/schema';
import { useQuery } from '@tanstack/react-query';
import { useUpdateEffect } from 'ahooks';
import clsx from 'classnames';

import { ActionIcon } from '@/components/ActionIcon';
import { useChatInstance } from '@/demo/mcp/hooks/useInstance';
import { useAutoPEStore } from '@/demo/mcp/store/AutoPEStore';
import { BotMessageContext } from '@/demo/mcp/store/BotMessageContext/context';
import { useChatConfigStore } from '@/demo/mcp/store/ChatConfigStore/useChatConfigStore';
import { AutoPEService } from '@/platform/request/autope';

import { IconAiLine } from '@/icon';
import styles from './style.module.less';

export const FeedbackPopoverBody = (props: {
  setFeedback: (content: string, callback: () => void) => void;
}) => {
  const { setFeedback } = props;
  const [content, setContent] = useState('');
  return (
    <div className={styles.editComment}>
      <Input.TextArea
        placeholder={'添加反馈评论，将应用到Prompt优化'}
        autoSize={{ minRows: 2, maxRows: 5 }}
        value={content}
        onChange={setContent}
      />
      <Button
        size="small"
        icon={<IconAiLine color="white" />}
        type="primary"
        shape="round"
        onClick={() => {
          setFeedback(content, () => setContent(''));
          Message.success('反馈成功');
        }}
        disabled={!content}
      >
        {'添加反馈评论'}
      </Button>
    </div>
  );
};

interface IFeedbackProps {
  className?: string;
}

export const Feedback = (props: IFeedbackProps) => {
  const { className } = props;
  const { sessionId, sessionQuery } = useContext(BotMessageContext);
  const { personalized } = useChatConfigStore();
  const { accountId, userId } = useChatInstance();
  const agentProjectId = `dr-${accountId}-${userId}`;
  const [voteType, setVoteType] = useState<VoteType>(3); // 1: 满意，2: 不满意 3: 无
  const { autopeDrawerVisible, setAutoPEDrawerVisible } = useAutoPEStore();

  // 交互状态的数据
  const [upVoteVisible, setUpVoteVisible] = useState(false);
  const [downVoteVisible, setDownVoteVisible] = useState(false);

  const handleVote = useCallback(
    (voteRegion: VoteType) => {
      switch (voteType) {
        case VoteType.UP:
          setVoteType(
            voteRegion === VoteType.UP ? VoteType.NONE : VoteType.DOWN,
          );
          break;
        case VoteType.DOWN:
          setVoteType(
            voteRegion === VoteType.DOWN ? VoteType.NONE : VoteType.UP,
          );
          break;
        case VoteType.NONE:
          setVoteType(voteRegion);
          break;
        default:
          break;
      }
    },
    [voteType],
  );

  const { data: AgentOnlineOptimizeResult, refetch } = useQuery({
    queryKey: ['GetRunAgentOnlineOptimizeResult', agentProjectId],
    queryFn: () =>
      AutoPEService.GetRunAgentOnlineOptimizeResult({
        // @ts-expect-error
        AutoPEProjectId: agentProjectId,
      }),
    enabled: true,
  });

  const dataflow = useCallback(
    (sessionId: string, voteType: VoteType, feedback: string) =>
      AutoPEService.CreateAutoPEAgentDataRecord({
        // // @ts-expect-error
        // AutoPEProjectId: agentProjectId, // 创建通过sessionId关联，不需要projectId
        SessionId: sessionId,
        Feedback: {
          Type: ContentType.WORKFLOW, // hard code 5，标识是来自agent workflow的反馈
          Feedback: feedback,
          VoteType: voteType,
        },
      }).then(() => setTimeout(refetch, 500)),
    [],
  );

  useUpdateEffect(() => {
    dataflow(sessionId, voteType, '');
  }, [voteType]);

  const [hasEnoughData, delta] = useMemo(() => {
    if (!AgentOnlineOptimizeResult?.AgentDataRecordRequiredTotal) {
      return [false, 3];
    } // 兜底数据
    const delta =
      AgentOnlineOptimizeResult.AgentDataRecordTotal -
      AgentOnlineOptimizeResult.AgentDataRecordRequiredTotal;
    return [delta >= 0, -1 * delta];
  }, [AgentOnlineOptimizeResult]);

  if (!personalized) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <div className={clsx(styles.operation, className)}>
        <Popover
          trigger={'click'}
          className={styles.feedbackContainer}
          popupVisible={upVoteVisible}
          onVisibleChange={visible => {
            setUpVoteVisible(visible);
          }}
          disabled={voteType === VoteType.UP}
          content={
            <FeedbackPopoverBody
              setFeedback={async (content, callback) => {
                await dataflow(sessionId, VoteType.UP, content);
                callback();
              }}
            />
          }
        >
          <ActionIcon tips={'满意'} onClick={() => handleVote(VoteType.UP)}>
            {voteType === VoteType.UP ? <IconThumbUpFill /> : <IconThumbUp />}
          </ActionIcon>
        </Popover>
        <Popover
          trigger={'click'}
          className={styles.feedbackContainer}
          popupVisible={downVoteVisible}
          onVisibleChange={visible => {
            setDownVoteVisible(visible);
          }}
          disabled={voteType === VoteType.DOWN}
          content={
            <FeedbackPopoverBody
              setFeedback={async (content, callback) => {
                await dataflow(sessionId, VoteType.DOWN, content);
                callback();
              }}
            />
          }
        >
          <ActionIcon tips={'不满意'} onClick={() => handleVote(VoteType.DOWN)}>
            {voteType === VoteType.DOWN ? (
              <IconThumbDownFill />
            ) : (
              <IconThumbDown />
            )}
          </ActionIcon>
        </Popover>
      </div>
      <div
        className="flex items-center cursor-pointer"
        onClick={() =>
          setAutoPEDrawerVisible(!autopeDrawerVisible, sessionId, sessionQuery)
        }
      >
        {hasEnoughData ? (
          <div className="flex items-center cursor-pointer gap-1 flex-wrap">
            <span className="text-color-3 text-body-1">已有足量反馈</span>
            <span className="text-[#1664FF] text-body-1">
              去开启优化{' '}
              <IconRight className="text-color-3 text-[16px] align-[-4px]" />
            </span>
          </div>
        ) : (
          <span className="text-color-3 text-body-1">
            再反馈 {delta} 次，即可开启系统Prompt优化{' '}
            <IconRight className="text-color-3 text-[16px] align-[-4px]" />
          </span>
        )}
      </div>
    </div>
  );
};
