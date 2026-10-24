// src/pages/Admin/data/requestsStore.ts
//
// One shared place for dispatch requests, so the Requests page and the
// dashboard card always show the same data (approve on one, the other updates).
//
// Sample-only adapter. A future production integration must replace the local
// mutations with authorized APIs and connect the review modal to server-side
// validation and idempotent trip creation. Demo approval never creates trips.
import {editableRequestFields,validateRequestDraft} from "../../services/request-draft";
import { useSyncExternalStore } from "react";
import type { DispatchRequest, RequestStatus } from "../../types/requests";
import { homeDemoRequest } from "../../pages/Admin/data/homeDemoRequest";
import { defaultRequests } from "../../pages/Admin/data/defaultRequests";

type State = {
  requests: DispatchRequest[];
  /** Request opened in the shared review modal from Home or Requests. */
  selectedId: string | null;
  /** "sample" until the email automation feeds real requests. */
  source: "sample" | "live";
};

let state: State = {
  requests: [homeDemoRequest, ...defaultRequests],
  selectedId: null,
  source: "sample",
};
const originals=new Map(state.requests.map(request=>[request.id,structuredClone(request)]));
export function originalRequest(id:string){return structuredClone(originals.get(id));}
export function saveRequestDraft(draft:DispatchRequest){
  const current=state.requests.find(request=>request.id===draft.id);
  if(!current||current.status!=="Pending"||state.source!=="sample")return false;
  update({requests:state.requests.map(request=>request.id===draft.id?{...request,...editableRequestFields(draft)}:request)});
  return true;
}
const listeners = new Set<() => void>();

function update(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getSnapshot = () => state;

function message(body: string): DispatchRequest["messageThread"][number] {
  return {
    id: `msg-${crypto.randomUUID()}`,
    from: "You",
    body,
    at: new Date().toISOString(),
    self: true,
  };
}

export function selectRequest(id: string | null) {
  update({ selectedId: id });
}

export function setRequestStatus(id: string, status: RequestStatus, note?: string) {
  const current=state.requests.find(request=>request.id===id);
  if(!current||current.status!=="Pending"||state.source!=="sample"||status==="Approved"&&validateRequestDraft(current).length||status==="Declined"&&!note?.trim())return false;
  update({
    requests: state.requests.map((request) =>
      request.id === id
        ? {
            ...request,
            status,
            messageThread: note
              ? [...request.messageThread, message(note)]
              : request.messageThread,
          }
        : request,
    ),
  });
  return true;
}

export function sendRequestMessage(id: string, body: string) {
  update({
    requests: state.requests.map((request) =>
      request.id === id
        ? { ...request, messageThread: [...request.messageThread, message(body)] }
        : request,
    ),
  });
}

export function useRequests() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...snapshot,
    pending: snapshot.requests.filter((request) => request.status === "Pending"),
    select: selectRequest,
    setStatus: setRequestStatus,
    sendMessage: sendRequestMessage,
  };
}

/** For the sidebar badge: <Nav item badge={usePendingRequestCount()} /> */
export function usePendingRequestCount() {
  return useRequests().pending.length;
}
