import { supabaseAdmin } from "../config/supabase.js";
import type { Collection } from "./clientwebsite.validation.js";
const table = "website_content";
export async function listContent(collection: Collection, includeArchived = false) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id,data,revision,created_at")
    .eq("collection", collection)
    .order("created_at", { ascending: collection === "trucks" });
  if (error) throw error;
  return data.filter((row) => includeArchived || row.data.status !== "archived").map((row) => ({
    ...row.data,
    id: row.id,
    _revision: row.revision,
    _createdAt: row.created_at,
  }));
}
export async function createContent(collection: Collection, data: object) {
  const { data: row, error } = await supabaseAdmin
    .from(table)
    .insert({ collection, data })
    .select("id,data,revision,created_at")
    .single();
  if (error) throw error;
  return { ...row.data, id: row.id, _revision: row.revision, _createdAt: row.created_at };
}
export async function updateContent(
  collection: Collection,
  id: string,
  revision: number,
  data: object,
) {
  const { data: row, error } = await supabaseAdmin
    .from(table)
    .update({
      data,
      revision: revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("collection", collection)
    .eq("id", id)
    .eq("revision", revision)
    .select("id,data,revision,created_at")
    .maybeSingle();
  if (error) throw error;
  return row ? { ...row.data, id: row.id, _revision: row.revision, _createdAt: row.created_at } : null;
}
export async function deleteContent(
  collection: Collection,
  id: string,
  revision: number,
) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq("collection", collection)
    .eq("id", id)
    .eq("revision", revision)
    .select("id");
  if (error) throw error;
  return data.length > 0;
}

export async function getContent(collection: Collection, id: string) {
  const {data, error} = await supabaseAdmin.from(table).select("id,data,revision,created_at").eq("collection", collection).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
