/** Default labels only: apply before resolving a user-created header alias. */
export const spreadsheetColumnLabel = (label: string) => label.replace(/\bnumber\b/gi, "No.");

/** Literal partial matching without modifying the user's search text. */
export const matchesSpreadsheetSearch = (value: unknown, query: string) =>
  String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
