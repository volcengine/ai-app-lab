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

import { Ratio } from "../const";

// 根据比例绘制圆角矩形图标（缩小版）
export const RatioThumb: React.FC<{ ratio: Ratio }> = ({ ratio }) => {
  const [w, h] = ratio.split(":").map((n) => Number(n));
  const max = 11; // 缩小矩形最大边
  const isWide = w >= h;
  const rectW = isWide ? max : (max * w) / h;
  const rectH = isWide ? (max * h) / w : max;
  const x = 8 - rectW / 2; // 配合更小的画布居中
  const y = 8 - rectH / 2;

  return (
    <svg width={16} height={16} viewBox="0 0 16 16">
      <rect
        x={x}
        y={y}
        width={rectW}
        height={rectH}
        rx={2}
        ry={2}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
      />
    </svg>
  );
};