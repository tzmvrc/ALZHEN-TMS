const words = value => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Add geography once, preserving the user's full address and its original spelling. */
export function deliveryLocationQuery(query, city, province) {
  const parts = [query.trim().replace(/\s+/g, " ")];
  for (const part of [city, province, "Philippines"]) {
    const normalizedPart = words(part.replace(/\b(?:province|city|of)\b/gi, ""));
    if (normalizedPart && !(` ${words(parts.join(" "))} `).includes(` ${normalizedPart} `)) parts.push(part.trim());
  }
  return parts.filter(Boolean).join(", ");
}
export const locationGeography = value => words(value.replace(/\b(?:province|city|of)\b/gi, "")).replace(/ /g, "");
/** Supplied geography is a constraint; absent provider geography remains reviewable. */
export function rankDeliveryLocations(candidates, province, city) {
  const match = (values, expected, address) => !expected || (values?.length ? values.some(value => locationGeography(value) === locationGeography(expected)) : locationGeography(address).includes(locationGeography(expected)));
  return candidates.filter(candidate => (!candidate.country_code || candidate.country_code.toLowerCase() === "ph")
    && match(candidate.provinces, province, candidate.display_name) && match(candidate.cities, city, candidate.display_name))
    .map((candidate, index) => ({ candidate, index, score: Number(candidate.provinces?.some(value => locationGeography(value) === locationGeography(province))) + Number(candidate.cities?.some(value => locationGeography(value) === locationGeography(city))) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.candidate);
}
