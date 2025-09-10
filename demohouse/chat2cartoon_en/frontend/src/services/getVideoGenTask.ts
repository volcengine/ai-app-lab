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

import { globalEnv } from "@/constant";
import Cookies from "js-cookie";

import axios, { AxiosPromise, AxiosRequestConfig } from "axios";


type Request = <T>(params: { Id: string }) => AxiosPromise<T>;

export const GetVideoGenTask: Request = async (params: any) =>{
  const url = `/api/v3/contents/generations/tasks/${params.Id}`;
  const axiosConfig: AxiosRequestConfig = {
    method: "GET",
    headers: {
      'Content-Type': 'application/json',
      'X-Csrf-Token': Cookies.get('csrfToken') || '',
      'Authorization': `Bearer ${globalEnv.ARK_API_KEY}`
    },
    url,
  };

  try {
    const result = await axios(axiosConfig);
    return Promise.resolve(result.data);
  } catch (error: any) {
    return Promise.reject(error);
  }
}
