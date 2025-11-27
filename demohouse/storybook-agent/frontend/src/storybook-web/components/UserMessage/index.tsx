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
import { type Message } from "@/common/components/ChatBox/Message";
import { formatDate, formatPromptData2Params } from "@/storybook-web/utils";
import { RatioThumb } from "@/common/components/ChatBox/Prompt/ImageConfigGroup/RatioThumb";
import { Ratio } from "@/common/components/ChatBox/Prompt/const";
import { Tooltip } from "@arco-design/web-react";
import { MODEL } from "@/storybook-web/consts";

interface UserMessageProps {
  message: Message;
}

const Card = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <div
      className={classNames(
        "max-h-[26px] mr-2 px-2 bg-[#F5F7FA] text-[#3f3f51] rounded-[4px] border border-solid border-[#EAEAEA] whitespace-nowrap overflow-hidden text-ellipsis",
        className
      )}
    >
      {children}
    </div>
  );
};

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  const data = message.data as ReturnType<typeof formatPromptData2Params>;

  return (
    <div className="mb-2">
      <div className="text-[#737a87]">{formatDate(message.timestamp)}</div>
      <div className="mb-2 text-[#0c0d0e] text-[15px]">{data.query || ""}</div>
      <div className="flex flex-nowrap">
        {data?.reference_images && data?.reference_images?.length > 0 ? (
          <Card className="flex flex-nowrap items-center relative pl-0">
            <Tooltip
              className="max-w-screen [&_div.arco-trigger-arrow]:z-10"
              trigger="click"
              color="#fff"
              position="bottom"
              content={
                <div className="flex flex-nowrap w-full overflow-auto">
                  {data.reference_images.map((i) => (
                    <img
                      className="relative mr-[0.5px] top-[-0.5px] rounded"
                      height="100px"
                      width="auto"
                      src={i || ""}
                    ></img>
                  ))}
                </div>
              }
            >
              <div className="flex flex-nowrap cursor-pointer">
                {data.reference_images.map((i) => (
                  <img
                    className="relative mr-[1px] rounded"
                    height="20px"
                    width="20px"
                    src={i || ""}
                  ></img>
                ))}
                <div className="pl-1">参考图</div>
              </div>
            </Tooltip>
          </Card>
        ) : null}
        <Card>{data.resolution}</Card>
        <Card>
          <span className="relative top-[3px]">
            <RatioThumb ratio={data.ratio as Ratio} />
          </span>
          {data.ratio}
        </Card>
        <Card>
          <div className="relative top-[3px] mr-1 w-[16px] h-[16px] text-[12px] inline-block bg-[url('./assets/image.svg')]"></div>
          {data.mode === "storybook" ? "故事书" : "连环画"}
        </Card>
        <Card>
          <div className="relative pl-6">
            <div className="absolute left-[0px] h-5 w-5 bg-[url('./assets/logo.png')] bg-center bg-cover bg-no-repeat rounded"></div>
            {MODEL}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default UserMessage;
