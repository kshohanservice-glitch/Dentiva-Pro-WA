export interface DentivaInvoke {
  invoke(channel: string, args?: unknown): Promise<{ ok: boolean; data?: unknown; error?: ApiError }>;
  on(event: 'session:locked' | 'notification:created', listener: (payload?: unknown) => void): () => void;
  activity(): void;
}

declare global {
  interface Window {
    dentiva: DentivaInvoke;
  }
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Typed IPC call. Resolves with data or throws ApiError with a user-safe message. */
export async function api<T>(channel: string, args?: unknown): Promise<T> {
  const res = await window.dentiva.invoke(channel, args);
  if (!res.ok) {
    throw new ApiError(res.error?.code ?? 'DB', res.error?.message ?? 'Something went wrong.', res.error?.details);
  }
  return res.data as T;
}

export const hasPerm = (perms: string[] | undefined, perm: string): boolean => !!perms?.includes(perm);
