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

import { AudioData } from '@/types/asr';

/**
 * 处理 asr 响应
 * @description 每轮 asr 需要重连
 * @param res
 * @param onTextUpdate
 * @param onDefinite
 */
export const handleAsrResp = (
  res: AudioData,
  onTextUpdate: (text: string) => void,
  onDefinite: (text: string) => void,
) => {
  const text = res.result?.text || '';
  const utterances = res.result?.utterances;
  if (!utterances) {
    return;
  }
  const currentUtterance = utterances[0];

  const isDefinite = currentUtterance.definite;
  if (isDefinite) {
    onDefinite(currentUtterance.text);
  } else {
    onTextUpdate(text);
  }
};