"use client";
import { useEffect, useState } from "react";
export function useDebounced(value: string, delay = 300) {
  const [ready, setReady] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setReady(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return ready;
}
