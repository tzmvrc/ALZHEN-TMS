/** Independent delivery values; never copy product line-item totals here. */
export function normalizeTransactionNumber(value: unknown, field: "quantity" | "total_cbm"): number | null {
  if (value === null || value === "") return null;
  const text = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  const scale = field === "quantity" ? 3 : 6;
  const integerDigits = 18 - scale;
  if (!new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,${scale}})?$`).test(text) || !Number.isFinite(Number(text))) {
    throw new Error(`${field} must be a non-negative number with at most ${scale} decimal places.`);
  }
  const number = Number(text);
  const canonical = text.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (String(number) !== canonical) throw new Error(`${field} has more precision than this API can safely preserve.`);
  return number;
}
