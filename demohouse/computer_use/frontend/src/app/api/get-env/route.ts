import { NextResponse } from "next/server";

export async function GET() {
  const res = {
    VNC_PROXY_URL: process.env.VNC_PROXY_URL,
    MCP_SERVER_URL: process.env.MCP_SERVER_URL,
    SUPPORT_SANDBOX_CREATE: process.env.SUPPORT_SANDBOX_CREATE,
  };

  return NextResponse.json(res);
}
