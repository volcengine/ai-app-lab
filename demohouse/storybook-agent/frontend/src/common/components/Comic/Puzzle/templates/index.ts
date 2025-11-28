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

import { Template } from '../PuzzleBoard';
import square, { previewSquare } from './schema/square';
import landscape, { previewLandscape } from './schema/landscape';
import portrait, { previewPortrait } from './schema/portrait';

export const getTemplateData = (type: 'square' | 'portrait' | 'landscape', count: number): Template[] => {
  switch (type) {
    case 'square':
      return square[count] || [];
    case 'portrait':
      return portrait[count] || [];
    case 'landscape':
      return landscape[count] || [];
    default:
      return [];
  }
};

export const getTemplateByBizParams = ({
  sid,
  ratio,
  length,
  splitChar,
}: {
  sid: string;
  ratio: string;
  length: number;
  splitChar?: string;
}) => {
  const [width = 1, height = 1] = ratio.split(splitChar || 'x').map((i) => parseInt(i));
  const realRatio = width / height;

  const type = realRatio === 1 ? 'square' : realRatio > 1 ? 'landscape' : 'portrait';
  const templates = getTemplateData(type, Math.max(Math.min(length, 9), 1)) || [];

  if (templates.length <= 1) {
    return templates[0] ?? getTemplateData(type, 1)[0];
  }

  const hashValue = hash(sid);
  const index = hashValue % templates.length;
  return templates[index] || templates[0];
};

function hash(id: string) {
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) + hash + id.charCodeAt(i); // hash * 33 + charCode
  }
  return hash >>> 0; // 确保为 32 位无符号整数
}
