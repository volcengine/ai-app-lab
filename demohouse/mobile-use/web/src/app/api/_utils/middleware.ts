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

import { NextRequest, NextResponse } from "next/server";
import { APIError } from '../../../lib/exception/apiError';

export type ApiHandler = (req: NextRequest, middlewareResult: MiddlewareResult) => Promise<NextResponse> | NextResponse;

export interface MiddlewareResult {
  accountId: string;
  userId: string;
  name: string;
  faasInstanceName: string | null;
  authToken: string | null;
  token: string | null;
}

// 创建中间件链
export function withMiddleware(handler: ApiHandler) {
  return async function (req: NextRequest) {
    try {
      // 1. 认证中间件
      const authResult = await checkAuth(req);
      if ('error' in authResult && authResult.isError) {
        return NextResponse.json({ error: authResult.error }, { status: 401 });
      }
      if (!('accountId' in authResult)) {
        return NextResponse.json({ error: authResult.error }, { status: 401 });
      }
      const response = await handler(req, {
        ...authResult,
        authToken: authResult.token,
        // agent server 亲和性
        faasInstanceName: req.headers.get('x-agent-faas-instance-name'),
      });
      return response
    } catch (error) {
      // 统一错误处理
      console.error("Response Error:", error)
      if (error && (error instanceof APIError)) {
        console.error("API Error:", error);
        return NextResponse.json(
          {
            error: {
              code: (error as APIError).code,
              message: (error as Error).message,
            },
          },
          { status: [401, 403].includes(error.code) ? error.code : 200 }
        );
      }
      console.error("Server Error:", error)
      return NextResponse.json(
        {
          error: {
            code: "InternalError",
            message: "网络连接异常，请刷新后重试",
          },
        },
        { status: 500 }
      );
    }
  };
}

// Extract the caller's token; mobile_agent validates it and determines identity.
async function checkAuth(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) {
      return getIAMError("InvalidCredentials", "请提供网站访问 API KEY");
    }
    const accountId = '1234567890';
    return {
      accountId,
      name: 'User',
      userId: accountId,
      token
    };
  } catch (error) {
    console.error("认证错误:", error);
    return getIAMError("InternalError", "认证失败");
  }
}


function getIAMError(code: string | number, message: string) {
  console.error("IAM错误:", code, message);
  return {
    error: {
      code: code,
      message: message,
    },
    isError: true
  }
}
