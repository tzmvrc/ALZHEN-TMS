// src/pages/Admin/data/requestsStore.ts
//
// One shared place for dispatch requests, so the Requests page and the
// dashboard card always show the same data (approve on one, the other updates).
//
// TODO(email automation): this is the only file that needs to change when the
// email-to-system automation goes live. Replace `defaultRequests` with the
// API response (fetch on mount / poll / realtime), and make `setRequestStatus`
// and `sendRequestMessage` call your backend before updating local state.
import { useSyncExternalStore } from "react";
import type { DispatchRequest, RequestStatus } from "../../types/requests";
import { homeDemoRequest } from "../../pages/Admin/data/homeDemoRequest";
import { defaultRequests } from "../../pages/Admin/data/defaultRequests";

type State = {
  requests: DispatchRequest[];
  /** Request opened in the Requests page (also set from the dashboard card). */
  selectedId: string | null;
  /** "sample" until the email automation feeds real requests. */
  source: "sample" | "live";
};

let state: State = {
  requests: [homeDemoRequest, ...defaultRequests],
  selectedId: null,
  source: "sample",
};
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
    id: `msg-${Date.now()}`,
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