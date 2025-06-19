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

import { Button, Popover, Slider, Trigger } from '@arco-design/web-react';
import { IconQuestionCircle } from '@arco-design/web-react/icon';
import clsx from 'classnames';

import { BOT_CHAT_CONFIG_ARR, DebugParamName } from '@/demo/mcp/const';
import { useChatInstance } from '@/demo/mcp/hooks/useInstance';

import styles from './index.module.less';

export const DebugParamsBtn = () => {
  const { chatConfig, updateChatConfig } = useChatInstance();
  return (
    <Trigger
      position={'br'}
      popupAlign={{
        bottom: 10,
      }}
      trigger="click"
      updateOnScroll
      popup={() => (
        <div className={clsx('w-[360px] p-4', styles.box)}>
          {BOT_CHAT_CONFIG_ARR.map(item => (
            <div key={item.Name} className={styles.text}>
              <div className={'flex gap-1 items-center w-full'}>
                <div>{item.Name}</div>
                {item.Name === DebugParamName.max_tokens && (
                  <div>
                    <Popover
                      content={item.getDescription(
                        0,
                        chatConfig.max_tokens_limit,
                      )}
                    >
                      <IconQuestionCircle className={'text-[#737A87]'} />
                    </Popover>
                  </div>
                )}
                {[
                  DebugParamName.frequency_penalty,
                  DebugParamName.temperature,
                  DebugParamName.top_p,
                ].includes(item.Name) && (
                  <Popover content={item.getDescription()}>
                    <IconQuestionCircle className={'text-[#737A87]'} />
                  </Popover>
                )}
              </div>
              <div className={'flex gap-5 items-center'}>
                {item.Name === DebugParamName.max_tokens && (
                  <Slider
                    step={item.Type === 'int' ? 1 : 0.1}
                    min={item.Min}
                    max={Math.floor(chatConfig.max_tokens_limit / 1024)}
                    value={Math.floor(chatConfig.max_tokens / 1024)}
                    onChange={v => {
                      updateChatConfig({ max_tokens: (v as number) * 1024 });
                    }}
                    showInput={{
                      size: 'small',
                      className: '!w-[80px] !h-[28px]',
                      suffix: item.Name === 'max_tokens' ? 'k' : null,
                    }}
                  />
                )}
                {[
                  DebugParamName.frequency_penalty,
                  DebugParamName.temperature,
                  DebugParamName.top_p,
                ].includes(item.Name) && (
                  <Slider
                    step={item.Type === 'int' ? 1 : 0.1}
                    min={item.Min}
                    max={item?.Max}
                    value={
                      chatConfig[item.Key as keyof typeof chatConfig] as number
                    }
                    onChange={v => {
                      updateChatConfig({ [item.Key]: v });
                    }}
                    showInput={{
                      size: 'small',
                      className: '!w-[80px] !h-[28px]',
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    >
      <Button
        className={
          'leading-[32px] !bg-white py-0 px-4 border border-solid border-[#dde2e9] rounded-[4px] flex items-center'
        }
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="14"
            viewBox="0 0 12 14"
            fill="none"
          >
            <path
              d="M5.33301 9.33401C5.33301 10.39 4.63101 11.284 3.66701 11.57V13.24C3.66701 13.388 3.65101 13.442 3.62201 13.496C3.59374 13.5498 3.54981 13.5937 3.49601 13.622C3.44201 13.652 3.38801 13.667 3.23901 13.667H2.76101C2.61201 13.667 2.55801 13.651 2.50401 13.622C2.45022 13.5937 2.40628 13.5498 2.37801 13.496C2.34801 13.442 2.33301 13.388 2.33301 13.239V11.57C1.8515 11.4263 1.42923 11.131 1.12899 10.728C0.828743 10.3251 0.666565 9.83601 0.666565 9.33351C0.666565 8.831 0.828743 8.34191 1.12899 7.93897C1.42923 7.53602 1.8515 7.24073 2.33301 7.09701V0.760008C2.33301 0.611008 2.34901 0.557008 2.37801 0.503008C2.40628 0.449216 2.45022 0.405277 2.50401 0.377008C2.55801 0.348008 2.61201 0.333008 2.76101 0.333008H3.23901C3.38801 0.333008 3.44201 0.348008 3.49601 0.377008C3.55068 0.407008 3.59268 0.449008 3.62201 0.503008C3.65201 0.557008 3.66701 0.611008 3.66701 0.760008V7.09601C4.14903 7.23931 4.57174 7.53471 4.87202 7.93808C5.17229 8.34145 5.33401 8.83114 5.33301 9.33401ZM4.00001 9.33401C4.00001 9.06879 3.89466 8.81444 3.70712 8.6269C3.51958 8.43936 3.26523 8.33401 3.00001 8.33401C2.7348 8.33401 2.48044 8.43936 2.29291 8.6269C2.10537 8.81444 2.00001 9.06879 2.00001 9.33401C2.00001 9.59922 2.10537 9.85358 2.29291 10.0411C2.48044 10.2287 2.7348 10.334 3.00001 10.334C3.26523 10.334 3.51958 10.2287 3.70712 10.0411C3.89466 9.85358 4.00001 9.59922 4.00001 9.33401ZM12 4.66701C12 5.72401 11.297 6.61701 10.333 6.90401V13.24C10.333 13.388 10.318 13.442 10.289 13.496C10.2607 13.5498 10.2168 13.5937 10.163 13.622C10.108 13.652 10.055 13.667 9.90601 13.667H9.42701C9.27901 13.667 9.22501 13.651 9.17101 13.622C9.11685 13.5939 9.07255 13.5499 9.04401 13.496C9.01501 13.442 9.00001 13.388 9.00001 13.239V6.90301C8.5185 6.75928 8.09623 6.464 7.79599 6.06105C7.49574 5.6581 7.33356 5.16901 7.33356 4.66651C7.33356 4.164 7.49574 3.67491 7.79599 3.27197C8.09623 2.86902 8.5185 2.57373 9.00001 2.43001V0.760008C9.00001 0.612008 9.01501 0.558008 9.04401 0.504008C9.07255 0.450069 9.11685 0.406114 9.17101 0.378008C9.22501 0.349008 9.27901 0.334008 9.42701 0.334008H9.90601C10.055 0.334008 10.108 0.349008 10.163 0.378008C10.2177 0.408008 10.2597 0.450008 10.289 0.504008C10.318 0.558008 10.333 0.612008 10.333 0.761008V2.43101C10.8149 2.57404 11.2376 2.86906 11.538 3.27204C11.8385 3.67502 12.0005 4.16436 12 4.66701ZM10.667 4.66701C10.667 4.40179 10.5617 4.14744 10.3741 3.9599C10.1866 3.77236 9.93223 3.66701 9.66701 3.66701C9.4018 3.66701 9.14744 3.77236 8.95991 3.9599C8.77237 4.14744 8.66701 4.40179 8.66701 4.66701C8.66701 4.93222 8.77237 5.18658 8.95991 5.37411C9.14744 5.56165 9.4018 5.66701 9.66701 5.66701C9.93223 5.66701 10.1866 5.56165 10.3741 5.37411C10.5617 5.18658 10.667 4.93222 10.667 4.66701Z"
              fill="#42464E"
            />
          </svg>
        }
      >
        <span className="ml-2">{'参数设置'}</span>
      </Button>
    </Trigger>
  );
};
