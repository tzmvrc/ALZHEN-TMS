import { ApiError } from "./api-response.js";

export const MAX_SEARCH_LENGTH = 100;

/** Build an OR expression from trusted column names and an untrusted literal search term. */
export function buildIlikeOrFilter(
  columns: readonly string[],
  rawSearch: unknown,
): string | undefined {
  if (typeof rawSearch !== "string") return undefined;

  const search = rawSearch.trim();
  if (!search) return undefined;
  if (search.length > MAX_SEARCH_LENGTH) {
    throw new ApiError(
      `Search must be ${MAX_SEARCH_LENGTH} characters or fewer.`,
      400,
      "SEARCH_TOO_LONG",
    );
  }
  // PostgREST maps * to % for LIKE/ILIKE, so it cannot be searched literally
  // through this operator without changing the search semantics.
  if (search.includes("*")) {
    throw new ApiError(
      "Search cannot contain the * wildcard character.",
      400,
      "INVALID_SEARCH_CHARACTER",
    );
  }

  const escapedPattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const quotedValue = `"${escapedPattern
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}"`;

  return columns
    .map((column) => {
      if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(column)) {
        throw new Error("Invalid trusted search column configuration.");
      }
      return `${column}.ilike.${quotedValue}`;
    })
    .join(",");
}
