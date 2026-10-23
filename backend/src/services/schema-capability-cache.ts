/** Cache schema availability only, never operational records or permissions. */
export function schemaCapability(check: () => Promise<boolean>) {
  let cached: { value: boolean; expiresAt: number } | undefined;
  let pending: Promise<boolean> | undefined;
  return async () => {
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (pending) return pending;
    const request = check().then(value => {
      // Missing migrations are rechecked promptly after an approved deployment.
      cached = { value, expiresAt: Date.now() + (value ? 60_000 : 5_000) };
      return value;
    });
    pending = request;
    try { return await request; }
    finally { if (pending === request) pending = undefined; }
  };
}
