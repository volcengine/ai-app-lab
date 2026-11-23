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

import { toast } from "sonner";
import { SessionAffinityManager } from "./session";
import { toastRedirect } from "./redirect";
import { buildUrlWithToken } from "../utils";

const beforeFetchSessionHeaders = () => {
  const faasInstanceName = SessionAffinityManager.getFaasInstanceName();
  if (faasInstanceName) {
    return {
      'x-agent-faas-instance-name': faasInstanceName,
    }
  }
  return null;
}

const afterFetchSession = (response: Response) => {
  const faasInstanceName = SessionAffinityManager.getFaasInstanceName();
  const responseFaasInstanceName = response.headers.get('x-agent-faas-instance-name');
  if (responseFaasInstanceName && responseFaasInstanceName !== faasInstanceName) {
    SessionAffinityManager.setFaasInstanceName(responseFaasInstanceName);
    console.log('存储新的FaaS实例名称:', responseFaasInstanceName);
  }
}

const handleErrorResponse = async (response: Response) => {
  const data = await response.json()
  if (data?.error && data?.error?.code !== 0) {
    if (response.status === 401) {
      toastRedirect()
      return
    }
    if (response.status === 403 || (response.status === 200 && data?.error?.code === 403)) {
      toast.warning(data?.error?.message || "会话不存在，请重新开始会话")
      sessionStorage.clear()
      setTimeout(() => {
        // 保留 token 参数进行页面跳转
        window.location.replace(buildUrlWithToken('/'));
      }, 1500)
      return;
    }
    toast.warning(data.error.message)
    return;
  }
  return data;
}

const fetchAPI = async (url: string, options: RequestInit) => {
  try {

    const headers = beforeFetchSessionHeaders();

    // API Auth Key Token - 将 URL token 参数传递给 API
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const apiUrl = urlToken ? `${url}?token=${encodeURIComponent(urlToken)}` : url;

    const response = await fetch(apiUrl, {
      ...options,
      headers: {
        ...(headers || {}),
        ...options.headers,
      },
    });
    // 检查响应中是否包含新的FaaS实例名称
    afterFetchSession(response);
    const data = await handleErrorResponse(response)
    return data
  } catch (error) {
    if (error instanceof Error) {
      toast.warning(error.message)
    } else {
      toast.warning("未知错误")
    }
    return;
  }

}

const fetchSSE = async (url: string, options: RequestInit) => {
  try {
    const headers = beforeFetchSessionHeaders();
    // API Auth Key Token - 将 URL token 参数传递给 SSE API
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const apiUrl = urlToken ? `${url}?token=${encodeURIComponent(urlToken)}` : url;
    const response = await fetch(apiUrl, {
      ...options,
      headers: {
        ...(headers || {}),
        ...options.headers,
      },
      signal: options.signal,
    });
    afterFetchSession(response);
    if (response.headers.get('Content-Type') === 'text/event-stream') {
      if (!response.ok || !response.body) {
        const { error } = (await response.json().catch(() => ({ error: { message: '未知错误' } }))) || { error: { message: '未知错误' } };
        toast.warning(error.message);
        throw new Error(`HTTP错误: ${response.status}`);
      }
      return response.body
    }
    const data = await handleErrorResponse(response)
    return data
  } catch (error) {
    console.log(error)
    // 检查是否为中止错误，如果是则不显示错误提示
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('请求已被中止');
      return;
    }
    if (error instanceof Error) {
      toast.warning(error.message)
    } else {
      toast.warning("未知错误")
    }
    return;
  }
}

export { fetchAPI, fetchSSE };
