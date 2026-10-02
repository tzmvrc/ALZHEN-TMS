import type { DropdownField } from "./dropdown-option.service";
import type { RelationshipKind } from "./lookup.service";
import type { ReportKey } from "./report.service";

export type ReportEditTarget =
  | "trip"
  | "stop"
  | "lineItem"
  | "assignment"
  | "storeCall";
export type ReportEditor =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "status"
  | "relationship";

export type ReportEditDefinition = {
  label: string;
  sourceEntity: ReportEditTarget;
  sourceField: string;
  editor: ReportEditor;
  recordIdField: string;
  required?: boolean;
  dropdownField?: DropdownField;
  relationship?: {
    kind: RelationshipKind;
    idField: string;
    labelField: string;
    storeIdField?: string;
  };
};

const tripStatus: ReportEditDefinition = {
  label: "Trip Status",
  sourceEntity: "trip",
  sourceField: "status",
  editor: "status",
  recordIdField: "trip_id",
  dropdownField: "trip_status",
};
const deliveryStatus: ReportEditDefinition = {
  label: "Delivery Status",
  sourceEntity: "stop",
  sourceField: "delivery_status",
  editor: "status",
  recordIdField: "trip_stop_id",
  dropdownField: "delivery_status",
};
const letterStatus: ReportEditDefinition = {
  label: "Letter Status",
  sourceEntity: "trip",
  sourceField: "letter_status",
  editor: "status",
  recordIdField: "trip_id",
  dropdownField: "letter_status",
};
const tripType: ReportEditDefinition = {
  label: "Trip Type",
  sourceEntity: "trip",
  sourceField: "trip_type_id",
  editor: "relationship",
  recordIdField: "trip_id",
  relationship: {
    kind: "trip-types",
    idField: "trip_type_id",
    labelField: "trip_type",
  },
};
const warehouse: ReportEditDefinition = {
  label: "Warehouse",
  sourceEntity: "trip",
  sourceField: "warehouse_id",
  editor: "relationship",
  recordIdField: "trip_id",
  relationship: {
    kind: "warehouses",
    idField: "warehouse_id",
    labelField: "warehouse_name",
  },
};
const truckingCompany: ReportEditDefinition = {
  label: "Trucking Company",
  sourceEntity: "assignment",
  sourceField: "trucking_company_id",
  editor: "relationship",
  recordIdField: "assignment_id",
  relationship: {
    kind: "trucking-companies",
    idField: "trucking_company_id",
    labelField: "trucker_gc_name",
  },
};
const driver: ReportEditDefinition = {
  label: "Driver",
  sourceEntity: "assignment",
  sourceField: "driver_id",
  editor: "relationship",
  recordIdField: "assignment_id",
  relationship: {
    kind: "drivers",
    idField: "driver_id",
    labelField: "driver_name",
  },
};
const truck: ReportEditDefinition = {
  label: "Truck / Plate",
  sourceEntity: "assignment",
  sourceField: "truck_id",
  editor: "relationship",
  recordIdField: "assignment_id",
  relationship: {
    kind: "trucks",
    idField: "truck_id",
    labelField: "plate_number",
  },
};
const customer: ReportEditDefinition = {
  label: "Customer",
  sourceEntity: "stop",
  sourceField: "customer_id",
  editor: "relationship",
  recordIdField: "trip_stop_id",
  relationship: {
    kind: "customers",
    idField: "customer_id",
    labelField: "customer_name",
  },
};
const store: ReportEditDefinition = {
  label: "Store",
  sourceEntity: "stop",
  sourceField: "store_id",
  editor: "relationship",
  recordIdField: "trip_stop_id",
  relationship: {
    kind: "stores",
    idField: "store_id",
    labelField: "store_name",
  },
};
const lineProduct: ReportEditDefinition = {
  label: "Product",
  sourceEntity: "lineItem",
  sourceField: "product_id",
  editor: "relationship",
  recordIdField: "trip_line_item_id",
  relationship: {
    kind: "products",
    idField: "product_id",
    labelField: "product_name",
  },
};
const profileField = (
  label: string,
  sourceField: string,
  labelField: string,
): ReportEditDefinition => ({
  label,
  sourceEntity: "trip",
  sourceField,
  editor: "relationship",
  recordIdField: "trip_id",
  relationship: {
    kind: "assignees",
    idField: sourceField,
    labelField,
  },
});

function tripField(
  label: string,
  sourceField: string,
  editor: "text" | "number" | "date" | "datetime" | "boolean" = "text",
  required = false,
): ReportEditDefinition {
  return {
    label,
    sourceEntity: "trip",
    sourceField,
    editor,
    recordIdField: "trip_id",
    required,
  };
}

function stopField(
  label: string,
  sourceField: string,
  editor: "text" | "date" = "text",
): ReportEditDefinition {
  return {
    label,
    sourceEntity: "stop",
    sourceField,
    editor,
    recordIdField: "trip_stop_id",
  };
}

function lineItemField(
  label: string,
  sourceField: string,
  editor: "text" | "number" = "text",
): ReportEditDefinition {
  return {
    label,
    sourceEntity: "lineItem",
    sourceField,
    editor,
    recordIdField: "trip_line_item_id",
  };
}

function storeCallField(
  label: string,
  sourceField: string,
  editor: "text" | "date" = "text",
): ReportEditDefinition {
  return {
    label,
    sourceEntity: "storeCall",
    sourceField,
    editor,
    recordIdField: "store_call_id",
  };
}

const tripScalars: Record<string, ReportEditDefinition> = {
  dispatch_number: tripField(
    "Dispatch Number",
    "dispatch_number",
    "text",
    true,
  ),
  transaction_number: tripField("Transaction Number", "transaction_number"),
  trip_number: tripField("Trip Number", "trip_number"),
  loading_date: tripField("Loading Date", "loading_date", "date"),
  estimated_delivery_date: tripField(
    "Estimated Delivery Date",
    "estimated_delivery_date",
    "date",
  ),
  trip_remarks: tripField("Trip Remarks", "remarks"),
  subcon_rate_manual: tripField(
    "Subcontractor Rate",
    "subcon_rate_manual",
    "number",
  ),
  added_to_report: tripField("Added to Report", "added_to_report", "boolean"),
  signed_dr_upload_date: tripField(
    "Signed DR Upload Date",
    "signed_dr_upload_date",
    "date",
  ),
  transmittal_date: tripField("Transmittal Date", "transmittal_date", "date"),
  tms_date: tripField("TMS Date", "tms_date", "date"),
  pod_ac_shipping_date: tripField(
    "POD AC Shipping Date",
    "pod_ac_shipping_date",
    "date",
  ),
  request_received_at: tripField(
    "Request Received At",
    "request_received_at",
    "datetime",
  ),
  departure_from_warehouse_at: tripField(
    "Warehouse Departure",
    "departure_from_warehouse_at",
    "datetime",
  ),
  lbc_tracking_number: tripField("LBC Tracking Number", "lbc_tracking_number"),
  page_no: tripField("Page Number", "page_no", "number"),
};

const stopScalars: Record<string, ReportEditDefinition> = {
  arrival_time: {
    ...stopField("Arrival Time", "arrival_time", "date"),
    editor: "datetime",
  },
  start_unloading_time: {
    ...stopField("Start Unloading", "start_unloading_time", "date"),
    editor: "datetime",
  },
  finish_unloading_time: {
    ...stopField("Finish Unloading", "finish_unloading_time", "date"),
    editor: "datetime",
  },
  departure_time: {
    ...stopField("Departure Time", "departure_time", "date"),
    editor: "datetime",
  },
  stop_remarks: stopField("Stop Remarks", "remarks"),
};

const lineItemScalars: Record<string, ReportEditDefinition> = {
  dr_number: lineItemField("DR Number", "dr_number"),
  sap_so_number: lineItemField("SAP SO Number", "sap_so_number"),
  customer_po_number: lineItemField("Customer PO Number", "customer_po_number"),
  internal_po_number: lineItemField("Internal PO Number", "internal_po_number"),
  customer_model: lineItemField("Customer Model", "customer_model"),
  quantity: lineItemField("Quantity", "quantity", "number"),
  cbm: lineItemField("CBM", "cbm", "number"),
  item_remarks: lineItemField("Item Remarks", "remarks"),
};

const storeCallScalars: Record<string, ReportEditDefinition> = {
  assigned_to: {
    label: "Assigned To",
    sourceEntity: "storeCall",
    sourceField: "assigned_to",
    editor: "relationship",
    recordIdField: "store_call_id",
    relationship: {
      kind: "assignees",
      idField: "assigned_to_id",
      labelField: "assigned_to_name",
    },
  },
  contact_name: {
    label: "Contact",
    sourceEntity: "storeCall",
    sourceField: "contact_id",
    editor: "relationship",
    recordIdField: "store_call_id",
    relationship: {
      kind: "store-contacts",
      idField: "contact_id",
      labelField: "contact_name",
      storeIdField: "store_id",
    },
  },
  contact_number: storeCallField("Contact Number", "contact_number"),
  date_assigned: storeCallField("Date Assigned", "date_assigned", "date"),
  date_of_contact: storeCallField("Date of Contact", "date_of_contact", "date"),
  store_call_remarks: storeCallField("Store Call Remarks", "remarks"),
};

const commonTrip: Record<string, ReportEditDefinition> = {
  ...tripScalars,
  trip_status: tripStatus,
  letter_status: letterStatus,
  trip_type: tripType,
  trip_type_name: tripType,
  warehouse_name: warehouse,
  warehouse_code: warehouse,
  wh_code: warehouse,
  ship_from: warehouse,
  driver_name: driver,
  plate_number: truck,
  trucker_gc_name: truckingCompany,
  trucking_company: truckingCompany,
  truck_allocated_by_name: profileField(
    "Truck Allocated By",
    "truck_allocated_by",
    "truck_allocated_by_name",
  ),
  tms_done_by_name: profileField(
    "TMS Done By",
    "tms_done_by",
    "tms_done_by_name",
  ),
  ...stopScalars,
  delivery_status: deliveryStatus,
  customer_name: customer,
  store_name: store,
  ship_to: store,
  ...lineItemScalars,
  product_name: lineProduct,
  sku: lineProduct,
  model_code: lineProduct,
  product_model: lineProduct,
  dr: lineItemScalars.dr_number,
  remarks: tripField("Remarks", "remarks"),
  warehouse_departure_time: tripField(
    "Warehouse Departure",
    "departure_from_warehouse_at",
    "date",
  ),
};

const REPORT_EDITING: Record<
  ReportKey,
  Record<string, ReportEditDefinition>
> = {
  combined: commonTrip,
  "dispatch-monitoring": commonTrip,
  dispatch: commonTrip,
  "trip-booking": commonTrip,
  "store-calling": {
    status: {
      label: "Call Status",
      sourceEntity: "storeCall",
      sourceField: "status",
      editor: "status",
      recordIdField: "store_call_id",
      dropdownField: "store_call_status",
    },
    confirmation_status: {
      label: "Confirmation Status",
      sourceEntity: "storeCall",
      sourceField: "confirmation_status",
      editor: "status",
      recordIdField: "store_call_id",
      dropdownField: "confirmation_status",
    },
    ...storeCallScalars,
  },
};

export function getReportEditDefinition(
  reportKey: ReportKey,
  columnKey: string,
): ReportEditDefinition | null {
  return REPORT_EDITING[reportKey][columnKey] ?? null;
}
