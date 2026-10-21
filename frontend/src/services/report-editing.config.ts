import type { DropdownField } from "./dropdown-option.service";
import type { RelationshipKind } from "./lookup.service";
import type { ReportKey } from "./report.service";

export type ReportEditTarget =
  | "trip"
  | "stop"
  | "lineItem"
  | "assignment"
  | "billing"
  | "storeCall"
  | "loadingReport";
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
    customerIdField?: string;
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
    labelField: "trucking_company",
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
    customerIdField: "customer_id",
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
const productCategory: ReportEditDefinition = {
  ...lineProduct,
  label: "Product category",
};
const billingInvoice: ReportEditDefinition = {
  label: "Invoice Number",
  sourceEntity: "billing",
  sourceField: "invoice_number",
  editor: "text",
  recordIdField: "billing_id",
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
  editor: "text" | "number" | "date" = "text",
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
  trip_number: tripField("Trip Number", "trip_number", "number"),
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
  lbc_tracking_number: tripField("LBC Tracking Number", "lbc_tracking_number"),
  page_no: tripField("Page Number", "page_no", "number"),
};

const stopScalars: Record<string, ReportEditDefinition> = {
  dispatch_number: stopField("Dispatch Number", "dispatch_number"),
  transaction_number: stopField("Transaction Number", "transaction_number"),
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
  stop_sequence: stopField("Stop Sequence", "stop_sequence", "number"),
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
  store_name: {
    label: "Store",
    sourceEntity: "stop",
    sourceField: "store_id",
    editor: "relationship",
    recordIdField: "trip_stop_id",
    relationship: {
      kind: "stores",
      idField: "store_id",
      labelField: "store_name",
      customerIdField: "customer_id",
    },
  },
  dispatch_number: stopScalars.dispatch_number,
  transaction_number: stopScalars.transaction_number,
  customer_name: customer,
  driver_name: driver,
  plate_number: truck,
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
  stop_sequence: stopScalars.stop_sequence,
  delivery_status: deliveryStatus,
  customer_name: customer,
  store_name: store,
  ship_to: store,
  ...lineItemScalars,
  category: productCategory,
  product_category: productCategory,
  product_name: lineProduct,
  sku: lineProduct,
  model_code: lineProduct,
  product_model: lineProduct,
  remarks: tripField("Remarks", "remarks"),
};

const REPORT_EDITING: Record<
  ReportKey,
  Record<string, ReportEditDefinition>
> = {
  combined: commonTrip,
  "dispatch-monitoring": {
    dispatch_number: stopScalars.dispatch_number,
    transaction_number: stopScalars.transaction_number,
    loading_date: tripScalars.loading_date,
    trip_status: tripStatus,
    letter_status: letterStatus,
    warehouse_code: warehouse,
    warehouse_name: warehouse,
    driver_name: driver,
    plate_number: truck,
    trucking_company: truckingCompany,
    delivery_status: deliveryStatus,
    customer_name: customer,
    store_name: store,
    stop_sequence: stopScalars.stop_sequence,
    arrival_time: stopScalars.arrival_time,
    start_unloading_time: stopScalars.start_unloading_time,
    finish_unloading_time: stopScalars.finish_unloading_time,
    departure_time: stopScalars.departure_time,
    remarks: tripField("Remarks", "remarks"),
    trip_number: tripScalars.trip_number,
    added_to_report: tripScalars.added_to_report,
    truck_allocated_by_name: profileField(
      "Truck Allocated By",
      "truck_allocated_by",
      "truck_allocated_by_name",
    ),
    subcon_rate_manual: tripScalars.subcon_rate_manual,
    signed_dr_upload_date: tripScalars.signed_dr_upload_date,
    transmittal_date: tripScalars.transmittal_date,
    tms_date: tripScalars.tms_date,
    tms_done_by_name: profileField(
      "TMS Done By",
      "tms_done_by",
      "tms_done_by_name",
    ),
    pod_ac_shipping_date: tripScalars.pod_ac_shipping_date,
    lbc_tracking_number: tripScalars.lbc_tracking_number,
  },
  dispatch: {
    dispatch_number: stopScalars.dispatch_number,
    loading_date: tripScalars.loading_date,
    estimated_delivery_date: tripScalars.estimated_delivery_date,
    wh_code: warehouse,
    ship_from: warehouse,
    ship_to: store,
    customer_name: customer,
    driver_name: driver,
    plate_number: truck,
    trucking_company: truckingCompany,
    product_model: lineProduct,
    category: productCategory,
    dr_number: lineItemScalars.dr_number,
    customer_model: lineItemScalars.customer_model,
    sap_so_number: lineItemScalars.sap_so_number,
    customer_po_number: lineItemScalars.customer_po_number,
    internal_po_number: lineItemScalars.internal_po_number,
    quantity: lineItemScalars.quantity,
    cbm: lineItemScalars.cbm,
    trip_number: tripScalars.trip_number,
    transaction_number: stopScalars.transaction_number,
    added_to_report: tripScalars.added_to_report,
    subcon_rate_manual: tripScalars.subcon_rate_manual,
    remarks: tripField("Remarks", "remarks"),
    arrival_time: stopScalars.arrival_time,
    start_unloading_time: stopScalars.start_unloading_time,
    finish_unloading_time: stopScalars.finish_unloading_time,
    departure_time: stopScalars.departure_time,
    signed_dr_upload_date: tripScalars.signed_dr_upload_date,
    transmittal_date: tripScalars.transmittal_date,
    tms_date: tripScalars.tms_date,
    pod_ac_shipping_date: tripScalars.pod_ac_shipping_date,
    lbc_tracking_number: tripScalars.lbc_tracking_number,
    tms_done_by_name: profileField(
      "TMS Done By",
      "tms_done_by",
      "tms_done_by_name",
    ),
    delivery_status: deliveryStatus,
    letter_status: letterStatus,
  },
  "trip-booking": {
    dispatch_number: tripScalars.dispatch_number,
    trip_number: tripScalars.trip_number,
    loading_date: tripScalars.loading_date,
    warehouse_name: warehouse,
    store_name: store,
    trucking_company: truckingCompany,
    driver_name: driver,
    plate_number: truck,
    customer_name: customer,
    dr_number: lineItemScalars.dr_number,
    invoice_number: billingInvoice,
    customer_po_number: lineItemScalars.customer_po_number,
    internal_po_number: lineItemScalars.internal_po_number,
    sku: lineProduct,
    model_code: lineProduct,
    product_name: lineProduct,
    quantity: lineItemScalars.quantity,
    cbm: lineItemScalars.cbm,
    customer_model: lineItemScalars.customer_model,
    transaction_number: stopScalars.transaction_number,
    trip_type: tripType,
    trip_status: tripStatus,
    delivery_status: deliveryStatus,
    letter_status: letterStatus,
    estimated_delivery_date: tripScalars.estimated_delivery_date,
    warehouse_code: warehouse,
    stop_sequence: stopScalars.stop_sequence,
    added_to_report: tripScalars.added_to_report,
    truck_allocated_by_name: profileField(
      "Truck Allocated By",
      "truck_allocated_by",
      "truck_allocated_by_name",
    ),
    product_category: productCategory,
    subcon_rate_manual: tripScalars.subcon_rate_manual,
    signed_dr_upload_date: tripScalars.signed_dr_upload_date,
    transmittal_date: tripScalars.transmittal_date,
    tms_date: tripScalars.tms_date,
    tms_done_by_name: profileField(
      "TMS Done By",
      "tms_done_by",
      "tms_done_by_name",
    ),
    pod_ac_shipping_date: tripScalars.pod_ac_shipping_date,
    lbc_tracking_number: tripScalars.lbc_tracking_number,
    sap_so_number: lineItemScalars.sap_so_number,
    remarks: tripField("Remarks", "remarks"),
  },
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
    ship_to: store,
  },
};

export function getReportEditDefinition(
  reportKey: ReportKey,
  columnKey: string,
  row?: Record<string, unknown>,
): ReportEditDefinition | null {
  if (columnKey === "trip_number" || columnKey === "trip_reference") return null;
  if (columnKey === "dispatch_number") return tripScalars.dispatch_number;
  if (columnKey === "stop_dispatch_reference") return row?.trip_stop_id || row?._trip_stop_id ? stopScalars.dispatch_number : null;
  if(["issue_report_type","issue_reason"].includes(columnKey)&&["combined","dispatch-monitoring","dispatch","trip-booking"].includes(reportKey)){const field=columnKey==="issue_report_type"?"spreadsheet_issue_type":"spreadsheet_issue_reason";return row?.trip_stop_id||row?._trip_stop_id?stopField(columnKey==="issue_report_type"?"Issue / Report Type":"Reason",field):tripField(columnKey==="issue_report_type"?"Issue / Report Type":"Reason",field); }
  if (["combined", "dispatch", "dispatch-monitoring"].includes(reportKey) && ["loading_start_at", "loading_finished_at"].includes(columnKey)) {
    return {label: columnKey === "loading_start_at" ? "Loading Start" : "Loading Finish", sourceEntity: "loadingReport", sourceField: columnKey, editor: "datetime", recordIdField: "loading_report_id"};
  }
  if (["combined", "dispatch-monitoring"].includes(reportKey)) {
    const fields: Record<string, ReportEditDefinition> = {
      transaction_dr_number: stopField("Transaction DR Number", "dr_number"),
      transaction_quantity: stopField("Transaction Quantity", "quantity", "number"),
      transaction_total_cbm: stopField("Total CBM", "total_cbm", "number"),
      transmittal_ref: stopField("Transmittal Reference", "transmittal_ref"),
    };
    if (fields[columnKey]) return columnKey === "transmittal_ref" && row?.transmittal_ref_conflict ? null : fields[columnKey];
  }
  if (row && columnKey === "transaction_number") {
    // Stop rows display their own saved identifiers in the live report views.
    if (row.trip_stop_id || row._trip_stop_id) {
      return stopScalars[columnKey];
    }
    return tripScalars[columnKey] ?? null;
  }
  return REPORT_EDITING[reportKey][columnKey] ?? null;
}
