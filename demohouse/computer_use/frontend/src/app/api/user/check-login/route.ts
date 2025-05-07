import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const authCookie = req.cookies.get("auth")?.value;

  if (authCookie) {
    const [user, pwd] = atob(authCookie).split(":");
    const validUser = process.env.USERNAME;
    const validPassWord = process.env.PASSWORD;

    if (user === validUser && pwd === validPassWord) {
      return NextResponse.json({ success: true });
    }
  }
  return NextResponse.json({ success: false });
}
