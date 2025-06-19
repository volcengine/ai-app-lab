import { IconLeft, IconRight } from '@arco-design/web-react/icon';

import { ActionIcon } from '../../ActionIcon';

interface Props {
  current: number;
  total: number;
  updateCurrent?: (val: number) => void;
}

export const MessageBranchChecker = ({
  current,
  total,
  updateCurrent,
}: Props) =>
  total > 1 ? (
    <div className="flex items-center">
      <ActionIcon
        tips={'上一条'}
        disabled={current === 0}
        onClick={() => {
          updateCurrent?.(current - 1);
        }}
      >
        <IconLeft className="hover:bg-[##E2EAF9] rounded-[4px]" />
      </ActionIcon>
      <div className="text-[12px]">{`${current + 1} / ${total}`}</div>
      <ActionIcon
        tips={'下一条'}
        disabled={current === total - 1}
        onClick={() => {
          updateCurrent?.(current + 1);
        }}
      >
        <IconRight className="hover:bg-[##E2EAF9] rounded-[4px]" />
      </ActionIcon>
    </div>
  ) : null;
