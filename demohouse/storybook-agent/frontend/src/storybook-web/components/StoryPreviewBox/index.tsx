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

import {
  CanvasHeader,
  IDataItem,
  VSStoryBookProvider,
} from "@/common/components/StoryBook";
import { StorybookContent } from "./StorybookContent";
import { IconDownload } from "@arco-design/web-react/icon";

interface StoryPreviewBoxProps {
  pages: IDataItem[];
  title?: string;
  onClose?: () => void;
  onDownload?: () => void;
}

export const StoryPreviewBox: React.FC<StoryPreviewBoxProps> = ({
  pages,
  title,
  onClose,
  onDownload,
}) => {
  return (
    <VSStoryBookProvider list={pages}>
      <div className="w-full h-full bg-[#fafbfd] p-5">
        <div className="w-full h-full relative bg-white rounded-[12px] border border-solid border-[rgb(229,231,235)]">
          <div className="absolute flex items-center justify-between w-full py-4 px-5 border-b border-solid border-b-[rgb(229,231,235)] border-t-0 border-r-0 border-l-0">
            <CanvasHeader
              title={title}
              changeButton={{
                btnText: {
                  prev: "跳转到开头",
                  next: "跳转到结尾",
                },
              }}
              slots={{
                titleArea(titleNode) {
                  return <>{titleNode}</>;
                },
                shareArea() {
                  return (
                    <div className="cursor-pointer inline-flex items-center justify-center p-1 hover:bg-[#E1E3EF] rounded-[4px] transition-colors">
                      <IconDownload fontSize={18} onClick={onDownload} />
                    </div>
                  );
                },
              }}
              onClose={onClose}
            >
              <div className="flex items-center justify-center h-full w-full px-8">
                <StorybookContent
                  className="w-full h-full flex items-center justify-center"
                  isLoading={false}
                />
              </div>
            </CanvasHeader>
          </div>

          <div className="pt-[60px] px-4 flex items-center justify-center h-full overflow-hidden">
            <StorybookContent
              className="flex items-center justify-center h-full w-full px-4"
              isLoading={false}
            />
          </div>
        </div>
      </div>
    </VSStoryBookProvider>
  );
};
