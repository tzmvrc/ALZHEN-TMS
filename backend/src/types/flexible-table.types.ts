export type FlexValueType = "TEXT" | "NUMBER" | "DATE" | "DATETIME" | "BOOLEAN";
export type FlexInputMode = "TEXT" | "DROPDOWN" | "NUMBER" | "DATE" | "DATETIME" | "BOOLEAN";
export type FlexBindingScope = "CUSTOM_ROW" | "TRIP" | "STOP" | "LINE_ITEM" | "ASSIGNMENT" | "BILLING" | "STORE_CALL";
export type FlexPermissionLevel = "view" | "edit" | "manage";

export type FlexAccess = {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  isOwner: boolean;
  isAdmin: boolean;
};

export type FlexActor = {
  id: string;
  role: string;
};

export type FlexCellDto = {
  id: string;
  row_id: string;
  column_id: string;
  value: unknown;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};
