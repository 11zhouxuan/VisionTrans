import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface UseTauriInvokeResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (...args: unknown[]) => Promise<T | null>;
}

/**
 * Hook for calling Tauri IPC commands with loading/error state management
 */
export function useTauriInvoke<T>(command: string): UseTauriInvokeResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (...args: unknown[]): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<T>(command, args[0] as Record<string, unknown> | undefined);
      setData(result);
      setLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setLoading(false);
      return null;
    }
  }, [command]);

  return { data, loading, error, execute };
}
