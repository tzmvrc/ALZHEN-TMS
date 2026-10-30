import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { backfillDriverNotifications } from "./driver-notification.service.js";
import { randomUUID } from "node:crypto";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createMasterListEditNotifications(actorId:string,changes:Array<{scope:string;id:string;field:string}>,saved:number){
  if(saved<1||!changes.length)return;
  const first=changes[0];
  let tripId:string|undefined;
  if(first.scope==="dispatch"){
    const query=supabaseAdmin.from("trips").select("id").is("archived_at",null).limit(1);
    const result=uuidPattern.test(first.id)?await query.eq("id",first.id):await query.eq("dispatch_number",first.id);
    if(result.error)throw result.error;
    tripId=result.data?.[0]?.id;
  }else if(first.scope==="dr"||first.scope==="line"){
    const table=first.scope==="dr"?"trip_stops":"trip_line_items";
    const result=await supabaseAdmin.from(table).select("trip_id").eq("id",first.id).maybeSingle();
    if(result.error)throw result.error;
    tripId=result.data?.trip_id;
  }
  if(!tripId)return;
  const [tripResult,profilesResult]=await Promise.all([
    supabaseAdmin.from("trips").select("id,dispatch_number").eq("id",tripId).maybeSingle(),
    supabaseAdmin.from("profiles").select("id,first_name,last_name,role").in("role",["ADMIN","STAFF"]),
  ]);
  if(tripResult.error||profilesResult.error)throw tripResult.error??profilesResult.error;
  if(!tripResult.data)return;
  const profiles=profilesResult.data??[],actor=profiles.find(profile=>profile.id===actorId);
  const actorName=[actor?.first_name,actor?.last_name].filter(Boolean).join(" ")||"A teammate";
  const recipients=profiles;
  if(!recipients.length)return;
  const dispatch=String(tripResult.data.dispatch_number??"").trim();
  const fieldNames=[...new Set(changes.map(change=>change.field.replaceAll("_"," ")))].slice(0,3);
  const fields=fieldNames.join(", ");
  const eventKey=randomUUID();
  const payload=recipients.map(profile=>({
    recipient_profile_id:profile.id,actor_profile_id:actorId,notification_type:"master_list_edit",
    reference_type:"trip",reference_id:tripId,trip_id:tripId,event_key:eventKey,
    message:`${actorName}${profile.id===actorId?" (you)":""} saved ${saved} Master List ${saved===1?"change":"changes"}${dispatch?` in dispatch ${dispatch}`:""}${fields?` (${fields})`:""}.`,
    metadata:{report_key:"combined",master_list:true,dispatch_number:dispatch||null,actor_name:actorName,actor_is_recipient:profile.id===actorId,change_count:saved,changed_fields:fieldNames,changed_cells:changes.slice(0,20).map(change=>({scope:change.scope,id:change.id,field:change.field}))},
  }));
  const inserted=await supabaseAdmin.from("admin_notifications").upsert(payload,{onConflict:"recipient_profile_id,event_key",ignoreDuplicates:true});
  if(inserted.error)throw inserted.error;
}

async function getStoreCallDispatchNumber(storeCallId: string) {
  const { data, error } = await supabaseAdmin
    .from("v_store_calling")
    .select("dispatch_number")
    .eq("store_call_id", storeCallId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Store-call notification dispatch context could not be loaded:", error.message);
    return "";
  }
  return typeof data?.dispatch_number === "string" ? data.dispatch_number : "";
}

export async function listNotifications(recipientId: string, role?: string) {
  if (role === "ADMIN" || role === "STAFF") {
    try { await backfillDriverNotifications(recipientId); }
    catch (error) { console.warn("Driver notification recovery unavailable:", error instanceof Error ? error.message : error); }
  }
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabaseAdmin.from("admin_notifications").select("id, actor_profile_id, notification_type, reference_type, reference_id, message, metadata, read_at, created_at").eq("recipient_profile_id", recipientId).order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("admin_notifications").select("id", { count: "exact", head: true }).eq("recipient_profile_id", recipientId).is("read_at", null),
  ]);
  if (error || countError) throw new ApiError("Unable to load notifications", 500, "NOTIFICATIONS_QUERY_FAILED");
  const notifications = data ?? [];
  const storeCallIds = [...new Set(notifications
    .filter((item) => item.reference_type === "store_call")
    .map((item) => item.reference_id))];
  let dispatchNumbers = new Map<string, string>();
  if (storeCallIds.length) {
    const { data: contexts, error: contextError } = await supabaseAdmin
      .from("v_store_calling")
      .select("store_call_id, dispatch_number")
      .in("store_call_id", storeCallIds);
    if (!contextError) {
      dispatchNumbers = new Map((contexts ?? []).flatMap((context) =>
        typeof context.store_call_id === "string" && typeof context.dispatch_number === "string"
          ? [[context.store_call_id, context.dispatch_number] as const]
          : [],
      ));
    }
  }
  return {
    notifications: notifications.map((item) => {
      const dispatchNumber = dispatchNumbers.get(item.reference_id);
      return dispatchNumber
        ? { ...item, metadata: { ...item.metadata, dispatch_number: dispatchNumber } }
        : item;
    }),
    unreadCount: count ?? 0,
  };
}

export async function markNotificationRead(recipientId: string, notificationId: string) {
  if (!uuidPattern.test(notificationId)) throw new ApiError("Invalid notification id", 400, "INVALID_ID");
  const { data, error } = await supabaseAdmin.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId).eq("recipient_profile_id", recipientId).is("read_at", null).select("id, read_at").maybeSingle();
  if (error) throw new ApiError("Unable to update notification", 500, "NOTIFICATION_UPDATE_FAILED");
  return data;
}

export async function markAllNotificationsRead(recipientId: string) {
  const readAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("admin_notifications")
    .update({ read_at: readAt })
    .eq("recipient_profile_id", recipientId)
    .is("read_at", null)
    .select("id, read_at");
  if (error) throw new ApiError("Unable to update notifications", 500, "NOTIFICATION_UPDATE_FAILED");
  return { notifications: data ?? [], read_at: readAt };
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
    dispatch = await getStoreCallDispatchNumber(String(referenceId));
  }
  const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id, first_name, role").in("id", recipients).in("role", ["ADMIN", "STAFF"]);
  if (profileError) throw new ApiError("Unable to verify mention recipients", 500, "MENTION_LOOKUP_FAILED");
  const eligible: string[] = [];
  for (const profile of profiles ?? []) {
    const { data: authUser, error } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (error) throw new ApiError("Unable to verify mention recipients", 500, "MENTION_LOOKUP_FAILED");
    if (authUser.user && !authUser.user.banned_until && !("deleted_at" in authUser.user && authUser.user.deleted_at)) eligible.push(profile.id);
  }
  if (eligible.length !== recipients.length) {
    throw new ApiError("A selected user is no longer eligible for mentions", 400, "INVALID_MENTION_RECIPIENT");
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
      metadata: {
        report_key: "store-calling",
        event_kind: "assignment",
        dispatch_number: await getStoreCallDispatchNumber(referenceId) || null,
      },
      event_key: String(eventKey),
    }, { onConflict: "recipient_profile_id,event_key", ignoreDuplicates: true });
    if (error) throw error;
    return null;
  } catch (error) {
    console.error("Store-call assignment notification failed after update:", error);
    return "The store call was saved, but the assignment notification could not be created.";
  }
}
