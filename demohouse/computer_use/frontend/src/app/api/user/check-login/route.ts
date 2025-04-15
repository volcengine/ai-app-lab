// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
