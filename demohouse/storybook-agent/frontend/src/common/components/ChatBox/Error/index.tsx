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

import React from "react";
import classNames from "classnames";
import { IconImageClose } from "@arco-design/web-react/icon";

interface ErrorProps {
  className?: string;
}

export const Error: React.FC<ErrorProps> = ({ className }) => {
  return (
    <div
      className={classNames(
        "relative w-full aspect-video overflow-hidden rounded-[12px] bg-[#DADADA]",
        className
      )}
    >
      <div className="h-full flex items-center justify-center flex-col text-white font-medium relative z-20">
        <IconImageClose fontSize={30} />
        <div className="text-[13px] leading-[20px]">图片生成失败</div>
      </div>
    </div>
  );
};
