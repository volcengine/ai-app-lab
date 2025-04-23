import { NextRequest, NextResponse } from "next/server";
import { sandboxManagerClient } from "../sansbox-manager-client";

export async function GET(req: NextRequest) {
  try {
    // 从沙箱管理器获取沙箱列表
    const resp = await sandboxManagerClient.get("", {
      params: {
        Action: "DescribeSandboxes",
        Version: "2020-04-01",
      },
    });
    return NextResponse.json(resp.data);
  } catch (error) {
    console.error("获取沙箱列表失败", error);
    return NextResponse.json(
      {
        success: false,
        message: "获取沙箱列表失败",
      },
      { status: 500 }
    );
  }
}

// 改为动态路由以确保每次都获取最新数据
export const dynamic = "force-dynamic";
