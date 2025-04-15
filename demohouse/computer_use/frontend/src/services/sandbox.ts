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

import axios from "axios";
import { getToken } from "@/utils/auth";

export enum OSType {
  WINDOWS = "Windows",
  LINUX = "Linux",
}

// 创建一个统一的axios实例
export const apiClient = axios.create({
  baseURL: "/api/sandbox",
  headers: {
    "Content-Type": "application/json",
  },
});

// 添加请求拦截器，自动为所有请求添加 token 参数
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    // 合并 params，保证不会覆盖原有参数
    config.params = {
      ...(config.params || {}),
      token,
    };
  }
  return config;
});

// 创建沙箱
export async function createSandbox(body: { OsType?: OSType } = {}) {
  try {
    const resp = await apiClient.post("/create", body);
    return resp.data;
  } catch (error) {
    console.error("创建沙箱失败", error);
    throw error;
  }
}

// 删除沙箱
export async function deleteSandbox(id: string) {
  try {
    const response = await apiClient.post(`/delete`, {
      sandboxId: id,
    });
    return response.data;
  } catch (error) {
    console.error(`删除沙箱[${id}]失败`, error);
    throw error;
  }
}

// 获取沙箱列表
export async function getSandboxList() {
  try {
    const response = await apiClient.get("/list");
    return response.data.Result;
  } catch (error) {
    console.error("获取沙箱列表失败", error);
    throw error;
  }
}

export async function getVncUrl(sandboxId: string) {
  try {
    const response = await apiClient.get(
      `/terminal-url?sandboxId=${sandboxId}`
    );
    return response.data.Result;
  } catch (error) {
    console.error("获取远程桌面地址失败", error);
    throw error;
  }
}
