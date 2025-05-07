import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password } = body;

  if (username === process.env.USERNAME && password === process.env.PASSWORD) {
    return NextResponse.json(
      {
        success: true
      },
      {
        headers: {
          'Set-Cookie': `auth=${btoa(`${username}:${password}`)}; path=/; HttpOnly; Secure; SameSite=Strict`
        }
      }
    );
  }
  return NextResponse.json({ success: false, message: '用户名或密码错误' }, { status: 401 });
}
