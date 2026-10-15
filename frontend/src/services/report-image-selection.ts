export const MAX_OFFLOAD_IMAGES = 5;
export const MAX_REPORT_IMAGE_BYTES = 5 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateReportImage(file: Pick<File, "name" | "size" | "type">): string | null {
  if (!imageTypes.has(file.type)) return `${file.name}: choose a JPEG, PNG, or WebP image.`;
  if (file.size <= 0 || file.size > MAX_REPORT_IMAGE_BYTES) return `${file.name}: images must be nonempty and no larger than 5 MB.`;
  return null;
}

/** Keep valid selections when one file fails; report every rejected file. */
export function selectReportImages(existing: readonly File[], candidates: readonly File[], maximum: number) {
  const files = [...existing];
  const errors: string[] = [];
  const identity = (file: File) => JSON.stringify([file.name, file.type, file.size, file.lastModified]);
  const seen = new Set(files.map(identity));
  for (const file of candidates) {
    const error = validateReportImage(file);
    if (error) { errors.push(error); continue; }
    if (seen.has(identity(file))) continue;
    if (files.length >= maximum) { errors.push(`${file.name}: a report can have up to ${maximum} images.`); continue; }
    files.push(file);
    seen.add(identity(file));
  }
  return { files, errors };
}
