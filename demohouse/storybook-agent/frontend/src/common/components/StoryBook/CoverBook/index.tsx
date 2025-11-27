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

import { IStoryBookPureCoverPageProps } from "./types";
import { VsStoryBookRightPageThickness } from "../PageThickness";
import { VsStoryBookPageCover } from "../Book/page";
import { VsPage } from "../Book/vs-page";
import "./index.scss";
import { IDataCoverItem } from "..";

/**
 * 纯粹只有 cover 和模拟书本厚度的组件， 不带有任何交互逻辑
 * */
export const VsStoryBookPureCoverPage = (
  props: IStoryBookPureCoverPageProps & Partial<Omit<IDataCoverItem, "url">>
) => {
  return (
    <div
      className={`w-full h-full relative vs-storybook-pure-cover-page ${props.className}`}
    >
      <div className="pr-[10px] h-full relative">
        <VsStoryBookRightPageThickness />
        <VsPage pageNum={1} isRight={true} isFlipped={false}>
          <VsStoryBookPageCover
            {...props}
            isCover={true}
            id="private-cover"
            url={props.url}
          />
        </VsPage>
      </div>
    </div>
  );
};
