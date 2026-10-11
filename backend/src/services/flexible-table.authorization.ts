import { ApiError } from "../utils/api-response.js";
import type { FlexAccess, FlexActor } from "../types/flexible-table.types.js";

type PermissionRow = {
  subject_type: string;
  subject_role: string | null;
  subject_profile_id: string | null;
  can_view: boolean;
  can_edit: boolean;
  can_manage: boolean;
};

export function calculateFlexAccess(actor: FlexActor, creatorId: string | null, permissions: readonly PermissionRow[]): FlexAccess {
  const isAdmin = actor.role === "ADMIN";
  const isOwner = creatorId === actor.id;
  const matching = permissions.filter((permission) =>
    (permission.subject_type === "ROLE" && permission.subject_role === actor.role) ||
    (permission.subject_type === "PROFILE" && permission.subject_profile_id === actor.id),
  );
  return {
    isAdmin,
    isOwner,
    canView: isAdmin || isOwner || matching.some((permission) => permission.can_view),
    canEdit: isAdmin || isOwner || matching.some((permission) => permission.can_edit),
    canManage: isAdmin || isOwner || matching.some((permission) => permission.can_manage),
  };
}

export function assertFlexAccess(access: FlexAccess, level: "view" | "edit" | "manage"): void {
  if (access.isAdmin) return;
  if (!access.canView || (level !== "view" && !access.canEdit) || (level === "manage" && !access.canManage)) {
    throw new ApiError("You do not have permission to perform this action on the table.", 403, "FLEX_TABLE_FORBIDDEN");
  }
}

export function assertCellParentTables(tableId: string, rowTableId: string, columnTableId: string): void {
  if (rowTableId !== tableId || columnTableId !== tableId || rowTableId !== columnTableId) {
    throw new ApiError("Cell row and column must belong to the same flexible table.", 409, "FLEX_CELL_TABLE_MISMATCH");
  }
}
