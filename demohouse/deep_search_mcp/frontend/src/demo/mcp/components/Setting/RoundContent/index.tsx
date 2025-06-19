import { InputNumber, Slider, Switch, Tooltip } from '@arco-design/web-react';
import { IconQuestionCircle } from '@arco-design/web-react/icon';

import DeepResearchPoster from '@/demo/mcp/assets/DeepResearchPoster.png';
import { useChatInstance } from '@/demo/mcp/hooks/useInstance';
import { useChatConfigStore } from '@/demo/mcp/store/ChatConfigStore/useChatConfigStore';
import { Host } from '@/demo/mcp/types';

import s from './index.module.less';

export function RoundContent() {
  const { host } = useChatInstance();
  const {
    maxPlanningRounds,
    setMaxPlanningRounds,
    personalized,
    setPersonalized,
  } = useChatConfigStore();

  return (
    <div className={s.drawer}>
      <main className={s.main}>
        <div className={s.poster}>
          <div className={s.left}>
            <div className={s.t}>DeepSearch 问题拆解</div>
            <div className={s.d}>
              模拟人类的思维模式，根据问题的复杂程度，对问题进行系统拆解和总结
            </div>
          </div>
          <img src={DeepResearchPoster} className={s.img} />
        </div>
        <div className={s.sliderContainer}>
          <div className={s.title}>
            <span>问题拆解最大层数</span>
            <Tooltip content="当前问题最多可以进行多少轮次问题拆解，影响回答速度与回答丰富度。">
              <IconQuestionCircle className={s.iconQuestion} />
            </Tooltip>
          </div>
          <div className={s.sliderBox}>
            <Slider
              className={s.slider}
              value={maxPlanningRounds}
              min={1}
              max={10}
              onChange={val => setMaxPlanningRounds(val as number)}
            />
            <InputNumber
              className={s.inputNumber}
              size="small"
              min={1}
              max={10}
              precision={0}
              value={maxPlanningRounds}
              onChange={setMaxPlanningRounds}
            />
          </div>
        </div>
        {host === Host.AIBOTSQUARE && (
          <div className={s.itemCustom}>
            <div className={'flex justify-between w-full'}>
              <div className={s.title}>
                <span>个性化</span>
                <Tooltip content="个性化">
                  <IconQuestionCircle className={s.iconQuestion} />
                </Tooltip>
              </div>
              <Switch
                checked={personalized}
                onChange={v => {
                  setPersonalized(v);
                }}
              />
            </div>
            <div className={s.d}>
              开启后，授权存储广场上的DeepSearch对话数据到PromptPilot调优数据集中，并自动使用PromptPilot进行内部Prompt个性化优化
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
