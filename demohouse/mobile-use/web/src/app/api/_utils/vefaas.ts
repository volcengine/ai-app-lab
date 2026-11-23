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

import { APIError } from "../../../lib/exception/apiError";

export async function handleVEFaaSError(errorBody: Record<string, any>, status: number) {
  // 特殊处理 500 状态码的情况
  if (status === 500) {
    // 检查是否是特定的内部系统错误
    if (["internal_system_error", "internal_proxy_error"].includes(errorBody?.error_code)) {
      // 返回 403 重定向
      throw new APIError(403, "会话不存在，请重新开始会话");
    }
  }
  if (status === 401) {
    throw new APIError(401, "请提供网站访问 Token 参数");
  }
  if (status === 403) {
    throw new APIError(403, "无权访问当前会话或云手机，请重新授权");
  }
}
