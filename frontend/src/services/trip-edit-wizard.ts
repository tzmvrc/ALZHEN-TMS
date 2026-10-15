import type { ReportEditDefinition } from "./report-editing.config";

export const TRIP_EDIT_STEPS = ["Trip Info", "Assignment", "Delivery / DR", "Review"] as const;
type Field = { value: string; originalValue: string; relationshipId?: string; originalRelationshipId?: string; definition: ReportEditDefinition };
export function tripEditFieldStep(definition: ReportEditDefinition): number {
  if (definition.sourceEntity === "assignment" || definition.sourceField === "truck_allocated_by") return 1;
  if (definition.sourceEntity === "lineItem") return 2;
  if (definition.sourceEntity === "stop" && !["customer_id", "store_id", "stop_sequence", "dispatch_number", "transaction_number"].includes(definition.sourceField)) return 2;
  if (/remarks|transmittal|pod_|signed_dr|lbc_|tms_date/.test(definition.sourceField)) return 2;
  return 0;
}
export function tripEditFieldChanged(field: Field) {
  return field.value.trim() !== field.originalValue.trim() || (field.definition.editor === "relationship" && field.relationshipId !== field.originalRelationshipId);
}
export function validateTripEditField(field: Field): string | null {
  if (!tripEditFieldChanged(field)) return null;
  const value = field.value.trim();
  const { definition } = field;
  if (definition.required && !value) return `${definition.label} cannot be blank.`;
  if (definition.editor === "relationship" && !field.relationshipId && !(definition.sourceField === "store_id" && !value)) return `Choose a valid ${definition.label}.`;
  if (definition.editor === "number" && value) {
    if (!Number.isFinite(Number(value))) return `${definition.label} must be numeric.`;
    if (definition.sourceEntity === "stop" && ["quantity", "total_cbm"].includes(definition.sourceField)) {
      const scale = definition.sourceField === "quantity" ? 3 : 6;
      if (!new RegExp(`^\\d{1,${18 - scale}}(?:\\.\\d{1,${scale}})?$`).test(value)) return `${definition.label} must be non-negative with at most ${scale} decimal places.`;
    }
  }
  if (["date", "datetime"].includes(definition.editor) && value && Number.isNaN(new Date(value).getTime())) return `Enter a valid ${definition.label}.`;
  if (definition.sourceField === "dr_number" && definition.sourceEntity === "stop" && value.length > 100) return "DR Number must be at most 100 characters.";
  return null;
}
