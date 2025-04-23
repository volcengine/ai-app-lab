import { NextResponse } from "next/server";
import { sandboxManagerClient } from "../sansbox-manager-client";

export async function GET(request: Request) {
  try {
    const sandboxId = new URL(request.url).searchParams.get("sandboxId");

    // 从沙箱管理器获取终端 URL
    const resp = await sandboxManagerClient.get("", {
      params: {
        Action: "DescribeSandboxTerminalUrl",
        Version: "2020-04-01",
        SandboxId: sandboxId,
      },
    });
    return NextResponse.json(resp.data);
  } catch (error) {
    console.error("获取终端 URL 失败", error);
    return NextResponse.json(
      {
        success: false,
        message: "获取终端 URL 失败",
      },
      { status: 500 }
    );
  }
}

// 改为动态路由以确保每次都获取最新数据
export const dynamic = "force-dynamic";
