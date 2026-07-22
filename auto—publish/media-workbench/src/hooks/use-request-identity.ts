import { useCallback, useEffect, useRef } from 'react';

/** Rejects late renderer responses after a client/session change or unmount. */
export function useRequestIdentity(scope: string) {
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => { generation.current += 1; }, [scope]);
  return useCallback(() => {
    const id = ++generation.current;
    return () => mounted.current && id === generation.current;
  }, []);
}
