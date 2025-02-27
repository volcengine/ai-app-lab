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

import { useMemo } from 'react';

import interactiveVideoAvatar from '@/images/assets/interative_video.jpeg';
import { Assistant } from '@/types/assistant';

interface Props {
  placeholderInfo?:
    | {
        name?: string;
        avatar?: any;
        openingRemark?: string;
        preQuestions?: string[];
      }
    | {
        name?: string;
        avatar?: string;
        openingRemark?: string;
        // preQuestions?: string[];
      }[];

  assistant?: Assistant;
  templateType?: any;
}

interface PlaceholderInfo {
  name: string;
  avatar: string;
  openingRemark: string;
  preQuestions?: any[];
}

export const usePlaceholderInfo = ({ assistant }: Props): PlaceholderInfo | PlaceholderInfo[] =>
  useMemo(
    () => ({
      name: assistant?.Name ?? '',
      avatar: interactiveVideoAvatar,
      openingRemark: assistant?.OpeningRemarks?.OpeningRemark ?? '',
      preQuestions: assistant?.OpeningRemarks?.OpeningQuestions ?? [],
    }),
    [assistant],
  );
