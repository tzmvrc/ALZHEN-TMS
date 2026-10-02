export type Collection = "trucks" | "announcements" | "careers";
export class ContentInputError extends Error {}
const fail = (message: string): never => {
  throw new ContentInputError(message);
};
const text = (
  v: unknown,
  label: string,
  max: number,
  required = true,
): string => {
  if (typeof v !== "string") {
    if (!required && v == null) return "";
    return fail(`${label} must be text.`);
  }
  const result = v.trim();
  if ((required && !result) || result.length > max)
    fail(`${label} is required and must be at most ${max} characters.`);
  return result;
};
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    return fail("Invalid content record.");
  return v as Record<string, unknown>;
};
const url = (v: unknown, required = false) => {
  const value = text(v, "Image URL", 2048, required);
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      fail("Use an HTTP or HTTPS image URL.");
  } catch {
    fail("Use an HTTP or HTTPS image URL.");
  }
  return value;
};
export function validateContent(collection: Collection, input: unknown) {
  const v = object(input);
  if (v.status !== undefined && v.status !== "published" && v.status !== "archived") fail("Choose a valid status.");
  if (collection === "announcements" || collection === "careers") {
    const date = text(v.date, "Date", 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      fail("Enter a valid date.");
    return {
      status: v.status || "published",
      title: text(v.title, "Title", 160),
      content: text(v.content, "Content", 12000),
      date,
      ...(collection === "careers" ? { qualifications: text(v.qualifications, "Qualifications", 12000) } : { imageUrl: url(v.imageUrl) }),
    };
  }
  const truckType = text(v.truckType, "Truck type", 20);
  const names: Record<string, string> = {
    "10W": "10-Wheeler Wing Van",
    "12W": "12-Wheeler Wing Van",
    "6W": "6-Wheeler Closed Van",
    L300: "L300 Van",
    OTHER: "Other",
  };
  if (!names[truckType]) fail("Choose a valid truck type.");
  const otherTruckType =
    truckType === "OTHER"
      ? text(v.otherTruckType, "Other truck type", 100)
      : "";
  if (!Array.isArray(v.images) || v.images.length < 1 || v.images.length > 3)
    fail("Add between one and three truck photos.");
  const images = (v.images as unknown[]).map((image) => {
    const p = object(image);
    return {
      url: url(p.url, true),
      alt: text(p.alt, "Photo description", 200, false),
    };
  });
  if (!Array.isArray(v.commonCargos) || v.commonCargos.length > 24)
    fail("Use at most 24 common cargos.");
  const ids = new Set<string>();
  const commonCargos = (v.commonCargos as unknown[]).map((cargo) => {
    const c = object(cargo),
      id = text(c.id, "Cargo ID", 100);
    if (ids.has(id)) fail("Cargo IDs must be unique.");
    ids.add(id);
    return {
      id,
      name: text(c.name, "Cargo name", 100),
      imageUrl: url(c.imageUrl),
      imageAlt: text(c.imageAlt, "Cargo photo description", 200, false),
    };
  });
  return {
    status: v.status || "published",
    truckType,
    otherTruckType,
    name: otherTruckType || names[truckType],
    maxLoad: text(v.maxLoad, "Maximum load", 100),
    dimensions: text(v.dimensions, "Dimensions", 150),
    volume: text(v.volume, "Volume", 100, false),
    images,
    commonCargos,
  };
}
export function imageMime(bytes: Buffer): string | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}
