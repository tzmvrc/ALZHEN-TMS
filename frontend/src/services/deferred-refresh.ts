/** Coalesce incoming invalidations and wait for editing to finish. This never
 * commits an editor: Enter/blur remains owned by the existing cell component. */
export function createDeferredRefresh(options: {
  blocked: () => boolean;
  refresh: () => Promise<unknown> | void;
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let stopped = false, dirty = false, running = false, timer: ReturnType<typeof setTimeout> | null = null;
  function schedule() {
    if (!stopped && timer === null) timer = options.schedule(() => { timer = null; void flush(); }, 200);
  }
  async function flush() {
    if (stopped || !dirty) return;
    if (running || options.blocked()) { schedule(); return; }
    dirty = false; running = true;
    try { await options.refresh(); } catch { /* Existing view owns error feedback. */ }
    finally { running = false; if (dirty) schedule(); }
  }
  return {
    configure(next: { refresh: () => Promise<unknown> | void; blocked: () => boolean }) { options.refresh = next.refresh; options.blocked = next.blocked; },
    resume() { stopped = false; },
    request() { if (!stopped) { dirty = true; schedule(); } },
    blocked: () => options.blocked(),
    stop() { stopped = true; dirty = false; if (timer !== null) options.cancel(timer); timer = null; },
  };
}
