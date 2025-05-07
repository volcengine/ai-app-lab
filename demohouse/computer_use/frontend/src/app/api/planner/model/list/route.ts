import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: NextRequest) {
  try {
    const resp = await axios.get(`${process.env.AGENT_PLANNER_URL}/models`);
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
