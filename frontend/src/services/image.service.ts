const IMAGE_URL_KEYS = [
  "url",
  "image_url",
  "imageUrl",
  "photo_url",
  "photoUrl",
  "public_url",
  "publicUrl",
  "signed_url",
  "signedUrl",
  "src",
] as const;

export const TRIP_IMAGE_FIELDS = [
  "truck_photo_url",
  "truckPhotoUrl",
  "truck_image_url",
  "truckImageUrl",
  "truck_photos",
  "truckPhotos",
  "truck_images",
  "truckImages",
  "photo_urls",
  "photoUrls",
  "photos",
  "images",
] as const;

export const PRODUCT_IMAGE_FIELDS = [
  "product_photo_url",
  "productPhotoUrl",
  "product_image_url",
  "productImageUrl",
  "image_url",
  "imageUrl",
  "photo_url",
  "photoUrl",
  "product_photos",
  "productPhotos",
  "product_images",
  "productImages",
  "photos",
  "images",
] as const;

function collectImageUrls(value: unknown): string[] {
  if (typeof value === "string") {
    const url = value.trim();
    return url ? [url] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectImageUrls);
  }

  if (typeof value !== "object" || value === null) return [];

  const image = value as Record<string, unknown>;
  return IMAGE_URL_KEYS.flatMap((key) => collectImageUrls(image[key]));
}

export function getRecordImageUrls(
  record: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  return [...new Set(fields.flatMap((field) => collectImageUrls(record[field])))];
}

export function getProductPhotoFallback(
  record: Record<string, unknown>,
): string {
  const description = [
    record.product_name,
    record.product_model,
    record.model_code,
    record.product_category,
    record.category,
    record.sku,
  ]
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();

  if (/refrigerator|fridge|freezer/.test(description)) {
    return "/images/appliances/refrigerator.jpg";
  }
  if (/washing machine|washer|laundry/.test(description)) {
    return "/images/appliances/washing-machine.jpg";
  }
  if (/television|smart.?tv|\btv\b|monitor|display/.test(description)) {
    return "/images/appliances/television.jpg";
  }
  if (/air.?condition|aircon|split.?type/.test(description)) {
    return "/images/appliances/air-conditioner.jpg";
  }
  if (/microwave/.test(description)) {
    return "/images/appliances/microwave.jpg";
  }
  return "/images/appliances/generic-appliance.jpg";
}
