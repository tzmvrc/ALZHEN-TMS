import type { ApiResponse } from "./api.service";

export type ProductPhoto = {
  product_id: string;
  file_name?: string;
  signed_url: string | null;
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

async function photoRequest<T>(
  productId: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl}/master-data/products/${encodeURIComponent(productId)}/photo`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    },
  );
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error(payload?.message ?? "Product photo request failed.");
  }
  return payload.data;
}

export const fetchProductPhoto = (productId: string, token: string) =>
  photoRequest<ProductPhoto>(productId, token);

export const uploadProductPhoto = (
  productId: string,
  token: string,
  file: File,
) =>
  photoRequest<ProductPhoto>(productId, token, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });

export const deleteProductPhoto = (productId: string, token: string) =>
  photoRequest<{ product_id: string }>(productId, token, { method: "DELETE" });
