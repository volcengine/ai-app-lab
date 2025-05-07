import { useEffect, useMemo, useState } from "react";
import { getVncUrl } from "@/services/sandbox";

export const useVncUrl = (sandboxId?: string) => {
  const [wsUrl, setWsUrl] = useState<string | null>(null);
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
      } catch (error) {
        setError(error as string);
      } finally {
        setLoading(false);
      }
    };
    fetchVncUrl();
  }, [sandboxId]);

  const vncUrl = useMemo(() => {
    if (!wsUrl) return null;
    // 从 websocket url 解析出 ip、port 和 token
    const url = new URL(wsUrl);
    const ip = url.hostname;
    const port = url.port;
    const path = (url.pathname + url.search).slice(1);
    return `/novnc/vnc.html?host=${ip}&port=${port}&autoconnect=true&resize=on&show_dot=true&resize=remote&path=${encodeURIComponent(
      path
    )}`;
  }, [wsUrl]);

  return { vncUrl, password, wsUrl, loading, error };
};
