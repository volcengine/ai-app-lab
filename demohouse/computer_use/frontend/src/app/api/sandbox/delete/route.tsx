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
