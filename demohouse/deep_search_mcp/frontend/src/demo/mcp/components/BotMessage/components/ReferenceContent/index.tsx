import cx from 'classnames';

import type { Message } from '@/demo/mcp/types/message';

import { IconIconNewWindow } from '@/icon';
import Collapse from '../../../Collapse';
import { AnimatedSubtitle } from '../AnimatedSubtitle';
import s from './index.module.less';
export const ReferenceContent = ({ message }: { message: Message }) => (
  <div className="my-[15px]">
    <Collapse
      headerClassName="rounded-[6px] !w-fit bg-[#F6F8FA] px-2 py-1"
      title={
        <AnimatedSubtitle icon={null} isLoading={false} text={'来源引用'} />
      }
    >
      <div className="flex flex-col gap-[12px]">
        {message.references?.map((r, idx) => (
          <div
            className={cx(s.reference, r?.url && `cursor-pointer`)}
            key={idx}
            onClick={() => r?.url && window.open(r.url, '_blank')}
          >
            <div>
              {`${idx + 1}. `}
              {r?.doc_name || `${r?.title} | ${r?.site_name}`}
              <IconIconNewWindow className="ml-[4px] opacity-70" />
            </div>
          </div>
        ))}
      </div>
    </Collapse>
  </div>
);
