/** Remove decimal padding without converting precise source strings to Number. */
export function cbmDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/^[+-]?\d+\.\d+$/.test(text.trim())) return text;
  return text.trim().replace(/0+$/, "").replace(/\.$/, "");
}

export function isCbmField(field: string): boolean {
  return field === "unitCbm" || /(^|_)cbm($|_)/.test(field);
}
