/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { IVsStoryBookMessageCardProps } from "./types";
import { ReactComponent as IconArrowRight } from "./imgs/arrow-right.svg";
import { VsStoryBookPureCoverPage } from "..";
import { useEffect } from "react";
import { Button } from "@arco-design/web-react";
import "./index.scss";

/**
 * 流式展示消息区域渲染的 storybook 卡片组件
 * */
export const VsStoryBookMessageCard = ({
  cover,
  title,
  content,
  description,
  onViewClick,
  onMount,
  viewText = "查看",
}: IVsStoryBookMessageCardProps) => {
  useEffect(() => {
    onMount?.();
  }, []);
  return (
    <div className="pl-[18px] pb-[13px] pt-[22px] relative">
      <div className="vs-storybook-message-card cursor-pointer group">
        <div
          className="vs-storybook-message-card__main flex flex-col justify-between gap-[15px] border-solid border-[#d7daea] border-[1px] w-full min-h-[144px] rounded-[12px] pt-[16px] pb-[19px] pr-[28px] pl-[143px] transition-shadow transition-bg group-hover:shadow-[0px_15px_35px_-2px_#0000000d,0px_5px_15px_0px_#0000000d] group-hover:bg-[#fafbfd] duration-300"
          onClick={() => {
            onViewClick?.();
          }}
        >
          {/* 右侧内容*/}
          <div className="flex flex-col gap-y-[4px]">
            <div className="vs-storybook-message-card__main-title overflow-hidden whitespace-nowrap overflow-ellipsis text-[14px] leading-[22px] tracking-[0.04px] font-[500] text-[#000000]">
              {title}
            </div>
            <div className="vs-storybook-message-card__main-content text-[12px] leading-[20px] tracking-[0.04px] text-[var(--color-text-3,#6e718c)] text-justify overflow-hidden line-clamp-2">
              {content}
            </div>
          </div>
          {/* footer */}
          <div className="flex items-center justify-between w-full gap-x-[4px]">
            {/* time */}
            <div className="vs-storybook-message-card__main-description flex-1 overflow-hidden whitespace-nowrap overflow-ellipsis text-[12px] leading-[20px] tracking-[0.04px] text-[var(--color-text-4,#aeafc2)]">
              {description}
            </div>

            {/* button */}
            <Button className="vs-storybook-message-card__main-button shrink-0 flex justify-center items-center gap-x-[2px] px-[12px] py-[2px] border border-[#d7daea] rounded-[52px] overflow-hidden text-[var(--color-text-2,#3f3f51)] text-[13px] leading-[22px] tracking-[0.04px] hover:bg-[#f0f2fa] transition-bg duration-300">
              {viewText}
              <IconArrowRight className="width-[13px] height-[10px]" />
            </Button>
          </div>
        </div>
        <div
          className="vs-storybook-message-card__cover absolute bottom-0 left-0 origin-top-left w-[126px] h-[174px] rotate-[-3.19deg] cursor-pointer"
          onClick={() => {
            onViewClick?.();
          }}
        >
          <VsStoryBookPureCoverPage url={cover} />
        </div>
      </div>
    </div>
  );
};
