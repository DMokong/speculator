import { useEffect, useRef } from 'react';

export function useAutoRefresh(onRefresh: () => void, intervalMs = 90_000) {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
