"use client";

import { useEffect, useState } from "react";
import { readApiSession, type ApiSession } from "./api";

export function useApiSession() {
  const [session, setSession] = useState<ApiSession>({
    accessToken: "",
    refreshToken: "",
    teamId: "",
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const syncSession = () => setSession(readApiSession());
    syncSession();
    setReady(true);
    window.addEventListener("storage", syncSession);
    window.addEventListener("standix:session-change", syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("standix:session-change", syncSession);
    };
  }, []);

  return { ...session, ready };
}
