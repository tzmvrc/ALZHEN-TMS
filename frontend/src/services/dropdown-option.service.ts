import {
  apiGetCached,
  apiPatch,
  apiPost,
  invalidateApiCache,
  type ApiResponse,
} from "./api.service";

export type DropdownField =
  | "trip_status"
  | "delivery_status"
  | "letter_status"
  | "store_call_status"
  | "confirmation_status";

export type DropdownOption = {
  id: string;
  field_key: DropdownField;
  option_value: string;
  display_label: string;
  sort_order: number;
  active: boolean;
  is_system: boolean;
  usage_count: number;
  color?: string | null;
};

function unwrap<T>(response: ApiResponse<T>, fallback: string): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.message ?? fallback);
  }
  return response.data;
}

export async function fetchDropdownOptions(
  token: string,
): Promise<DropdownOption[]> {
  const response = await apiGetCached<ApiResponse<DropdownOption[]>>(
    "/dropdown-options",
    token,
    60_000,
  );
  return unwrap(response, "Unable to load dropdown options.");
}

export async function addDropdownOption(
  token: string,
  input: {
    field_key: DropdownField;
    option_value: string;
    display_label: string;
    color?: string | null;
    sort_order?: number;
  },
): Promise<DropdownOption> {
  const response = await apiPost<ApiResponse<DropdownOption>>(
    "/dropdown-options",
    input,
    token,
  );
  const option = unwrap(response, "Unable to add dropdown option.");
  invalidateApiCache("/dropdown-options");
  return option;
}

export async function editDropdownOption(
  token: string,
  optionId: string,
  input: {
    display_label?: string;
    color?: string | null;
    sort_order?: number;
    active?: boolean;
    confirm_in_use?: boolean;
    remove_if_unused?: boolean;
  },
): Promise<DropdownOption> {
  const response = await apiPatch<ApiResponse<DropdownOption>>(
    `/dropdown-options/${encodeURIComponent(optionId)}`,
    input,
    token,
  );
  const option = unwrap(response, "Unable to update dropdown option.");
  invalidateApiCache("/dropdown-options");
  return option;
}

/** Internal key generation; display labels remain the only user input. */
export function dropdownStoredValue(label:string){const normalized=label.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9 _-]+/g,"_").replace(/^[^A-Z0-9]+/,"").trim().slice(0,60);let hash=2166136261;for(const character of label.normalize("NFKC").trim().toLocaleLowerCase()){hash=Math.imul(hash^character.charCodeAt(0),16777619);}return normalized||`OPTION_${(hash>>>0).toString(16).toUpperCase()}`;}
