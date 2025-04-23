import { useState, useEffect } from "react";

export function useEmbedded() {
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    setIsEmbedded(new URLSearchParams(window.location.search).get("embedded") === "true");
  }, []);

  return isEmbedded;
}