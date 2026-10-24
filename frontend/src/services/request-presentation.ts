import type {DispatchRequest} from "../types/requests";

export function newestPendingRequests(requests: readonly DispatchRequest[]) {
  return requests.filter(request=>request.status==="Pending")
    .sort((a,b)=>(Date.parse(b.receivedAt)||0)-(Date.parse(a.receivedAt)||0)).slice(0,3);
}
