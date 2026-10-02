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
    sort_order?: number;
    active?: boolean;
    confirm_in_use?: boolean;
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
