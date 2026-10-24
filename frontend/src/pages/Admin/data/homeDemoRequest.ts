import type { DispatchRequest } from "../../../types/requests";

export const HOME_DEMO_REQUEST_ID = "demo-home-email-20261024";
const received = new Date();
const loading = new Date(received.getTime() + 86400000);
const loadingDay = loading.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** Frontend-only email example. Never submitted to an API or email service. */
export const homeDemoRequest: DispatchRequest = {
  id: HOME_DEMO_REQUEST_ID,
  demo: true,
  emailSubject: "[DEMO] Trip request - Valenzuela to North EDSA / Ermita",
  reference: "DEMO Email - Metro Manila appliance delivery",
  region: "Luzon",
  fromName: "DEMO Appliance Distribution PH - Dispatch",
  fromEmail: "dispatch@example.invalid",
  receivedAt: received.toISOString(),
  status: "Pending",
  priority: "Normal",
  warehouse: "DEMO Valenzuela consolidation warehouse",
  dispatchDate: loadingDay,
  deliveryDate: loadingDay,
  courier: "DEMO ALZHEN Logistics",
  remarks: "DEMO ONLY. Requested loading: 06:00 PHT. Deliver North EDSA first, then Ermita. Covered Wing Van required; bring two helpers, protect appliance cartons from rain, call each receiving desk before arrival. Review actions change local sample state only; no trip is created and no email is sent.",
  items: [
    { id: "demo-email-line-1", customerName: "DEMO Appliance Distribution PH", shipTo: "DEMO North EDSA receiving point", city: "Quezon City", province: "Metro Manila", address: "North Avenue / EDSA area", productCategory: "REF", customerModel: "DEMO 320L refrigerator", qty: 10, unitCbm: 0.72, totalCbm: 7.2 },
    { id: "demo-email-line-2", customerName: "DEMO Appliance Distribution PH", shipTo: "DEMO North EDSA receiving point", city: "Quezon City", province: "Metro Manila", productCategory: "TV", customerModel: "DEMO 55-inch television", qty: 20, unitCbm: 0.18, totalCbm: 3.6 },
    { id: "demo-email-line-3", customerName: "DEMO Appliance Distribution PH", shipTo: "DEMO Ermita receiving point", city: "Manila", province: "Metro Manila", address: "Robinsons Place Manila area", productCategory: "REF", customerModel: "DEMO 320L refrigerator", qty: 8, unitCbm: 0.72, totalCbm: 5.76 },
    { id: "demo-email-line-4", customerName: "DEMO Appliance Distribution PH", shipTo: "DEMO Ermita receiving point", city: "Manila", province: "Metro Manila", productCategory: "WM", customerModel: "DEMO 9kg washing machine", qty: 12, unitCbm: 0.42, totalCbm: 5.04 },
  ],
  messageThread: [{ id: "demo-email-message-1", from: "DEMO customer email", at: received.toISOString(), body: "This is a frontend demonstration of an incoming email, not a received message. Please review the requested Wing Van delivery: 50 units / 21.60 CBM, Valenzuela to North EDSA and Ermita. No automation or production posting is connected." }],
};
