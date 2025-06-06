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

import { NextResponse } from "next/server";
import { sandboxManagerClient } from "../sansbox-manager-client";

export async function POST(request: Request) {
  try {
    const { sandboxId } = await request.json();

    // 从沙箱管理器删除沙箱
    const resp = await sandboxManagerClient.get("", {
      params: {
        Action: "DeleteSandbox",
        Version: "2020-04-01",
        SandboxId: sandboxId,
      },
    });
    return NextResponse.json(resp.data);
  } catch (error) {
    console.error("删除沙箱失败", error);
    return NextResponse.json(
      {
        success: false,
        message: "删除沙箱失败",
      },
      { status: 500 }
    );
  }
}

// 改为动态路由以确保每次都获取最新数据
export const dynamic = "force-dynamic";
