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

import Cookies from 'js-cookie';

export enum ERequestType {
  // 获取图库列表
  LIST_IMAGE = 'list_image',
  // 图片入库
  UPSERT_IMAGE = 'upsert_image',
  // 图片检索
  SEARCH_IMAGE = 'search_image',
  // 图片过签
  SIGNED_TOS_LIST = 'signed_tos_list_to_url_list',
}
const API_PATH="http://localhost:8888/api/v3/bots/chat_multi_modal/animal_recognition"
export async function queryRequest<T extends Record<string, any>, R>(
  type: ERequestType,
  { data }: { data?: T; customHeader?: Record<string, string> },
): Promise<R> {
  const metadata = {
    type,
    ...data,
  };
  const body = JSON.stringify({
    model: '',
    metadata,
    messages: [],
  });
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append('X-Csrf-Token', Cookies.get('csrfToken') || '');

  const response = await fetch(API_PATH, {
    mode: 'cors',
    method: 'POST',
    credentials: 'include',
    headers,
    body,
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }
  const resBody = await response.json();
  if (resBody?.error !== null) {
    throw new Error(JSON.stringify(resBody?.error));
  }
  return resBody?.metadata;
}
