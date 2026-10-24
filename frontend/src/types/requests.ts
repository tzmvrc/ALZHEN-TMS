// src/types/requests.ts
export type RequestStatus = "Pending" | "Approved" | "Declined";
export type RequestPriority = "High" | "Normal" | "Low";

export interface RequestLineItem {
  id: string;
  dr?: string;
  dn?: string;
  soNo?: string;
  sapSoNo?: string;
  customerName: string;
  shipTo: string;
  province?: string;
  city?: string;
  address?: string;
  customerPo?: string;
  productCategory?: "AC" | "REF" | "WM" | "TV" | "SBAR" | string;
  customerModel: string;
  qty: number;
  unitCbm?: number;
  totalCbm?: number;
}

export interface DispatchRequest {
  demo?: boolean;
  emailSubject?: string;
  id: string;
  reference: string; // "Davao Trip 1"
  region: "Davao" | "CDO" | "Cebu" | "Luzon";
  fromEmail: string;
  fromName: string;
  receivedAt: string; // ISO
  status: RequestStatus;
  priority: RequestPriority;
  warehouse: string;
  truckAssignment?: string;
  courier?: string;
  dispatchDate?: string;
  deliveryDate?: string;
  remarks?: string;
  amount?: string;
  items: RequestLineItem[];
  messageThread: RequestMessage[];
}

export interface RequestMessage {
  id: string;
  from: string;
  body: string;
  at: string;
  self?: boolean;
}