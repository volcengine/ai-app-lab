import { Trigger, Button } from '@arco-design/web-react';

import { ReactComponent as IconToDoList } from '@/demo/mcp/assets/icon_todo_list.svg';

import PlanningChartWithProvider from '../PlanningChart';
import { useChatInstance } from '../../hooks/useInstance';
import s from './index.module.less';
import { usePlanningChartVisibleStore } from '../../store/ChatConfigStore/usePlanningChartVisible';

export const PlanningChartButton = () => {
  const { chatList } = useChatInstance();
  const hasPlanningEvent = chatList.some(message => message.events?.some(event => event.type === 'planning'));
  const disabled = !hasPlanningEvent;

  const { visible, setVisible } = usePlanningChartVisibleStore();

  return (
    <Trigger
      popupVisible={visible}
      disabled={disabled}
      onVisibleChange={setVisible}
      popup={() => (
        <div className={s.popup}>
          <div className={s.cont}>
            <PlanningChartWithProvider />
          </div>
        </div>
      )}
      trigger={['click']}
      position="bl"
      clickToClose
    >
      <Button className="self-start !bg-[#fff]" disabled={disabled}>
        <div className={'flex items-center gap-1'}>
          <IconToDoList />
          <span>任务列表</span>
        </div>
      </Button>
    </Trigger>
  );
};
