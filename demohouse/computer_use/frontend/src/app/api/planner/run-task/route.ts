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
import { plannerClient } from "../planner-client";

export async function POST(request: Request) {
  try {
    const { user_prompt, sandbox_id, system_prompt, model_name } = await request.json();

    const body = { user_prompt, sandbox_id, system_prompt, model_name };

    const response = await plannerClient.post("/run/task", body, {
      responseType: "stream",
      headers: {
        "Content-Type": "application/json",
        Authorization: process.env.KEY_AUTH,
      },
    });

    const stream = new ReadableStream({
      start(controller) {
        response.data.on("data", (chunk: Buffer) => {
          controller?.enqueue(chunk);
        });
        response.data.on("end", () => {
          controller?.close();
        });
        response.data.on("error", (err: Error) => {
          controller?.error(err);
        });
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        message: "执行任务失败",
      },
      { status: 500 }
    );
  }
}
