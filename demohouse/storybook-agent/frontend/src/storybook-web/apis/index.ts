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

import { getUserTokenCookie } from "@/common/utils/cookie";

export interface GenerateStoryBookParams {
  mode: "storybook" | "comics";
  query: string;
  reference_images?: string[];
  size: string;
}

export interface GenerateStoryBookResponse {
  Title: string;
  Summary: string;
  Mode: "storybook" | "comics";
  Items: { Url: string; Text?: ""; IsCover?: boolean }[];
}

// 验证User Token有效性的函数
export const validateUserToken = async (
  userToken: string
): Promise<{ valid: boolean; message?: string }> => {
  try {
    const response = await fetch("/api/storybook/validate-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Token": userToken,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { valid: false, message: "无效的 User Token" };
      }
      return { valid: false, message: `User Token 验证失败` };
    }

    return { valid: true, message: "验证成功" };
  } catch (error) {
    return { valid: false, message: "验证过程中发生错误" };
  }
};

export const generateStoryBook = async (
  params: GenerateStoryBookParams
): Promise<GenerateStoryBookResponse> => {
  try {
    // 从Cookie获取User Token
    const userToken = getUserTokenCookie();

    const response = await fetch("/api/storybook/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 添加X-User-Token请求头
        "X-User-Token": userToken,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status || "Unknown error"}`);
    }

    const result = await response.json();
    const data = result.data;

    // 检查响应数据是否符合预期格式
    if (result.status !== "success" || !data || !data.Items) {
      throw new Error("服务异常，返回数据格式不正确");
    }

    return data;
  } catch (error) {
    throw error;
  }
};
