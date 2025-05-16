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
