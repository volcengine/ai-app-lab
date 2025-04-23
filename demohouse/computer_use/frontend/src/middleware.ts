import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/api/sandbox/:path*", // 包含所有 Sandbox-Manager API
    "/api/planner/:path*", // 包含 Agent-Planner API
  ],
};

export function middleware(req: NextRequest) {
  const authCookie = req.cookies.get("auth")?.value;

  if (authCookie) {
    const [user, pwd] = atob(authCookie).split(":");
    const validUser = process.env.USERNAME;
    const validPassWord = process.env.PASSWORD;

    if (user === validUser && pwd === validPassWord) {
      return NextResponse.next();
    }
  }

  // 如果认证失败，返回401状态码
  return new NextResponse("认证失败", {
    status: 401
  });
}

