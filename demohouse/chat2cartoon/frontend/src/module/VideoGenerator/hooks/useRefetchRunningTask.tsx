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

import { useCallback, useContext, useRef } from 'react';

import { useUnmount } from 'ahooks';


import { sleep } from '@/utils/utils';
import { GetVideoGenTaskResponse, Phase } from '@/types/video_gen_task';

import { InjectContext } from '../store/Inject/context';

const LOOP_INETRVAL = 3000;

export interface ResultType extends Partial<GetVideoGenTaskResponse> {
  Error?: string;
}

const INITIAL_RESULT: ResultType = {
  model: '',
  id: '',
};

export const useRefetchRunningTask = (updateVideo: (value: ResultType) => void) => {
  const { api } = useContext(InjectContext);
  const lock = useRef(true);

  useUnmount(() => {
    lock.current = false;
  });

  const run = useCallback(async (Id: string): Promise<ResultType> => {
    if (!api.GetVideoGenTask) {
      return INITIAL_RESULT;
    }
    try {
      while (lock.current) {
        await sleep(LOOP_INETRVAL);
        const task = await api.GetVideoGenTask({ Id }, { showError: false });
        const currentPhase = task.status as Phase;
        updateVideo(task as ResultType);
        if ([Phase.PhaseFailed, Phase.PhaseCompleted].includes(currentPhase)) {
          return task as ResultType;
        }
      }
      return INITIAL_RESULT;
    } catch (e: any) {
      return {
        ...INITIAL_RESULT,
        Error: `${
          e?.data?.ResponseMetadata?.Error?.Message ??
          '预期之外的错误，请联系管理员'
        }`,
      };
    }
  }, [api]);

  return { run };
};
