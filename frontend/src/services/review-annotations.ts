export type HighlightColor = "yellow" | "red" | "green" | "blue" | "none";
export type ReviewAnnotation = { color?: HighlightColor; reviewedFor?: string; skip?: boolean };
export type ReviewAnnotations = Record<string, ReviewAnnotation>;
export type ReviewAction = { type: "review" } | { type: "color"; color: HighlightColor } | { type: "reset" };
/** A reviewed row becomes automatic again when its values or warning reasons change. */
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
export const reviewFingerprint = (values: Record<string, unknown>, reasons: readonly string[]) => JSON.stringify([canonical(values), [...reasons].sort()]);
export function rowAppearance(annotation: ReviewAnnotation | undefined, fingerprint: string, reasons: readonly string[]) {
  const reviewed = annotation?.reviewedFor === fingerprint;
  const color = annotation?.color ?? (reasons.length && !reviewed ? "yellow" : "none");
  return { color, reviewed, manual: annotation?.color !== undefined, label: annotation?.color !== undefined ? `Highlight: ${color}` : reviewed ? "Reviewed" : reasons.length ? "Needs review" : "No flags" };
}
export function annotateRows(current: ReviewAnnotations, rows: readonly { id: string; fingerprint: string }[], action: ReviewAction): ReviewAnnotations {
  const next = { ...current };
  for (const row of rows) {
    const annotation = { ...next[row.id] }; delete annotation.color; delete annotation.reviewedFor;
    if (action.type === "review") annotation.reviewedFor = row.fingerprint;
    if (action.type === "color") annotation.color = action.color;
    if (Object.keys(annotation).length) next[row.id] = annotation; else delete next[row.id];
  }
  return next;
}
