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

import store from "@/store";
import { getToken } from "@/utils/auth";
import axios from "axios";
import { fetchEventData } from "fetch-sse";

interface Data {
  screenshot?: string;
  summary?: string;
  status: "progress" | "finished" | "started";
  action?: string;
}

interface RunTaskOptions {
  prompt: string;
  onData?: (data: Data) => void;
  abortSignal?: AbortSignal;
}

const baseURL = '/api/planner';

export async function runTask({ prompt, onData, abortSignal }: RunTaskOptions) {
  if (!store.sandbox) {
    return;
  }

  await fetchEventData(`${baseURL}/run-task?token=${getToken()}`, {
    method: "POST",
    signal: abortSignal,
    data: {
      user_prompt: prompt,
      sandbox_id: store.sandbox?.SandboxId,
      system_prompt: store.systemPrompt,
      model_name: store.modelName,
    },
    onMessage: (event, done) => {
      if (done || !event) {
        return;
      }
      const data = JSON.parse(event.data);
      onData?.(data);
    },
    onClose: () => { },
    onError: (error) => {
      console.error(error);
    },
  });
}

export async function getModelList() {
  const response = await axios.get(`${baseURL}/model/list`, {
    params: {
      token: getToken(),
    },
  });
  return response.data;
}
