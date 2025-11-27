/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// User Token Cookie 工具
const USER_TOKEN_COOKIE_NAME = 'x_user_token';
const USER_TOKEN_EXPIRE_DAYS = 1;

/**
 * 设置 User Token 到cookie
 * @param userToken 用户输入的 User Token
 */
export function setUserTokenCookie(userToken: string): void {
  // 设置过期时间（默认1天）
  const date = new Date();
  date.setTime(date.getTime() + (USER_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000));
  const expires = `expires=${date.toUTCString()}`;
  
  // 设置Cookie
  document.cookie = `${USER_TOKEN_COOKIE_NAME}=${userToken};${expires};path=/`;
}

/**
 * 从cookie中获取 User Token
 * @returns User Token 字符串或空字符串
 */
export function getUserTokenCookie(): string {
  const cookieValue = document.cookie;
  if (!cookieValue) return '';
  
  const name = `${USER_TOKEN_COOKIE_NAME}=`;
  const cookieArray = cookieValue.split(';');
  
  for (let i = 0; i < cookieArray.length; i++) {
    let cookie = cookieArray[i].trim();
    if (cookie.indexOf(name) === 0) {
      return cookie.substring(name.length, cookie.length);
    }
  }
  
  return '';
}

/**
 * 检查是否存在User Token cookie
 * @returns 存在返回true，不存在返回false
 */
export const hasUserTokenCookie = (): boolean => {
  const userToken = getUserTokenCookie();
  return userToken.trim() !== '';
};

/**
 * 清除User Token cookie
 */
export function clearUserTokenCookie(): void {
  // 设置过期时间为过去，删除Cookie
  document.cookie = `${USER_TOKEN_COOKIE_NAME}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}