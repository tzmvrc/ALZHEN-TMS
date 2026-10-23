/** Explicit, shared import aliases. Identifier fields remain distinct. */
export const IMPORT_COLUMN_DEFINITIONS = [
  {
    "field": "sp_reference",
    "label": "SP",
    "csvField": "sp",
    "aliases": [
      "SP",
      "SP No.",
      "SP Number"
    ],
    "source": true
  },
  {
    "field": "ph_truck_reference",
    "label": "PH Truck Reference",
    "csvField": "phTruck",
    "aliases": [
      "PHTRRUCK",
      "PHTRUCK",
      "PH TRUCK NAME",
      "PH Truck Reference",
      "TRUCK NAME"
    ],
    "source": true
  },
  {
    "field": "dn_reference",
    "label": "DN",
    "csvField": "dn",
    "aliases": [
      "DN",
      "DN No.",
      "DN Number",
      "Delivery Number"
    ],
    "source": true
  },
  {
    "field": "dr_number",
    "label": "DR",
    "csvField": "dr",
    "aliases": [
      "DR",
      "DR No.",
      "DR Number"
    ],
    "source": true
  },
  {
    "field": "order_item_number",
    "label": "Order Item No.",
    "csvField": "orderItem",
    "aliases": [
      "order item no",
      "order item number"
    ],
    "source": true
  },
  {
    "field": "customer_name",
    "label": "Customer Name",
    "csvField": "customer",
    "aliases": [
      "customer name",
      "customer"
    ],
    "source": true,
    "required": true
  },
  {
    "field": "ship_to",
    "label": "Ship To",
    "csvField": "store",
    "aliases": [
      "ship to",
      "ship-to",
      "ship_to",
      "ship to name",
      "ship to / destination",
      "store",
      "store name",
      "destination",
      "destination name",
      "delivery destination",
      "delivered to"
    ],
    "source": true,
    "required": true
  },
  {
    "field": "sap_so_number",
    "label": "SAP SO No.",
    "csvField": "sapSo",
    "aliases": [
      "SAP SO No.",
      "SAP SO",
      "SAP SO Number"
    ],
    "source": true
  },
  {
    "field": "so_number",
    "label": "SO NO.",
    "csvField": "so",
    "aliases": [
      "SO NO.",
      "SO Number"
    ],
    "source": true
  },
  {
    "field": "customer_po_number",
    "label": "Customer PO",
    "csvField": "customerPo",
    "aliases": [
      "Customer PO",
      "Customer PO Number"
    ],
    "source": true
  },
  {
    "field": "internal_po_number",
    "label": "PO NO.",
    "csvField": "po",
    "aliases": [
      "PO NO.",
      "PO Number",
      "Internal PO Number"
    ],
    "source": true
  },
  {
    "field": "product_category",
    "label": "Product Category",
    "csvField": "category",
    "aliases": [
      "product category",
      "category"
    ],
    "source": true
  },
  {
    "field": "province",
    "label": "Province",
    "csvField": "province",
    "aliases": [
      "province"
    ],
    "source": true
  },
  {
    "field": "city",
    "label": "City",
    "csvField": "city",
    "aliases": [
      "city"
    ],
    "source": true
  },
  {
    "field": "customer_model",
    "label": "Customer Model",
    "csvField": "product",
    "aliases": [
      "customer model",
      "model code",
      "product model"
    ],
    "source": true
  },
  {
    "field": "quantity",
    "label": "Qty",
    "csvField": "qty",
    "aliases": [
      "qty",
      "quantity"
    ],
    "source": true
  },
  {
    "field": "stock_quantity",
    "label": "stocks",
    "csvField": "stocks",
    "aliases": [
      "stocks",
      "Stock Quantity"
    ],
    "source": true
  },
  {
    "field": "source_warehouse",
    "label": "Warehouse",
    "csvField": "warehouse",
    "aliases": [
      "Warehouse",
      "WH Code",
      "Warehouse Code"
    ],
    "source": true
  },
  {
    "field": "unit_cbm",
    "label": "CBM",
    "csvField": "unitCbm",
    "aliases": [
      "CBM",
      "Unit CBM"
    ],
    "source": true
  },
  {
    "field": "cbm",
    "label": "Total CBM",
    "csvField": "cbm",
    "aliases": [
      "total cbm"
    ],
    "source": true
  },
  {
    "field": "so_approval_date",
    "label": "SO Approval Date",
    "csvField": "approvalDate",
    "aliases": [
      "so approval date"
    ],
    "source": true
  },
  {
    "field": "item_status",
    "label": "Item Status",
    "csvField": "itemStatus",
    "aliases": [
      "Item Status"
    ],
    "source": true
  },
  {
    "field": "page_no",
    "label": "Page No.",
    "csvField": "pageNo",
    "aliases": [
      "page no",
      "page number"
    ]
  },
  {
    "field": "dispatch_number",
    "label": "Dispatch no.",
    "csvField": "dispatch",
    "aliases": [
      "dispatch no",
      "dispatch number"
    ]
  },
  {
    "field": "added_to_report",
    "label": "Added to report?",
    "csvField": "addedToReport",
    "aliases": [
      "added to report"
    ]
  },
  {
    "field": "remarks",
    "label": "Comments",
    "csvField": "notes",
    "aliases": [
      "remarks",
      "comments"
    ]
  },
  {
    "field": "trip_type",
    "label": "Trip type",
    "csvField": "tripType",
    "aliases": [
      "trip type"
    ]
  },
  {
    "field": "letter_status",
    "label": "Letter status",
    "csvField": "letterStatus",
    "aliases": [
      "letter status"
    ]
  },
  {
    "field": "plate_number",
    "label": "Plate no.",
    "csvField": "plate",
    "aliases": [
      "plate no",
      "plate number"
    ]
  },
  {
    "field": "trucking_company",
    "label": "Trucker GC Name",
    "csvField": "truckerGc",
    "aliases": [
      "trucker gc name",
      "trucking company"
    ]
  },
  {
    "field": "trip_number",
    "label": "Trip no.",
    "csvField": "trip",
    "aliases": [
      "trip no",
      "trip number"
    ]
  },
  {
    "field": "request_received_at",
    "label": "Email date",
    "csvField": "emailDate",
    "aliases": [
      "email date"
    ]
  },
  {
    "field": "added_by_name",
    "label": "Added by",
    "csvField": "addedBy",
    "aliases": [
      "added by"
    ]
  },
  {
    "field": "warehouse_code",
    "label": "WH CODE",
    "csvField": "whCode",
    "aliases": []
  },
  {
    "field": "ship_from",
    "label": "Ship From",
    "csvField": "shipFrom",
    "aliases": [
      "ship from"
    ]
  },
  {
    "field": "incident_date",
    "label": "Incident Date",
    "csvField": "incidentDate",
    "aliases": [
      "incident date"
    ]
  },
  {
    "field": "backload_reason",
    "label": "Backload Reason",
    "csvField": "backloadReason",
    "aliases": [
      "backload reason"
    ]
  },
  {
    "field": "backload_number_of_boxes",
    "label": "No. of Box (Backload)",
    "csvField": "backloadBoxes",
    "aliases": [
      "no of box backload",
      "backload boxes"
    ]
  },
  {
    "field": "ir_status",
    "label": "IR Status",
    "csvField": "irStatus",
    "aliases": [
      "ir status"
    ]
  },
  {
    "field": "ir_submitted_date",
    "label": "IR Submitted Date",
    "csvField": "irSubmittedDate",
    "aliases": [
      "ir submitted date"
    ]
  },
  {
    "field": "backload_comments",
    "label": "Backload comments",
    "csvField": "backloadComments",
    "aliases": [
      "backload comments"
    ]
  },
  {
    "field": "offload_number_of_boxes",
    "label": "No. of Box (Offload)",
    "csvField": "offloadBoxes",
    "aliases": [
      "no of box offload",
      "offload boxes"
    ]
  },
  {
    "field": "offload_reason",
    "label": "Offload Reason",
    "csvField": "offloadReason",
    "aliases": [
      "offload reason"
    ]
  },
  {
    "field": "delivery_status",
    "label": "Delivery status",
    "csvField": "deliveryStatus",
    "aliases": [
      "delivery status"
    ]
  },
  {
    "field": "finish_unloading_time",
    "label": "Delivery completed date",
    "csvField": "deliveryCompleted",
    "aliases": [
      "delivery completed date"
    ]
  },
  {
    "field": "pod_status",
    "label": "POD status",
    "csvField": "podStatus",
    "aliases": [
      "pod status"
    ]
  },
  {
    "field": "signed_dr_upload_date",
    "label": "Signed DR uploading date to Google Drive",
    "csvField": "signedDrDate",
    "aliases": [
      "signed dr uploading date to google drive",
      "signed dr upload date"
    ]
  },
  {
    "field": "transmittal_date",
    "label": "Transmittal date",
    "csvField": "transmittalDate",
    "aliases": [
      "transmittal date"
    ]
  },
  {
    "field": "tms_date",
    "label": "TMS date",
    "csvField": "tmsDate",
    "aliases": [
      "tms date"
    ]
  },
  {
    "field": "tms_done_by_name",
    "label": "TMS done by",
    "csvField": "tmsDoneBy",
    "aliases": [
      "tms done by"
    ]
  },
  {
    "field": "pod_ac_shipping_date",
    "label": "POD/AC shipping date",
    "csvField": "podShippingDate",
    "aliases": [
      "pod ac shipping date"
    ]
  },
  {
    "field": "lbc_tracking_number",
    "label": "LBC tracking no.",
    "csvField": "lbcTracking",
    "aliases": [
      "lbc tracking no",
      "lbc tracking number"
    ]
  },
  {
    "field": "pod_remarks",
    "label": "POD comments",
    "csvField": "podComments",
    "aliases": [
      "pod comments",
      "pod remarks"
    ]
  },
  {
    "field": "invoice_number",
    "label": "Invoice no.",
    "csvField": "invoice",
    "aliases": [
      "invoice no",
      "invoice number"
    ]
  }
];
export const SOURCE_FIELD_LABELS = Object.fromEntries(IMPORT_COLUMN_DEFINITIONS.filter(column => column.source).map(column => [column.field, column.label]));
export const normalizeColumnName = value => String(value).normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const fields = new Set(IMPORT_COLUMN_DEFINITIONS.map(column => column.field));
const aliases = new Map();
for (const column of IMPORT_COLUMN_DEFINITIONS) for (const alias of column.aliases) {
  const normalized = normalizeColumnName(alias), matches = aliases.get(normalized) ?? new Set();
  matches.add(column.field); aliases.set(normalized, matches);
}
export const columnCandidates = headers => headers.map(header => [...(aliases.get(normalizeColumnName(header)) ?? [])]);
export const detectColumnAssignments = headers => columnCandidates(headers).map(matches => matches.length === 1 ? matches[0] : null);
export function mappingConflicts(headers, assignments) {
  const errors = [];
  if (!Array.isArray(assignments) || assignments.length !== headers.length) return ["The column mapping does not match this file's headers."];
  const seen = new Map();
  for (const [index, field] of assignments.entries()) {
    if (field == null) continue;
    if (!fields.has(field)) { errors.push(`Unknown destination for ${headers[index] || `Column ${index + 1}`}.`); continue; }
    if (seen.has(field)) errors.push(`${headers[seen.get(field)]} and ${headers[index]} both map to ${IMPORT_COLUMN_DEFINITIONS.find(column => column.field === field).label}. Choose one source and preserve the other as unmapped data.`);
    else seen.set(field, index);
  }
  return errors;
}
export function mappingFromAssignments(headers, assignments) {
  const mapping = Object.fromEntries(IMPORT_COLUMN_DEFINITIONS.map(column => [column.field, -1]));
  const counts = new Map();
  for (const field of assignments) if (field != null) counts.set(field, (counts.get(field) ?? 0) + 1);
  for (const [index, field] of assignments.entries()) if (index < headers.length && fields.has(field) && counts.get(field) === 1) mapping[field] = index;
  return mapping;
}
