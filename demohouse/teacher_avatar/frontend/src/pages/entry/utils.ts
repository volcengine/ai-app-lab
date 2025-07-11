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

import { getCameraImage } from '@/api/bridge';
import { EQUESTIONSTATUS } from '@/pages/entry/routes/recognition-result/components/AnswerCard';

export const getCameraImageBase64 = async (imageId: string) => {
  const res = await getCameraImage({ imageId });
  if (res.base64Image) {
    return `data:image/jpeg;base64,${res.base64Image}`;
  }
  return '';
};

export const parseVLMCorrectionResult = (content: string) => {
  const idx = content.indexOf('批改结果');
  if (idx === -1) {
    return EQUESTIONSTATUS.NONE;
  }
  // deepseek 输出匹配
  // 批改结果：错误
  // 批改结果：正确
  // 批改结果：无
  const reg = /([正确|错误|无])+/g;
  //
  const matchRes = content.slice(idx, idx + 10).match(reg);
  if (matchRes === null) {
    return EQUESTIONSTATUS.NONE;
  }
  if (matchRes[0] === '无') {
    return EQUESTIONSTATUS.NONE;
  }
  if (matchRes[0] === '错误') {
    return EQUESTIONSTATUS.FALSE;
  }
  if (matchRes[0] === '正确') {
    return EQUESTIONSTATUS.TRUE;
  }
  return EQUESTIONSTATUS.TRUE;
};

export const genId = () => Math.random().toString(36).slice(2);
