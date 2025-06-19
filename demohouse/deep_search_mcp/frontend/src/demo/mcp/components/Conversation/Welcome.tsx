import { useMemo } from 'react';

import cx from 'classnames';

import { PresetQuestionCard } from '@/demo/mcp/components/Conversation/components/PresetQuestionCard';
import { useChatInstance } from '@/demo/mcp/hooks/useInstance';
import {
  IconCurveRising,
  IconDocument,
  IconPinkStar,
  IconResearchLogo,
  IconStackedMoney,
} from '@/images/deepResearch';

import { MessageInput } from './components/MessageInput';
import { RoundSettingBtn } from './components/RoundSettingBtn';
import styles from './index.module.less';

const defaultIconList = [
  <IconStackedMoney key="IconStackedMoney" />,
  <IconCurveRising key="IconCurveRising" />,
  <IconDocument key="IconDocument" />,
];

const defaultQuestions = [
  {
    topic: '产品咨询',
    content:
      '请教我如何在火山方舟上开通 Seaweed 视频生成模型，并给出在 python IDE 中进行 API 调用的示例代码，最终生成分步骤的操作指南报告',
    bgImgUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/LM-STH-hahK/ljhwZthlaukjlkulzlp/ark/app/uitars-intro.png',
  },
  {
    topic: '购物决策',
    content:
      '为我推荐一款性价比较高的家庭用 SUV，预算为20万左右，主要用于上班通勤和偶尔周边城市自驾。请详细分析每款车型的优劣势，综合对比为我推荐最合适的车型。并使用 Pandas 等库将汽车的各项参数（如油耗、空间、动力等）通过图表可视化展示成一个美观的页面',
    bgImgUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/LM-STH-hahK/ljhwZthlaukjlkulzlp/ark/app/uitars-intro.png',
  },
  {
    topic: '学术研究',
    content:
      '解读这篇论文的重点https://arxiv.org/abs/1706.03762，并检索这个领域内的重要学者及相关文献，并整理为清晰易读的表格',
    bgImgUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/LM-STH-hahK/ljhwZthlaukjlkulzlp/ark/app/uitars-intro.png',
  },
];

interface IProps {
  handleSend: (message: string) => void;
}

export const Welcome = (props: IProps) => {
  const { handleSend } = props;
  const { config, isChatting, amountConfig } = useChatInstance();
  // const questions = defaultQuestions;

  const questions: { topic: string; content: string }[] = useMemo(() => {
    if (config?.customConfig) {
      try {
        const customConfig = JSON.parse(config.customConfig);
        if (customConfig?.openingRemarks) {
          return customConfig.openingRemarks;
        }
      } catch (error) {
        console.error('customConfig parse error', error);
        return defaultQuestions;
      }
    }
    return defaultQuestions;
  }, [config]);

  return (
    <div className={styles.welcome}>
      <div className={styles.title}>
        <IconResearchLogo className="size-[35px] mr-3" />
        <span className={styles.name}>Hi，</span>
        <span className="text-nowrap">我是</span>
        <span className={styles.name}>DeepSearch</span>
        <span className="text-nowrap">，你想研究点什么？</span>
      </div>
      <div>
        <MessageInput
          activeSendBtn={true}
          autoFocus
          placeholder={'请输入你想研究的问题'}
          canSendMessage={!isChatting && amountConfig.usage >= 0}
          sendMessage={handleSend}
          // actions={[<PdfUploadAction key={'doc'} />]}
          extra={() => (
            <>
              <RoundSettingBtn />
            </>
          )}
          expandDisabled={false}
          isExpandAlways
        />
      </div>
      <section className={styles.recommend}>
        <div className="flex justify-center mb-4">
          <div className="flex items-center text-center gap-2">
            <IconPinkStar />
            <span className={styles.title}>问题示例</span>
            <IconPinkStar />
          </div>
        </div>
        <div className={styles.questionsBox}>
          {questions.map((q, i) => (
            <PresetQuestionCard
              {...q}
              key={i}
              onClick={content => {
                handleSend(content);
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
};
