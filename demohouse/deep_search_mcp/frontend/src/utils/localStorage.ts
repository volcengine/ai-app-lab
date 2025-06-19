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

/**
 * localStorage
 * 支持一些模版的配置
 * 主要是一个用户同时进行的任务不会很多，localStorage完全可以实现该功能
 * 暂时没有不要存在服务端
 * expires 添加过期时间，为期一天
 */

export function removeLocalStorage(key: string) {
  try {
    if (typeof window === 'object' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    console.error(e);
  }
}

export function setLocalStorage(key: string, value: any) {
  try {
    if (typeof window === 'object' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    console.error(e);
  }
}

export function getAllLocalStorage() {
  try {
    if (typeof window === 'object' && window.localStorage) {
      return window.localStorage;
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
}

export function getLocalStorage(key: string) {
  try {
    if (typeof window === 'object' && window.localStorage) {
      return window.localStorage.getItem(key);
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
}
