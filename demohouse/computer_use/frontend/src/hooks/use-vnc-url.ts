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

import { useEffect, useMemo, useState } from "react";
import { getVncUrl } from "@/services/sandbox";
import { actions } from "@/store";

export const useVncUrl = (sandboxId?: string) => {
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sandboxId) {
      setWsUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    const fetchVncUrl = async () => {
      setLoading(true);
      try {
        const data = await getVncUrl(sandboxId);
        setWsUrl(data.Url);
        setPassword(data.WindowsKey);
        setToken(data.Token);
      } catch (error) {
        setError(error as string);
      } finally {
        setLoading(false);
      }
    };
    fetchVncUrl();
  }, [sandboxId]);

  const vncUrl = useMemo(() => {
    if (!token) return null;

    const host = actions.getEnvItem("VNC_PROXY_URL")?.replace(/https?:\/\//, "");
    if (!host) return null;
    return `https://computer-use.console.volcengine.com/novnc/vnc.html?host=${host}&autoconnect=true&resize=on&show_dot=true&resize=remote&path=${encodeURIComponent(
      `/?token=${token}`
    )}`;
  }, [token]);

  return { vncUrl, password, wsUrl, loading, error };
};
