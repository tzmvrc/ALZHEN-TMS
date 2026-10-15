/** A bounded queue: tasks are lazy so creating a queue cannot start every
 * request at once. Session changes stop queued tasks from starting. */
export async function runBackgroundPreload(tasks: readonly (() => Promise<unknown>)[], concurrency: number, isCurrent: () => boolean) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, async () => {
    while (isCurrent() && next < tasks.length) {
      const task = tasks[next++];
      try { await task(); } catch { /* Each resource can retry independently on navigation. */ }
    }
  }));
}
