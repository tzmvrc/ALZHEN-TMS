export function dispatchReferencePrefix(value: string) {
  const prefix = value.trim().toUpperCase().replace(/^TRIP/, "DISPATCH");
  if (!/^DISPATCH\d{6}$/.test(prefix)) throw new Error("Invalid dispatch prefix");
  return prefix;
}

export function nextReference(prefix: string, references: unknown[]) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let highest = 0;
  for (const value of references) {
    const match = pattern.exec(String(value ?? ""));
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}-${highest + 1}`;
}

type SchemaError = { code?: string; message?: string };
export function createTripReferenceCapability(check: () => PromiseLike<{ error: SchemaError | null }>, now = Date.now) {
  let cached: { ready: boolean; expires: number } | null = null;
  let pending: Promise<boolean> | null = null;
  return async () => {
    if (cached && cached.expires > now()) return cached.ready;
    if (pending) return pending;
    pending = (async () => {
      const { error } = await check();
      const missing = error && ["42703", "PGRST204"].includes(error.code ?? "") && /trip_reference/i.test(error.message ?? "");
      if (error && !missing) throw new Error("Unable to check trip numbering availability.");
      const ready = !error;
      cached = { ready, expires: now() + 5000 };
      return ready;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
