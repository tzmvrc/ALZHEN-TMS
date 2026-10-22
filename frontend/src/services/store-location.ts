/** Match the database's case/whitespace normalization without merging punctuation. */
export const storeIdentityText = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const storeLocationKey = (values: Record<string, string | null>) => JSON.stringify([values.ship_to, values.province, values.city].map(storeIdentityText));
export const storeLocationLabel = (values: Record<string, string | null>) => [values.ship_to || "Unnamed destination", values.province || "Missing province", values.city || "Missing city"].join(" / ");
export const customerStoreKey = (values: Record<string, string | null>) => JSON.stringify([storeIdentityText(values.customer_name), storeLocationKey(values)]);
