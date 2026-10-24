/** Split only row-scoped validation failures. Never retry infrastructure or batch conflicts. */
export async function isolateImportRows<Row, Result>(rows: Row[], commit: (rows: Row[]) => Promise<Result>, rowScoped: (error: unknown) => boolean, rejected: (row: Row, error: unknown) => Result): Promise<Result[]> {
  if (!rows.length) return [];
  try { return [await commit(rows)]; }
  catch (error) {
    if (!rowScoped(error)) throw error;
    if (rows.length === 1) return [rejected(rows[0], error)];
    const middle = Math.ceil(rows.length / 2);
    // Chunks share one idempotent batch and immutable group target; keep writes sequential.
    return [...await isolateImportRows(rows.slice(0, middle), commit, rowScoped, rejected), ...await isolateImportRows(rows.slice(middle), commit, rowScoped, rejected)];
  }
}
