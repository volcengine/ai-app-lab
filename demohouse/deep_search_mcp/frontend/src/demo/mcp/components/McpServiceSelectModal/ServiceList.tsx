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

import { useEffect, useMemo, useRef, useState } from 'react';

import cx from 'classnames';
import { Empty } from '@arco-design/web-react';

import { useToolTreeList } from '@/demo/mcp/store/ChatConfigStore/useChatConfigStore';
import { useMcpSelectModalStore } from '@/demo/mcp/store/ChatConfigStore/useMcpSelectModalStore';

import s from './index.module.less';

export const ServiceList = () => {
  const { toolTreeList, enableToolList } = useToolTreeList();

  const { setModalCurrentTool, modalCurrentTool, modalCurrentType, modalCurrentSearchStr } = useMcpSelectModalStore();

  // 添加一个标记来区分是否是点击触发
  const [isClickSelect, setIsClickSelect] = useState(false);
  // 为当前选中的item添加ref
  const currentItemRef = useRef<HTMLDivElement>(null);

  const filteredList = useMemo(() => {
    const filteredByType = toolTreeList.filter(i => {
      if (modalCurrentType === '全部') {
        return true;
      } else {
        return i.name === modalCurrentType;
      }
    });
    const filteredByStr = filteredByType.filter(i => i.children.some(i => i.name.includes(modalCurrentSearchStr)));
    return filteredByStr;
  }, [modalCurrentSearchStr, modalCurrentType, toolTreeList]);

  useEffect(() => {
    if (modalCurrentType === '全部') {
      return;
    }
    if (modalCurrentTool?.type !== modalCurrentType) {
      setModalCurrentTool(filteredList[0]?.children[0]);
    }
  }, [filteredList]);

  // 监听 modalCurrentTool 变化,处理滚动
  useEffect(() => {
    if (!modalCurrentTool || isClickSelect) {
      setIsClickSelect(false);
      return;
    }

    // 使用 requestAnimationFrame 确保 DOM 已更新
    requestAnimationFrame(() => {
      if (currentItemRef.current) {
        currentItemRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    });
  }, [modalCurrentTool]);

  return (
    <div className={s.serviceList}>
      {!filteredList.length && <Empty className={'h-full flex items-center'} />}
      {filteredList.map(item => (
        <div key={item.name} className={s.group}>
          <div className={s.groupName}>{item.name}</div>
          <div className={s.itemList}>
            {item.children.map(item => (
              <div
                key={item.name}
                ref={modalCurrentTool?.name === item.name ? currentItemRef : null}
                className={cx(s.item, modalCurrentTool?.name === item.name && '!bg-[#f5f5ff] !border-transparent')}
                onClick={() => {
                  setIsClickSelect(true); // 点击时设置标记
                  setModalCurrentTool(item);
                }}
              >
                <div className={'flex gap-2 justify-between'}>
                  <img src={item.icon} className={s.icon}></img>
                  <div className={s.name}>{item.name}</div>
                </div>
                <div className={s.status}>{enableToolList.find(i => i.name === item.name) ? '已开启' : '未开启'}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
