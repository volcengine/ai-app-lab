import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(request: Request) {
  try {
    const baseURL = process.env.AGENT_PLANNER_URL;
    const url = `${baseURL}/run/task`;

    const { user_prompt, sandbox_id, system_prompt, model_name } = await request.json();

    const body = { user_prompt, sandbox_id, system_prompt, model_name };

    const response = await axios.post(url, body, {
      responseType: "stream",
      headers: {
        "Content-Type": "application/json",
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
