import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listNotifications(recipientId: string) {
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabaseAdmin.from("admin_notifications").select("id, actor_profile_id, notification_type, reference_type, reference_id, message, metadata, read_at, created_at").eq("recipient_profile_id", recipientId).order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("admin_notifications").select("id", { count: "exact", head: true }).eq("recipient_profile_id", recipientId).is("read_at", null),
  ]);
  if (error || countError) throw new ApiError("Unable to load notifications", 500, "NOTIFICATIONS_QUERY_FAILED");
  return { notifications: data ?? [], unreadCount: count ?? 0 };
}

export async function markNotificationRead(recipientId: string, notificationId: string) {
  if (!uuidPattern.test(notificationId)) throw new ApiError("Invalid notification id", 400, "INVALID_ID");
  const { data, error } = await supabaseAdmin.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId).eq("recipient_profile_id", recipientId).is("read_at", null).select("id, read_at").maybeSingle();
  if (error) throw new ApiError("Unable to update notification", 500, "NOTIFICATION_UPDATE_FAILED");
  return data;
}

export async function createReportMentionNotifications(input: {
  actorId: string;
  recipientIds: unknown;
  referenceType: unknown;
  referenceId: unknown;
  reportKey: unknown;
  eventKey: unknown;
  recordLabel: unknown;
}) {
  const { actorId, recipientIds, referenceType, referenceId, reportKey, eventKey, recordLabel } = input;
  if (!Array.isArray(recipientIds) || !recipientIds.every((id) => typeof id === "string" && uuidPattern.test(id)) || !uuidPattern.test(String(referenceId)) || !uuidPattern.test(String(eventKey))) {
    throw new ApiError("Invalid mention notification details", 400, "INVALID_MENTION");
  }
  if (!(["combined", "dispatch-monitoring", "dispatch", "trip-booking", "store-calling"] as unknown[]).includes(reportKey)) {
    throw new ApiError("Invalid report reference", 400, "INVALID_MENTION");
  }
  if (referenceType !== "trip" && referenceType !== "store_call") throw new ApiError("Invalid record reference", 400, "INVALID_MENTION");
  if ((referenceType === "trip" && reportKey === "store-calling") || (referenceType === "store_call" && reportKey !== "store-calling")) {
    throw new ApiError("Report and record reference do not match", 400, "INVALID_MENTION");
  }
  const recipients = [...new Set(recipientIds as string[])].filter((id) => id !== actorId);
  if (!recipients.length) return { created: 0 };

  let dispatch = "";
  if (referenceType === "trip") {
    const { data: trip, error: tripError } = await supabaseAdmin.from("trips").select("id, dispatch_number").eq("id", referenceId).maybeSingle();
    if (tripError || !trip) throw new ApiError("Trip reference was not found", 404, "TRIP_NOT_FOUND");
    dispatch = String(trip.dispatch_number ?? "").trim();
  } else {
    const { data: storeCall, error } = await supabaseAdmin.from("store_calls").select("id").eq("id", referenceId).maybeSingle();
    if (error || !storeCall) throw new ApiError("Store call reference was not found", 404, "STORE_CALL_NOT_FOUND");
  }
  const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id, first_name, role").in("id", recipients).eq("role", "ADMIN");
  if (profileError) throw new ApiError("Unable to verify mentioned admins", 500, "MENTION_LOOKUP_FAILED");
  const eligible: string[] = [];
  for (const profile of profiles ?? []) {
    const { data: authUser, error } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (error) throw new ApiError("Unable to verify mentioned admins", 500, "MENTION_LOOKUP_FAILED");
    if (authUser.user && !authUser.user.banned_until && !("deleted_at" in authUser.user && authUser.user.deleted_at)) eligible.push(profile.id);
  }
  if (eligible.length !== recipients.length) {
    throw new ApiError("A selected admin is no longer eligible for mentions", 400, "INVALID_MENTION_RECIPIENT");
  }
  const actorQuery = await supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", actorId).maybeSingle();
  if (actorQuery.error) throw new ApiError("Unable to identify notification actor", 500, "MENTION_ACTOR_LOOKUP_FAILED");
  const actorName = [actorQuery.data?.first_name, actorQuery.data?.last_name].filter(Boolean).join(" ") || "An admin";
  const label = typeof recordLabel === "string" ? recordLabel.slice(0, 100) : "a report note";
  const payload = eligible.map((recipientId) => ({
    recipient_profile_id: recipientId,
    actor_profile_id: actorId,
    notification_type: "report_mention",
    reference_type: referenceType,
    reference_id: String(referenceId),
    message: `${actorName} mentioned you in ${label}${dispatch ? ` for dispatch ${dispatch}` : ""}.`,
    metadata: { report_key: reportKey, dispatch_number: dispatch || null },
    event_key: String(eventKey),
  }));
  if (!payload.length) return { created: 0 };
  const { data, error } = await supabaseAdmin.from("admin_notifications").upsert(payload, { onConflict: "recipient_profile_id,event_key", ignoreDuplicates: true }).select("id");
  if (error) throw new ApiError("Unable to create mention notifications", 500, "NOTIFICATION_CREATE_FAILED");
  return { created: data?.length ?? 0 };
}

export async function notifyMentionAfterRemarksSave(input: {
  actorId: string;
  referenceType: "trip" | "store_call";
  referenceId: string;
  remarks: unknown;
  mention: unknown;
}): Promise<string | null> {
  if (typeof input.remarks !== "string" || !input.mention || typeof input.mention !== "object") return null;
  const mention = input.mention as Record<string, unknown>;
  try {
    await createReportMentionNotifications({
      actorId: input.actorId,
      recipientIds: mention.recipientIds,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      reportKey: mention.reportKey,
      eventKey: mention.eventKey,
      recordLabel: mention.recordLabel,
    });
    return null;
  } catch (error) {
    console.error("Mention notification failed after remarks save:", error);
    return "Remarks were saved, but the mention notification could not be created.";
  }
}

export async function notifyStoreCallAssigneeAfterUpdate(input: {
  actorId: string;
  recipientId: unknown;
  referenceId: string;
  eventKey: unknown;
}): Promise<string | null> {
  const { actorId, recipientId, referenceId, eventKey } = input;
  if (typeof recipientId !== "string" || !uuidPattern.test(recipientId) || !uuidPattern.test(referenceId) || !uuidPattern.test(String(eventKey))) {
    return "The store call was saved, but its assignment notification could not be created.";
  }
  if (recipientId === actorId) return null;

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, first_name, last_name")
      .eq("id", recipientId)
      .eq("role", "ADMIN")
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error("Recipient is not an admin profile.");

    const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.getUserById(recipientId);
    if (authError) throw authError;
    const authUser = authResult.user;
    if (!authUser || authUser.banned_until || ("deleted_at" in authUser && authUser.deleted_at)) {
      throw new Error("Recipient is not an active account.");
    }

    const { data: actor, error: actorError } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", actorId)
      .maybeSingle();
    if (actorError) throw actorError;
    const actorName = [actor?.first_name, actor?.last_name].filter(Boolean).join(" ") || "An admin";

    // The applied schema constrains notification_type to report_mention. The
    // metadata event_kind distinguishes assignment notifications safely.
    const { error } = await supabaseAdmin.from("admin_notifications").upsert({
      recipient_profile_id: recipientId,
      actor_profile_id: actorId,
      notification_type: "report_mention",
      reference_type: "store_call",
      reference_id: referenceId,
      message: `${actorName} assigned you to a Store Calling record.`,
      metadata: { report_key: "store-calling", event_kind: "assignment" },
      event_key: String(eventKey),
    }, { onConflict: "recipient_profile_id,event_key", ignoreDuplicates: true });
    if (error) throw error;
    return null;
  } catch (error) {
    console.error("Store-call assignment notification failed after update:", error);
    return "The store call was saved, but the assignment notification could not be created.";
  }
}
