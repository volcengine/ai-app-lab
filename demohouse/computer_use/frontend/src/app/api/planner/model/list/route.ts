import { NextResponse } from "next/server";
import { plannerClient } from "../../planner-client";

export async function GET() {
  try {
    const resp = await plannerClient.get("/models");
    return NextResponse.json(resp.data);
  } catch (error) {
    console.error("获取模型列表失败", error);
    return NextResponse.json(
      {
        success: false,
        message: "获取模型列表失败",
      },
      { status: 500 }
    );
  }
}

// 改为动态路由以确保每次都获取最新数据
export const dynamic = "force-dynamic";
