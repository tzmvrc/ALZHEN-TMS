import { getAppSessionHeaders, handleSessionExpiredResponse } from "./api.service";

export type Photo = { url: string; alt: string };
export type Cargo = {
  id: string;
  name: string;
  imageUrl: string;
  imageAlt: string;
};
export type WebsiteRecord = {
  status?: "published" | "archived";
  id?: string;
  _revision?: number;
  _createdAt?: string;
  truckType?: string;
  otherTruckType?: string;
  name?: string;
  maxLoad?: string;
  dimensions?: string;
  volume?: string;
  images?: Photo[];
  commonCargos?: Cargo[];
  title?: string;
  content?: string;
  qualifications?: string;
  date?: string;
  imageUrl?: string;
};
export type Collection = "trucks" | "announcements" | "careers";
const base = `${(import.meta.env.VITE_API_URL || "http://localhost:5001/api").replace(/\/$/, "")}/website`;
async function request(
  path: string,
  token: string | null,
  options: RequestInit = {},
) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(token ? getAppSessionHeaders() : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) await handleSessionExpiredResponse(response.status, data, Boolean(token));
  if (!response.ok)
    throw new Error(
      data?.error ||
        data?.message ||
        "Unable to reach website content. Please try again.",
    );
  return data;
}
export async function listWebsiteContent(
  kind: Collection,
  token: string | null,
): Promise<WebsiteRecord[]> {
  return request(`/manage/${kind}`, token);
}
export async function saveWebsiteContent(
  kind: Collection,
  record: WebsiteRecord,
  token: string | null,
) {
  if (!token) throw new Error("Please sign in again.");
  return request(
    `/${kind}${record.id ? `/${encodeURIComponent(record.id)}` : ""}`,
    token,
    {
      method: record.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    },
  );
}
export async function deleteWebsiteContent(
  kind: Collection,
  record: WebsiteRecord,
  token: string | null,
) {
  if (!token || !record.id)
    throw new Error("Please sign in and select a record.");
  return request(
    `/${kind}/${encodeURIComponent(record.id)}?revision=${record._revision}`,
    token,
    { method: "DELETE" },
  );
}
export async function uploadWebsiteImage(
  file: File,
  token: string | null,
): Promise<string> {
  if (!token) throw new Error("Please sign in again.");
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Choose a JPEG, PNG, or WebP image up to 5 MB.");
  const result = await request("/media", token, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  return result.url;
}
