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
import { IconImage } from "@arco-design/web-react/icon";
import "./index.css";

interface LoadingProps {
  className?: string;
  text?: string;
}

export const Loading: React.FC<LoadingProps> = ({ className, text }) => {
  return (
    <div
      className={classNames(
        "relative w-full aspect-video overflow-hidden rounded-[12px]",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-pink-300 via-blue-300 to-purple-300 animate-[neon-gradient_6s_ease_infinite]"></div>
      <div className="absolute inset-[-50%] bg-[conic-gradient(from_180deg,#ff9a9e,#fad0c4,#a1c4fd,#c2e9fb,#ff9a9e)] blur-[120px] animate-[neon-spin_10s_linear_infinite]"></div>
      <div className="h-full flex items-center justify-center flex-col text-white font-medium relative z-20">
        <IconImage fontSize={30} />
        <div className="text-[13px] leading-[20px] mt-[4px]">
          {text || "图片生成中"}
          <span className="animate-ellipsis align-middle">...</span>
        </div>
      </div>
    </div>
  );
};
