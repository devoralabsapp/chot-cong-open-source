"use client";
import { useEffect, useState } from "react";
import { clientAuth } from "./client";
import { authErrorMessage } from "./auth-errors";

export function useAuthReady(enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // Start SDK preparation before the click. Safari/mobile can initialize
    // their popup relay here, while client persistence is already NONE.
    Promise.resolve()
      .then(() => clientAuth().authStateReady())
      .then(() => {
        if (active) setResult({ attempt, error: "" });
      })
      .catch((error) => {
        if (active) setResult({ attempt, error: authErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [enabled, attempt]);
  return {
    ready: enabled && result?.attempt === attempt && !result.error,
    error: result?.attempt === attempt ? result.error : "",
    retry: () => setAttempt((value) => value + 1),
  };
}
