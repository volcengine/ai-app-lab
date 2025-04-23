import { NextResponse } from "next/server";
import { sandboxManagerClient } from "../sansbox-manager-client";
import { AxiosError } from "axios";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // 从沙箱管理器获取沙箱列表
    const resp = await sandboxManagerClient({
      method: "GET",
      url: "",
      params: {
        Action: "CreateSandbox",
        Version: "2020-04-01",
        OsType: body.OsType,
      },
    });
    return NextResponse.json(resp.data);
  } catch (error) {
    let message = "创建沙箱失败";
    if (error instanceof AxiosError) {
      message = error.response?.data.ResponseMetadata.Error?.Message;
      if (
        error.response?.data.ResponseMetadata.Error?.Code ===
        "QuotaExceeded.MaximumInstances"
      ) {
        message = "沙箱数量配额不足，请提工单申请提高配额。";
      }
    }
    console.error("创建沙箱失败", error, message);
    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}

// 改为动态路由以确保每次都获取最新数据
export const dynamic = "force-dynamic";
