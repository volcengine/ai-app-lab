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

import { IDataPageImageItem } from "../types";
import "./image.scss";
import { useImage } from "../../hooks/useImage";

/**
 * 左侧图片组件
 * */
export const VsStoryBookPageImage = ({
  url = "",
  slot,
}: IDataPageImageItem) => {
  const status = useImage(url);
  return (
    <div className="vs-storybook__page-image w-full h-full relative">
      <div className="absolute top-0 left-0 w-full h-full vs-storybook__page-image__texture"></div>
      {status === "error" ? null : (
        <img
          src={url}
          className="absolute top-0 left-0 w-full h-full object-cover mix-blend-multiply"
          alt=""
        />
      )}
      {slot && (
        <div className="vs-storybook__page-image__slot absolute">{slot}</div>
      )}
    </div>
  );
};
